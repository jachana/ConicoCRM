#!/usr/bin/env python3
"""
Autonomous Trello-driven implementation loop.

For each iteration:
  1. Pull Trello -> JSON.
  2. Triage open "Feature requests" via LLM (Straico -> OpenRouter fallback).
     Each card scored 1-10 difficulty + suggested implementer model
     (haiku|sonnet|opus). Cheapest wins.
  3. Claim the easiest: list -> "In progress", --apply, commit "chore(trello): claim ...".
  4. Checkout target branch (default: master).
  5. Spawn `claude` CLI subprocess with task prompt + suggested model.
     CLI uses the user's logged-in subscription (no API credits).
  6. Run full test suite (backend pytest + frontend vitest + build).
  7. On pass: link last commit -> card, list -> "In review", --apply, push.
     On fail: git reset --hard <pre-sha> (reflog preserves work);
              card -> back to "Feature requests" with failure note appended.
  8. Repeat until no eligible cards or --max reached.

Usage:
  python scripts/auto_loop.py                              # run on master, until done
  python scripts/auto_loop.py --branch dev                 # use a different branch
  python scripts/auto_loop.py --max 3                      # cap iterations
  python scripts/auto_loop.py --triage-model qwen-coder    # default
  python scripts/auto_loop.py --provider openrouter        # force fallback
  python scripts/auto_loop.py --dry-run                    # triage + plan only, no work
  python scripts/auto_loop.py --skip-tests                 # commit without running suite (UNSAFE)
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

import trello_sync as ts


IS_WIN = platform.system() == "Windows"
NPM = "npm.cmd" if IS_WIN else "npm"
BASH = shutil.which("bash") or "bash"


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
CARDS_FILE = SCRIPT_DIR / "trello_cards.json"
LOG_DIR = REPO_ROOT / ".claude" / "auto_loop_logs"

ELIGIBLE_LIST = "Feature requests"
CLAIMED_LIST = "In progress"
SHIPPED_LIST = "In review"
SKIP_LABELS = {"Blocked"}

DEFAULT_TRIAGE_MODEL = "qwen-coder"
DEFAULT_PROVIDER = "auto"  # straico -> openrouter
DEFAULT_IMPLEMENTER_MODEL = "sonnet"

CLAUDE_CLI = shutil.which("claude") or "claude"


# ----------------------------- triage prompt ------------------------------ #

TRIAGE_SYSTEM = """You are a senior engineer triaging Trello cards for an autonomous coding agent.

Project: Conico CRM (Chilean SaaS). Stack: FastAPI + SQLAlchemy + Alembic backend, React + Vite + TS frontend.

For each card, estimate IMPLEMENTATION DIFFICULTY (1-10):
  1-3  trivial: copy-tweaks, single-field add, isolated bugfix, label change
  4-5  small: one new endpoint or one component, no DB migration, clear scope
  6-7  medium: new model + migration + UI, multi-file, well-specified
  8-9  large: cross-cutting, multiple modules, ambiguous, integrations (SII, payments)
  10   spike: research-heavy, unclear scope, blocked on external decisions

Suggest implementer MODEL based on difficulty:
  1-4  -> "haiku"
  5-7  -> "sonnet"
  8-10 -> "opus"

