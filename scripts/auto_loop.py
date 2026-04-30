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
from trello_groom import parse_groom_block


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


DIRTY_IGNORE_PREFIXES = (".claude/", "Conico-reportes", "scripts/trello_cards.json")


def git_dirty() -> bool:
    """True if working tree has uncommitted changes outside ignorable paths.

    Ignores `.claude/` (Claude Code internal state) and submodule pointer changes
    so the loop can run when only those are dirty.
    """
    r = subprocess.run(["git", "status", "--porcelain"], cwd=str(REPO_ROOT),
                       capture_output=True, text=True, check=True)
    for line in r.stdout.splitlines():
        path = line[3:].strip().strip('"')
        if any(path.startswith(p) for p in DIRTY_IGNORE_PREFIXES):
            continue
        return True
    return False


def load_spec() -> dict:
    return json.loads(CARDS_FILE.read_text(encoding="utf-8"))


def save_spec(spec: dict) -> None:
    CARDS_FILE.write_text(
        json.dumps(spec, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def find_card(spec: dict, name: str) -> dict | None:
    return next((c for c in spec["cards"] if c["name"] == name), None)


# ----------------------- already-implemented detector -------------------- #

ALREADY_DONE_STOPWORDS = {
    "de", "la", "el", "los", "las", "del", "para", "por", "con", "que",
    "una", "uno", "unos", "unas", "este", "esta", "estos", "estas", "and",
    "the", "for", "from", "with", "into", "onto", "via", "en", "al", "su",
    "sus", "se", "es", "no", "si", "más", "mas", "como", "todo", "todos",
    "card", "feat", "fix", "chore", "feature", "request", "bug", "issue",
    "tag", "tags", "data", "test", "tests", "user", "users",
}

ELIGIBLE_FOR_AUTOSHIP_LISTS = {"Feature requests", "Bugs", "Client feedback"}


def _ascii_lower(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def _significant_tokens(name: str) -> set[str]:
    s = _ascii_lower(name)
    s = re.sub(r"\[[^\]]*\]", " ", s)  # drop bracket prefixes
    return {t for t in re.findall(r"[a-z]{4,}", s)
            if t not in ALREADY_DONE_STOPWORDS}


def _recent_commits(n: int = 200) -> list[tuple[str, str, str]]:
    """Return [(sha, subject, ascii_subject_lower)] for last n commits across all refs."""
    r = subprocess.run(["git", "log", "--all", f"-n{n}", "--pretty=%H%x09%s"],
                       cwd=str(REPO_ROOT), capture_output=True, check=True)
    text = r.stdout.decode("utf-8", errors="replace")
    out = []
    for line in text.splitlines():
        if "\t" not in line:
            continue
        sha, subj = line.split("\t", 1)
        out.append((sha, subj, _ascii_lower(subj)))
    return out


def looks_implemented(card: dict,
                      commits: list[tuple[str, str, str]],
                      min_hits: int = 3,
                      min_ratio: float = 0.6) -> list[tuple[str, str]]:
    """Return commits that look like they implemented this card.

    Requires both an absolute hit threshold AND a high token-overlap ratio,
    so generic commits (e.g. shared infra touching the same module) don't
    falsely match unrelated cards.
    """
    tokens = _significant_tokens(card["name"])
    if len(tokens) < min_hits:
        return []
    matches: list[tuple[str, str]] = []
    for sha, subj, norm in commits:
        if not re.match(r"^(feat|fix)[\(:]", norm):
            continue
        if "trello" in norm or "claim" in norm or "ship" in norm:
            continue
        hits = sum(1 for t in tokens if t in norm)
        if hits >= min_hits and (hits / len(tokens)) >= min_ratio:
            matches.append((sha, subj))
    return matches


def is_test_file(path: str) -> bool:
    p = Path(path)
    if path.startswith("backend/") and path.endswith(".py"):
        return "test_" in p.name or p.name.endswith("_test.py")
    if path.startswith("frontend/") and (".test." in path or ".spec." in path):
        return path.rsplit(".", 1)[-1] in {"ts", "tsx", "js", "jsx"}
    return False


def _files_in_commits(shas: list[str]) -> list[str]:
    out: set[str] = set()
    for sha in shas:
        r = subprocess.run(["git", "show", "--name-only", "--pretty=", sha],
                           cwd=str(REPO_ROOT), capture_output=True, text=True, check=False)
        for line in r.stdout.splitlines():
            line = line.strip()
            if line:
                out.add(line)
    return sorted(out)


def _split_test_files(files: list[str]) -> tuple[list[str], list[str]]:
    backend = [f for f in files
               if f.startswith("backend/") and f.endswith(".py")
               and ("test_" in Path(f).name or Path(f).name.endswith("_test.py"))]
    frontend = [f for f in files
                if f.startswith("frontend/")
                and (".test." in f or ".spec." in f)
                and f.rsplit(".", 1)[-1] in {"ts", "tsx", "js", "jsx"}]
    return backend, frontend


def run_scoped_tests(test_files: list[str]) -> tuple[bool, str]:
    backend, frontend = _split_test_files(test_files)
    if backend:
        rel = [f[len("backend/"):] for f in backend]
        r = subprocess.run([sys.executable, "-m", "pytest", *rel, "-q", "--no-header"],
                           cwd=str(REPO_ROOT / "backend"), capture_output=True, text=True)
        if r.returncode != 0:
            return False, f"backend pytest failed:\n{(r.stdout + r.stderr)[-1500:]}"
    if frontend:
        rel = [f[len("frontend/"):] for f in frontend]
        r = subprocess.run([NPM, "test", "--", "--run", *rel],
                           cwd=str(REPO_ROOT / "frontend"), capture_output=True, text=True)
        if r.returncode != 0:
            return False, f"frontend vitest failed:\n{(r.stdout + r.stderr)[-1500:]}"
    return True, "ok"


def _llm_call_with_prompt(system: str, user: str) -> dict | None:
    """Invoke ts.call_llm with a one-off prompt by monkey-patching ts._build_prompt."""
    spec_stub = {"cards": [], "lists": [], "labels": {}}
    orig = ts._build_prompt
    ts._build_prompt = lambda _b, _s: (system, user)
    try:
        result = ts.call_llm([], spec_stub, "haiku", provider="auto")
    except Exception as e:
        print(f"  llm error: {e}", file=sys.stderr)
        return None
    finally:
        ts._build_prompt = orig
    if isinstance(result, list) and result:
        return result[0]
    if isinstance(result, dict):
        return result
    return None


def _generate_test_via_llm(card: dict, matches: list[tuple[str, str]]) -> dict | None:
    diff_text = ""
    for sha, _ in matches[:3]:
        r = subprocess.run(["git", "show", sha, "--stat", "--no-color"],
                           cwd=str(REPO_ROOT), capture_output=True, text=True, check=False)
        diff_text += f"\n## {sha[:7]}\n{r.stdout[:3000]}\n"

    user_prompt = (
        f"Card: {json.dumps(card, ensure_ascii=False)}\n\n"
        f"Likely implementing commits:\n{diff_text}\n\n"
        "Write ONE test file that exercises this feature.\n"
        "Conventions:\n"
        "- Backend: backend/tests/test_<feature>.py - pytest, FastAPI TestClient via conftest.\n"
        "- Frontend: frontend/src/__tests__/<feature>.test.tsx - vitest + RTL.\n"
        "Test must FAIL if the feature is removed (assert real behavior, no tautology).\n\n"
        "Return strict JSON wrapped in {\"cards\": [{...}]} with one entry: "
        "{\"path\": \"...\", \"code\": \"...\"}.\n"
    )
    return _llm_call_with_prompt(
        "You are a test author for the Conico CRM repo. Output strict JSON only.",
        user_prompt,
    )


def _grade_test_via_llm(card: dict, code: str) -> bool:
    user_prompt = (
        f"Card: {json.dumps(card, ensure_ascii=False)}\n\n"
        f"Test code:\n```\n{code[:4000]}\n```\n\n"
        "Does this test meaningfully exercise the feature? Reject if assertions "
        "are trivially true, the test mocks the SUT, or it only checks types/length "
        "without behavior.\n\n"
        "Return strict JSON {\"cards\": [{\"verdict\": \"pass\"|\"fail\", \"reason\": \"...\"}]}.\n"
    )
    out = _llm_call_with_prompt(
        "You are a strict test reviewer. Output strict JSON only.",
        user_prompt,
    )
    return bool(out and out.get("verdict") == "pass")


def reconcile_already_done(spec: dict, board_id: str,
                           commit_window: int = 200) -> list[str]:
    """Move cards that look already-implemented directly to 'In review'.

    Now gated: token-match is the *candidate* signal. Auto-ship only if either
      (a) the matching commits touched test files AND those tests pass, OR
      (b) we can generate a non-tautological test that passes.
    """
    commits = _recent_commits(commit_window)

    todo: list[tuple[dict, list[tuple[str, str]]]] = []
    for c in spec["cards"]:
        if c["list"] == ts.DUPLICATES_LIST:
            continue
        if c["list"] not in ELIGIBLE_FOR_AUTOSHIP_LISTS:
            continue
        matches = looks_implemented(c, commits)
        if not matches:
            continue
        existing = set(c.get("commits", []))
        new_shas = [sha for sha, _ in matches if sha not in existing]
        if not new_shas:
            continue
        todo.append((c, matches))

    if not todo:
        return []

    lists = ts.http("GET", f"/boards/{board_id}/lists", params={"filter": "open"})
    review_id = next(l["id"] for l in lists if l["name"] == SHIPPED_LIST)
    list_name = {l["id"]: l["name"] for l in lists}

    board_cards = ts.http("GET", f"/boards/{board_id}/cards",
                          params={"filter": "open", "fields": "name,idList,desc"})
    by_name: dict[str, list[dict]] = {}
    for bc in board_cards:
        by_name.setdefault(bc["name"], []).append(bc)

    repo_url = ts._github_repo_url()
    moved: list[str] = []
    seen_names: set[str] = set()

    for card_def, matches in todo:
        name = card_def["name"]
        if name in seen_names:
            continue
        seen_names.add(name)

        copies = by_name.get(name, [])
        copies_to_move = [bc for bc in copies
                          if list_name.get(bc["idList"]) in ELIGIBLE_FOR_AUTOSHIP_LISTS]
        if not copies_to_move:
            continue

        shas = [sha for sha, _ in matches]
        files = _files_in_commits(shas)
        test_files = [f for f in files if is_test_file(f)]

        if test_files:
            print(f"  scoped-tests for {name[:60]}: {len(test_files)} file(s)")
            ok, msg = run_scoped_tests(test_files)
            if not ok:
                print(f"  ! scoped-tests fail; skip auto-ship: {msg[:200]}")
                continue
        else:
            print(f"  no tests touched in matching commits for {name[:60]}; gen-test path")
            gen = _generate_test_via_llm(card_def, matches)
            if not gen or not gen.get("path") or not gen.get("code"):
                print(f"  ! gen-tests: LLM returned nothing; skip")
                continue
            test_path = REPO_ROOT / gen["path"]
            test_path.parent.mkdir(parents=True, exist_ok=True)
            test_path.write_text(gen["code"], encoding="utf-8")

            ok, msg = run_scoped_tests([gen["path"]])
            if not ok:
                test_path.unlink(missing_ok=True)
                print(f"  ! gen-tests fail; skip: {msg[:200]}")
                continue
            if not _grade_test_via_llm(card_def, gen["code"]):
                test_path.unlink(missing_ok=True)
                print(f"  ! gen-tests deemed tautological; skip")
                continue
            git("add", gen["path"])
            subprocess.run(["git", "commit", "-m", f"test: add coverage for {name}"],
                           cwd=str(REPO_ROOT), check=False)
            new_sha = git_head()
            matches = matches + [(new_sha, f"test: add coverage for {name}")]

        existing_shas = list(card_def.get("commits", []))
        for sha, _ in matches:
            if sha not in existing_shas:
                existing_shas.append(sha)
        commit_objs = ts._normalize_commits(existing_shas)
        new_desc = ts._compose_desc(
            ts._split_commits_block(card_def.get("desc", ""))[0],
            commit_objs, repo_url,
        )

        for bc in copies_to_move:
            ts.http("PUT", f"/cards/{bc['id']}",
                    params={"idList": review_id, "desc": new_desc})
            print(f"  auto-ship: {name[:80]}  (id={bc['id'][-6:]})")

        card_def["list"] = SHIPPED_LIST
        card_def["commits"] = existing_shas
        moved.append(name)
        for sha, subj in matches[:3]:
            print(f"    matched {sha[:7]}  {subj[:80]}")

    if moved:
        save_spec(spec)
        subprocess.run(["git", "add", "scripts/trello_cards.json"],
                       cwd=str(REPO_ROOT), check=False)
        subprocess.run(["git", "commit", "-m",
                        f"chore(trello): auto-ship {len(moved)} already-implemented card(s) -> In review"],
                       cwd=str(REPO_ROOT), check=False)
    return moved


# ------------------------------ triage ----------------------------------- #


def candidates(spec: dict) -> list[dict]:
    # done = any list the groomer should treat as "satisfied" for dep checks.
    done_names = {c["name"] for c in spec["cards"]
                  if c.get("list") in ts.DONE_LISTS}

    out = []
    for c in spec["cards"]:
        if c["list"] == ts.DUPLICATES_LIST:
            continue
        if c["list"] != ELIGIBLE_LIST:
            continue
        if any(l in SKIP_LABELS for l in c.get("labels", [])):
            continue
        if not (c.get("desc") or "").strip():
            continue
        if not c.get("checklist"):
            continue

        groom = parse_groom_block(c.get("desc") or "")
        if groom:
            status = (groom.get("status") or "").lower()
            if status and status != "ready":
                print(f"  skip {c['name']!r}  groom status={status}")
                continue
            unmet = [d for d in (groom.get("dependencies") or [])
                     if d and d not in done_names]
            if unmet:
                print(f"  skip {c['name']!r}  blocked on: {unmet}")
                continue
            c["_groom"] = groom
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


def pick_easiest(triaged: list[dict],
                 priorities: dict[str, int] | None = None) -> dict | None:
    """Pick the next card.

    Sort key: groomed cards (have a priority_score) outrank ungroomed ones,
    high priority first; tie-break by LLM difficulty (easier first).
    """
    feasible = [t for t in triaged if t.get("feasible", True)
                and isinstance(t.get("difficulty"), (int, float))]
    if not feasible:
        return None
    pri = priorities or {}

    def _key(t: dict) -> tuple:
        score = pri.get(t.get("name") or "", -1)
        groomed = score >= 0
        # groomed first, then high score, then low difficulty
        return (0 if groomed else 1, -score, t["difficulty"])

    feasible.sort(key=_key)
    return feasible[0]


# --------------------------- implementer --------------------------------- #


IMPLEMENTER_PROMPT = """You are an autonomous implementer for the Conico CRM project.

TASK: implement the Trello card below. Make ALL the changes (backend, frontend, migrations, tests as needed).

BEFORE you commit anything, run the tests YOURSELF to confirm they pass:
  - backend: `cd backend && ./run_tests.sh`  (or run only the relevant test files)
  - frontend: `cd frontend && npm test -- --run`
  - frontend build: `cd frontend && npm run build`
After you commit, the loop will re-run the FULL suite. If it fails, the loop will
hand the failure back to you for a fix attempt — but you should not rely on that;
aim to ship green on the first try.

Work directly on the current branch. Commit your changes with a clear message
referencing the card. You may make multiple commits. Do NOT push — the loop pushes.

Do NOT modify scripts/trello_cards.json or scripts/trello_sync.py — those are managed by the loop.

If you cannot complete the task (missing context, unclear scope, blocker), exit
with a message starting with "ABORT:" and explain. Do not commit half-broken code.

CARD:
{card_json}
"""


FIX_PROMPT = """You are continuing work on the SAME branch you just committed to.
The loop ran the full test suite and it FAILED. Diagnose and fix.

Failure tail (last ~2000 chars of stdout+stderr):
---
{failure}
---

Original card you were implementing:
{card_json}

RULES:
  - Do NOT reset or revert. Add new commits on top to fix the failure.
  - Run the failing tests yourself before committing your fix to confirm.
  - If after analysis the failure is unfixable in scope (wrong scope, missing
    spec, blocked on infra), exit with a message starting with "ABORT:" and explain.
  - Do NOT touch scripts/trello_cards.json or scripts/trello_sync.py.
"""


def _normalize_claude_model(m: str) -> str:
    """claude-sonnet-4-6-20251001 -> claude-sonnet-4.6 (matches pricing keys)."""
    if not m:
        return m
    mm = re.match(r"^(claude-(?:haiku|sonnet|opus)-\d+)-(\d+)", m)
    if mm:
        return f"{mm.group(1)}.{mm.group(2)}"
    return m


def _fmt_elapsed(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 60:d}:{s % 60:02d}"


def _run_claude_with_prompt(prompt: str, model: str, log_path: Path) -> tuple[int, str]:
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
    cum_in = 0
    cum_out = 0
    cum_cache_read = 0
    cum_cache_write = 0
    last_model_id = ""
    started = time.monotonic()

    with log_path.open("w", encoding="utf-8") as f:
        proc = subprocess.Popen(cmd, cwd=str(REPO_ROOT),
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, bufsize=1,
                                encoding="utf-8", errors="replace")
        for line in proc.stdout:
            f.write(line); f.flush()
            try:
                obj = json.loads(line)
            except Exception:
                continue

            kind = obj.get("type")
            elapsed = _fmt_elapsed(time.monotonic() - started)

            if kind == "assistant":
                msg = obj.get("message", {}) or {}
                model_id = msg.get("model") or last_model_id
                last_model_id = model_id

                u = msg.get("usage") or {}
                in_t  = int(u.get("input_tokens", 0) or 0)
                out_t = int(u.get("output_tokens", 0) or 0)
                cr_t  = int(u.get("cache_read_input_tokens", 0) or 0)
                cw_t  = int(u.get("cache_creation_input_tokens", 0) or 0)
                cum_in  += in_t
                cum_out += out_t
                cum_cache_read  += cr_t
                cum_cache_write += cw_t

                tool_names = []
                for block in msg.get("content", []):
                    btype = block.get("type")
                    if btype == "text":
                        last_text = block.get("text", "") or last_text
                    elif btype == "tool_use":
                        tool_names.append(block.get("name", "?"))

                # rough live cost: input + cache (full rate; conservative)
                norm = _normalize_claude_model(model_id)
                step_usd = ts.estimate_cost_usd(norm, in_t + cr_t + cw_t, out_t)
                cum_usd  = ts.estimate_cost_usd(
                    norm, cum_in + cum_cache_read + cum_cache_write, cum_out)

                snippet = ""
                if tool_names:
                    snippet = f"-> {', '.join(tool_names)}"
                elif last_text:
                    snippet = last_text.strip().split("\n", 1)[0][:80]

                print(f"  [claude {elapsed}]  +{in_t}in/+{out_t}out  "
                      f"cum {cum_in + cum_cache_read + cum_cache_write}/{cum_out} "
                      f"~${cum_usd:.4f} (+${step_usd:.4f})  {snippet}",
                      flush=True)

            elif kind == "user":
                # tool_result coming back
                msg = obj.get("message", {}) or {}
                for block in msg.get("content", []):
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        is_err = block.get("is_error")
                        tag = "tool-err" if is_err else "tool-ok"
                        print(f"  [claude {elapsed}]  {tag}", flush=True)
                        break

            elif kind == "result":
                # final message; record cumulative usage to the global tracker
                if cum_in or cum_out or cum_cache_read or cum_cache_write:
                    norm = _normalize_claude_model(last_model_id) or model
                    ts.record_usage(
                        "claude-cli", norm,
                        cum_in + cum_cache_read + cum_cache_write,
                        cum_out, estimated=False,
                    )

        proc.wait()
    return proc.returncode, last_text


def spawn_claude(card: dict, model: str, log_path: Path) -> tuple[int, str]:
    prompt = IMPLEMENTER_PROMPT.format(
        card_json=json.dumps(card, ensure_ascii=False, indent=2)
    )
    return _run_claude_with_prompt(prompt, model, log_path)


def spawn_claude_fix(card: dict, model: str, failure: str, log_path: Path) -> tuple[int, str]:
    prompt = FIX_PROMPT.format(
        failure=failure[-2000:],
        card_json=json.dumps(card, ensure_ascii=False, indent=2),
    )
    return _run_claude_with_prompt(prompt, model, log_path)


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


def claim(spec: dict, name: str, board_id: str) -> None:
    card = find_card(spec, name)
    if not card:
        raise RuntimeError(f"card not found locally: {name}")
    card_id = ts.find_card_id(board_id, name)
    if not card_id:
        raise RuntimeError(f"card not found on board: {name}")
    list_id = next(l["id"] for l in ts.fetch_lists(board_id) if l["name"] == CLAIMED_LIST)
    ts.update_card(card_id, idList=list_id)
    card["list"] = CLAIMED_LIST
    save_spec(spec)
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

    print("\n=== dedupe ===")
    moved_dups = ts.dedupe_cards(board_id, exclude_lists=set(ts.DONE_LISTS))
    if moved_dups:
        print(f"  moved {len(moved_dups)} duplicate-named card(s); re-pulling.")
        ts.pull(board_id, CARDS_FILE)
        spec = load_spec()

    print("\n=== reconcile already-implemented ===")
    moved = reconcile_already_done(spec, board_id, commit_window=args.commit_window)
    if moved:
        print(f"  auto-shipped {len(moved)} card(s); re-pulling.")
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

    priorities = {
        c["name"]: int((c.get("_groom") or {}).get("priority_score") or 0)
        for c in cands if c.get("_groom")
    }

    for t in triaged:
        prio = priorities.get(t.get("name") or "")
        prio_str = f"prio={prio}" if prio is not None else "ungroomed"
        print(f"  {t.get('difficulty', '?'):>3}  "
              f"{t.get('model', '?'):<7}  "
              f"feasible={t.get('feasible', True)}  "
              f"{prio_str:<14}  "
              f"{t.get('name', '?')[:70]}")

    pick = pick_easiest(triaged, priorities=priorities)
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
    claim(spec, name, board_id)
    spec = load_spec()
    card = find_card(spec, name)

    print("\n=== spawn claude ===")
    log_path = LOG_DIR / f"{int(time.time())}_{slugify(name)}.log"
    rc, last_text = spawn_claude(card, impl_model, log_path)
    print(f"  claude exit={rc}; log={log_path}")

    test_runs = 0
    fix_attempts = 0

    if rc != 0 or last_text.strip().upper().startswith("ABORT"):
        print("agent reported failure; rolling back.", file=sys.stderr)
        rollback_to(pre_sha)
        spec = load_spec()
        fail(spec, name, last_text or f"claude exit {rc}")
        print_conclusion("FAILED", name, ELIGIBLE_LIST, fix_attempts, test_runs,
                         reason=last_text[:300] or f"claude exit {rc}")
        return "continue"

    new_sha = git_head()
    if new_sha == pre_sha:
        print("agent made no commits; rolling back.", file=sys.stderr)
        spec = load_spec()
        fail(spec, name, "agent produced no commits")
        print_conclusion("NO-OP", name, ELIGIBLE_LIST, fix_attempts, test_runs,
                         reason="agent produced no commits")
        return "continue"

    final_sha = new_sha
    if not args.skip_tests:
        while True:
            print(f"\n=== run tests (attempt {test_runs + 1}) ===")
            ok, msg = run_tests()
            test_runs += 1
            if ok:
                print(f"  {msg}")
                final_sha = git_head()
                break

            print(f"tests failed: {msg[:400]}", file=sys.stderr)
            if fix_attempts >= args.max_fix_attempts:
                print(f"out of fix attempts ({args.max_fix_attempts}); rolling back.",
                      file=sys.stderr)
                rollback_to(pre_sha)
                spec = load_spec()
                fail(spec, name, msg)
                print_conclusion("FAILED", name, ELIGIBLE_LIST,
                                 fix_attempts, test_runs,
                                 reason=f"tests failed after "
                                        f"{fix_attempts} fix attempt(s)")
                return "continue"

            fix_attempts += 1
            print(f"\n=== fix attempt {fix_attempts}/{args.max_fix_attempts} ===")
            fix_log = LOG_DIR / f"{int(time.time())}_{slugify(name)}_fix{fix_attempts}.log"
            rc2, last2 = spawn_claude_fix(card, impl_model, msg, fix_log)
            print(f"  claude-fix exit={rc2}; log={fix_log}")

            if rc2 != 0 or last2.strip().upper().startswith("ABORT"):
                print("fix agent ABORTed; rolling back.", file=sys.stderr)
                rollback_to(pre_sha)
                spec = load_spec()
                fail(spec, name, last2 or f"fix exit {rc2}")
                print_conclusion("ABORTED", name, ELIGIBLE_LIST,
                                 fix_attempts, test_runs,
                                 reason=last2[:300] or f"fix exit {rc2}")
                return "continue"

            new_after_fix = git_head()
            if new_after_fix == final_sha:
                print("fix produced no commits; rolling back.", file=sys.stderr)
                rollback_to(pre_sha)
                spec = load_spec()
                fail(spec, name, "fix attempt produced no commits")
                print_conclusion("FAILED", name, ELIGIBLE_LIST,
                                 fix_attempts, test_runs,
                                 reason="fix attempt produced no commits")
                return "continue"
            final_sha = new_after_fix

    print("\n=== ship ===")
    spec = load_spec()
    ship(spec, name, final_sha)

    print("\n=== push ===")
    subprocess.run(["git", "push", "origin", args.branch],
                   cwd=str(REPO_ROOT), check=False)

    print_conclusion("SHIPPED", name, SHIPPED_LIST, fix_attempts, test_runs,
                     reason=f"final sha {final_sha[:7]}")
    return "continue"


def print_conclusion(status: str, name: str, list_now: str,
                     fix_attempts: int, test_runs: int,
                     reason: str = "") -> None:
    bar = "=" * 60
    print(f"\n{bar}")
    print(f"  ITERATION RESULT")
    print(f"  status:        {status}")
    print(f"  card:          {name}")
    print(f"  trello list:   {list_now}")
    print(f"  test runs:     {test_runs}")
    print(f"  fix attempts:  {fix_attempts}")
    if reason:
        print(f"  note:          {reason[:300]}")
    print(bar)
    print(ts.usage_summary())


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
    parser.add_argument("--commit-window", type=int, default=200,
                        help="how many recent commits to scan for already-implemented matches")
    parser.add_argument("--max-fix-attempts", type=int, default=2,
                        help="how many times to re-spawn claude with the failure tail before rolling back")
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
    print("\n=== session totals ===")
    print(ts.usage_summary())
    return 0


if __name__ == "__main__":
    sys.exit(main())