Mark FEASIBLE=false if:
  - card has no description or no checklist (can't act on it)
  - external dependency / waiting on user input
  - touches secrets, prod data migration, or destructive ops
  - explicitly UI-design driven without spec

Output strict JSON ONLY: {"cards": [{"name", "difficulty", "model", "feasible", "reason"}]}.
Names verbatim from input. One entry per input card, same order.
"""

TRIAGE_USER_TEMPLATE = """Triage these cards (return JSON object only):

{payload}
"""


# ----------------------------- helpers ----------------------------------- #


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:60]


def run(cmd: list[str], cwd: Path | None = None, check: bool = True,
        capture: bool = False, env: dict | None = None) -> subprocess.CompletedProcess:
    print(f"  $ {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=str(cwd or REPO_ROOT), check=check,
                          capture_output=capture, text=True, env=env)


def git(*args: str, capture: bool = False) -> str:
    r = subprocess.run(["git", *args], cwd=str(REPO_ROOT),
                       capture_output=True, text=True, check=True)
    return r.stdout.strip() if capture else ""


def git_head() -> str:
    return git("rev-parse", "HEAD", capture=True)


def git_dirty() -> bool:
    r = subprocess.run(["git", "status", "--porcelain"], cwd=str(REPO_ROOT),
                       capture_output=True, text=True, check=True)
    return bool(r.stdout.strip())


def load_spec() -> dict:
    return json.loads(CARDS_FILE.read_text(encoding="utf-8"))


def save_spec(spec: dict) -> None:
    CARDS_FILE.write_text(
        json.dumps(spec, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def find_card(spec: dict, name: str) -> dict | None:
    return next((c for c in spec["cards"] if c["name"] == name), None)


# ------------------------------ triage ----------------------------------- #


def candidates(spec: dict) -> list[dict]:
    out = []
    for c in spec["cards"]:
        if c["list"] != ELIGIBLE_LIST:
            continue
        if any(l in SKIP_LABELS for l in c.get("labels", [])):
            continue
        if not (c.get("desc") or "").strip():
            continue
        if not c.get("checklist"):
            continue
        out.append(c)
    return out


def triage(cards: list[dict], model_alias: str, provider: str) -> list[dict]:
    payload = [
        {"name": c["name"], "labels": c.get("labels", []),
         "desc": c.get("desc", ""), "checklist": c.get("checklist", [])}
        for c in cards
    ]
    user_msg = TRIAGE_USER_TEMPLATE.format(
        payload=json.dumps(payload, ensure_ascii=False, indent=2)
    )

    spec_stub = {
        "cards": [],
        "lists": [ELIGIBLE_LIST],
        "labels": {},
    }

    def _override(_bare, _spec):
        return TRIAGE_SYSTEM, user_msg

    orig = ts._build_prompt
    ts._build_prompt = _override
    try:
        result = ts.call_llm(payload, spec_stub, model_alias, provider=provider)
    finally:
        ts._build_prompt = orig

    if isinstance(result, dict) and "cards" in result:
        result = result["cards"]
    return result


def pick_easiest(triaged: list[dict]) -> dict | None:
    feasible = [t for t in triaged if t.get("feasible", True)
                and isinstance(t.get("difficulty"), (int, float))]
    if not feasible:
        return None
    feasible.sort(key=lambda t: t["difficulty"])
    return feasible[0]


# --------------------------- implementer --------------------------------- #


IMPLEMENTER_PROMPT = """You are an autonomous implementer for the Conico CRM project.

TASK: implement the Trello card below. Make ALL the changes (backend, frontend, migrations, tests as needed). When you finish, your code must:
  - pass `cd backend && ./run_tests.sh`
  - pass `cd frontend && npm test -- --run` AND `npm run build`

Work directly on the current branch. Commit your changes with a clear message
referencing the card. You may make multiple commits. Do NOT push — the loop pushes.

Do NOT modify scripts/trello_cards.json or scripts/trello_sync.py — those are managed by the loop.

If you cannot complete the task (missing context, unclear scope, blocker), exit
with a message starting with "ABORT:" and explain. Do not commit half-broken code.

CARD:
{card_json}
"""


def spawn_claude(card: dict, model: str, log_path: Path) -> tuple[int, str]:
    prompt = IMPLEMENTER_PROMPT.format(
        card_json=json.dumps(card, ensure_ascii=False, indent=2)
    )
    cmd = [
        CLAUDE_CLI,
        "-p", prompt,
        "--model", model,
        "--permission-mode", "bypassPermissions",
        "--output-format", "stream-json",
        "--verbose",
    ]
    print(f"  $ claude -p <prompt> --model {model} --permission-mode bypassPermissions")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    last_text = ""
    with log_path.open("w", encoding="utf-8") as f:
        proc = subprocess.Popen(cmd, cwd=str(REPO_ROOT),
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, bufsize=1)
        for line in proc.stdout:
            f.write(line)
            f.flush()
            try:
                obj = json.loads(line)
                if obj.get("type") == "assistant":
                    msg = obj.get("message", {})
                    for block in msg.get("content", []):
                        if block.get("type") == "text":
                            last_text = block.get("text", "")
            except Exception:
                pass
        proc.wait()
    return proc.returncode, last_text


# ------------------------------- tests ----------------------------------- #


def run_tests() -> tuple[bool, str]:
    backend = REPO_ROOT / "backend"
    frontend = REPO_ROOT / "frontend"
    steps: list[tuple[str, list[str], Path]] = []

    if (backend / "run_tests.sh").exists():
        steps.append(("backend pytest", [BASH, "./run_tests.sh"], backend))
    if (frontend / "package.json").exists():
        steps.append(("frontend test", [NPM, "test", "--", "--run"], frontend))
        steps.append(("frontend build", [NPM, "run", "build"], frontend))

    for label, cmd, cwd in steps:
        print(f"  -- {label} --")
        r = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
        if r.returncode != 0:
            tail = (r.stdout + r.stderr)[-2000:]
            return False, f"{label} failed (exit {r.returncode}):\n{tail}"
    return True, "all tests passed"


# ------------------------- trello state mutations ------------------------ #


def trello_apply() -> None:
    board_id = os.environ["TRELLO_BOARD_ID"]
    spec = load_spec()
    ts.apply_spec(spec, board_id, dry_run=False)


def claim(spec: dict, name: str) -> None:
    card = find_card(spec, name)
    if not card:
        raise RuntimeError(f"card not found locally: {name}")
    card["list"] = CLAIMED_LIST
    save_spec(spec)
    trello_apply()
    git("add", str(CARDS_FILE.relative_to(REPO_ROOT)))
    subprocess.run(["git", "commit", "-m", f"chore(trello): claim {name} -> In progress"],
                   cwd=str(REPO_ROOT), check=False)


def ship(spec: dict, name: str, sha: str) -> None:
    card = find_card(spec, name)
    if not card:
        raise RuntimeError(f"card not found locally: {name}")
    commits = [c for c in card.get("commits", []) if c != sha]
    commits.append(sha)
    card["commits"] = commits
    card["list"] = SHIPPED_LIST
    save_spec(spec)
    trello_apply()
    git("add", str(CARDS_FILE.relative_to(REPO_ROOT)))
    subprocess.run(["git", "commit", "-m", f"chore(trello): ship {name} -> In review"],
                   cwd=str(REPO_ROOT), check=False)


def fail(spec: dict, name: str, reason: str) -> None:
    card = find_card(spec, name)
    if not card:
        return
    card["list"] = ELIGIBLE_LIST
    card.setdefault("checklist", []).append(f"[auto-attempt failed] {reason[:140]}")
    save_spec(spec)
    trello_apply()
    git("add", str(CARDS_FILE.relative_to(REPO_ROOT)))
    subprocess.run(["git", "commit", "-m", f"chore(trello): {name} -> back to Feature requests (auto-attempt failed)"],
                   cwd=str(REPO_ROOT), check=False)


# ------------------------------- main ------------------------------------ #


def iteration(args, board_id: str) -> str:
    print("\n=== iteration: pull ===")
    ts.pull(board_id, CARDS_FILE)
    spec = load_spec()

    cands = candidates(spec)
    if not cands:
        print("no eligible cards. stopping.")
        return "done"

    print(f"\n=== triage ({len(cands)} cards via {args.provider}/{args.triage_model}) ===")
    try:
        triaged = triage(cands, args.triage_model, args.provider)
    except Exception as e:
        print(f"triage failed: {e}", file=sys.stderr)
        return "stop"

    for t in triaged:
        print(f"  {t.get('difficulty', '?'):>3}  "
              f"{t.get('model', '?'):<7}  "
              f"feasible={t.get('feasible', True)}  "
              f"{t.get('name', '?')[:80]}")

    pick = pick_easiest(triaged)
    if not pick:
        print("no feasible cards after triage. stopping.")
        return "done"

    name = pick["name"]
    impl_model = pick.get("model") or DEFAULT_IMPLEMENTER_MODEL
    print(f"\n=== picked: {name}  (difficulty={pick.get('difficulty')}, model={impl_model}) ===")

    if args.dry_run:
        print("--dry-run set, stopping before claim.")
        return "stop"

    if git_dirty():
        print("working tree dirty — aborting.", file=sys.stderr)
        return "stop"

    print("\n=== checkout branch ===")
    git("checkout", args.branch)

    pre_sha = git_head()
    print(f"  pre-attempt sha: {pre_sha}")

    print("\n=== claim card ===")
    claim(spec, name)
    spec = load_spec()
    card = find_card(spec, name)

    print("\n=== spawn claude ===")
    log_path = LOG_DIR / f"{int(time.time())}_{slugify(name)}.log"
    rc, last_text = spawn_claude(card, impl_model, log_path)
    print(f"  claude exit={rc}; log={log_path}")

    if rc != 0 or last_text.strip().upper().startswith("ABORT"):
        print("agent reported failure; rolling back.", file=sys.stderr)
        rollback_to(pre_sha)
        spec = load_spec()
        fail(spec, name, last_text or f"claude exit {rc}")
        return "continue"

    new_sha = git_head()
    if new_sha == pre_sha:
        print("agent made no commits; rolling back.", file=sys.stderr)
        spec = load_spec()
        fail(spec, name, "agent produced no commits")
        return "continue"

    if not args.skip_tests:
        print("\n=== run tests ===")
        ok, msg = run_tests()
        if not ok:
            print(f"tests failed: {msg[:400]}", file=sys.stderr)
            rollback_to(pre_sha)
            spec = load_spec()
            fail(spec, name, msg)
            return "continue"
        print(f"  {msg}")

    print("\n=== ship ===")
    spec = load_spec()
    ship(spec, name, git_head())

    print("\n=== push ===")
    subprocess.run(["git", "push", "origin", args.branch],
                   cwd=str(REPO_ROOT), check=False)

    return "continue"


def rollback_to(sha: str) -> None:
    print(f"  git reset --hard {sha}")
    subprocess.run(["git", "reset", "--hard", sha],
                   cwd=str(REPO_ROOT), check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Autonomous Trello-driven implementation loop")
    parser.add_argument("--branch", default="master")
    parser.add_argument("--max", type=int, default=0, help="0 = unlimited")
    parser.add_argument("--triage-model", default=DEFAULT_TRIAGE_MODEL)
    parser.add_argument("--provider", default=DEFAULT_PROVIDER,
                        choices=["auto", "straico", "openrouter"])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-tests", action="store_true")
    args = parser.parse_args()

    ts.load_dotenv(ts.ENV_FILE)
    missing = [v for v in ("TRELLO_API_KEY", "TRELLO_TOKEN", "TRELLO_BOARD_ID")
               if not os.environ.get(v)]
    if missing:
        print(f"missing env: {', '.join(missing)}", file=sys.stderr)
        return 2
    if not (os.environ.get("STRAICO_API_KEY") or os.environ.get("OPENROUTER_API_KEY")):
        print("need STRAICO_API_KEY or OPENROUTER_API_KEY for triage", file=sys.stderr)
        return 2

    board_id = os.environ["TRELLO_BOARD_ID"]
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    n = 0
    while True:
        if args.max and n >= args.max:
            print(f"\nreached --max={args.max}. stopping.")
            break
        n += 1
        print(f"\n========== iteration {n} ==========")
        status = iteration(args, board_id)
        if status in ("done", "stop"):
            break

    print(f"\nfinished. iterations={n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
