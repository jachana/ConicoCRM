#!/usr/bin/env python3
"""
Trello sync for Conico project.

Reads scripts/trello_cards.json and pushes lists, labels, cards, and checklists
to a Trello board. Idempotent: re-runs update existing cards (by name) instead
of duplicating.

Setup:
  1. Get API key + token at https://trello.com/power-ups/admin
     (create a Power-Up, then "Generate a new API key", then "Token" link)
  2. Open your board in the browser. Copy the board ID from the URL:
     https://trello.com/b/<BOARD_ID>/<slug>
  3. Set env vars (or create scripts/.trello.env, gitignored):
       TRELLO_API_KEY=...
       TRELLO_TOKEN=...
       TRELLO_BOARD_ID=...
       STRAICO_API_KEY=...      # primary --enrich provider (preferred)
       OPENROUTER_API_KEY=...   # fallback --enrich provider
       # Optional (for OpenRouter rankings/attribution):
       OPENROUTER_REFERER=https://github.com/.../conico
       OPENROUTER_TITLE=Conico Trello Sync

Usage:
  python scripts/trello_sync.py --dry-run     # preview push
  python scripts/trello_sync.py --apply       # push JSON -> Trello (JSON wins)
  python scripts/trello_sync.py --pull        # pull Trello -> JSON  (Trello wins)
  python scripts/trello_sync.py --enrich      # LLM triage of bare cards (pull first, then run)
  python scripts/trello_sync.py --enrich --model sonnet  # use Sonnet instead of Haiku
  python scripts/trello_sync.py --apply --only-cards "[W1-05]"   # filter by name substring
  python scripts/trello_sync.py --apply --only-list "In review"  # filter by column name
  python scripts/trello_sync.py --link-commit HEAD --card "[Bug:HTTPS]"  # tag commit -> card

Card schema gains optional `"commits": ["<sha>", ...]` (full or short hashes).
On --apply they render at the bottom of the desc as a "Resuelto por" markdown
list with GitHub commit links (resolved from `git config remote.origin.url`),
bracketed by HTML markers so --pull strips them back into the structured field.

Re-running --apply is safe: existing cards get description + label + checklist
refreshed; missing cards are created; nothing is deleted.

--pull rewrites scripts/trello_cards.json from current board state. Cards on
Trello but missing locally are added; cards in JSON but missing on Trello are
dropped. Only the "Subtareas" checklist is round-tripped — custom checklists on
Trello are ignored. Checked/unchecked state lives only on Trello (the JSON
schema stores plain item names).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import urllib.parse
import urllib.request
import urllib.error


API_BASE = "https://api.trello.com/1"
SCRIPT_DIR = Path(__file__).resolve().parent
CARDS_FILE = SCRIPT_DIR / "trello_cards.json"
ENV_FILE = SCRIPT_DIR / ".trello.env"

STRAICO_API = "https://api.straico.com/v1/prompt/completion"
OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions"
PROVIDER_ORDER = ("straico", "openrouter")
PROVIDER_MODELS = {
    "straico": {
        "haiku": "anthropic/claude-haiku-4.5",
        "sonnet": "anthropic/claude-sonnet-4.5",
        "opus": "anthropic/claude-opus-4.1",
        "gemini-flash": "google/gemini-2.5-flash",
        "gpt-mini": "openai/gpt-4.1-mini",
    },
    "openrouter": {
        "haiku": "anthropic/claude-haiku-4.5",
        "sonnet": "anthropic/claude-sonnet-4.5",
        "opus": "anthropic/claude-opus-4.1",
        "gemini-flash": "google/gemini-2.5-flash",
        "gpt-mini": "openai/gpt-4.1-mini",
    },
}
DONE_LISTS = {"Friendly Beta 0.1", "Live Beta 0.2", "Live 1.0", "In review"}

COMMITS_MARKER_START = "<!-- conico-commits -->"
COMMITS_MARKER_END = "<!-- /conico-commits -->"
_COMMITS_BLOCK_RE = re.compile(
    re.escape(COMMITS_MARKER_START) + r".*?" + re.escape(COMMITS_MARKER_END),
    re.DOTALL,
)


def _git(*args: str) -> str | None:
    try:
        r = subprocess.run(["git", *args], capture_output=True, text=True,
                           check=True, cwd=str(SCRIPT_DIR.parent))
        return r.stdout.strip() or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _github_repo_url() -> str | None:
    """Resolve `git@host:user/repo.git` or `https://host/user/repo.git` to web URL."""
    url = _git("config", "--get", "remote.origin.url")
    if not url:
        return None
    if url.startswith("git@"):
        host, _, path = url[4:].partition(":")
        url = f"https://{host}/{path}"
    if url.endswith(".git"):
        url = url[:-4]
    return url


def _commit_meta(sha: str) -> tuple[str, str]:
    """Return (short_sha, subject). Falls back gracefully if git can't resolve."""
    short = _git("rev-parse", "--short", sha) or sha[:7]
    subject = _git("log", "-1", "--format=%s", sha) or ""
    return short, subject


def _normalize_commits(raw: Any) -> list[dict]:
    """Coerce commits field (list of str or list of dict) to canonical [{'hash': ..., 'subject': ...}]."""
    out: list[dict] = []
    for item in raw or []:
        if isinstance(item, str):
            out.append({"hash": item})
        elif isinstance(item, dict) and item.get("hash"):
            entry = {"hash": item["hash"]}
            if item.get("subject"):
                entry["subject"] = item["subject"]
            out.append(entry)
    return out


def _render_commits_block(commits: list[dict], repo_url: str | None) -> str:
    if not commits:
        return ""
    lines = [COMMITS_MARKER_START, "**Resuelto por:**"]
    for c in commits:
        sha = c["hash"]
        short, subject = _commit_meta(sha)
        subject = c.get("subject") or subject
        link = f"[`{short}`]({repo_url}/commit/{sha})" if repo_url else f"`{short}`"
        suffix = f" — {subject}" if subject else ""
        lines.append(f"- {link}{suffix}")
    lines.append(COMMITS_MARKER_END)
    return "\n".join(lines)


def _compose_desc(base_desc: str, commits: list[dict], repo_url: str | None) -> str:
    block = _render_commits_block(commits, repo_url)
    if not block:
        return base_desc or ""
    base = (base_desc or "").rstrip()
    return f"{base}\n\n{block}" if base else block


def _split_commits_block(desc: str) -> tuple[str, list[str]]:
    """Strip commits block from desc; return (clean_desc, [shas])."""
    if not desc or COMMITS_MARKER_START not in desc:
        return desc or "", []
    match = _COMMITS_BLOCK_RE.search(desc)
    if not match:
        return desc, []
    block = match.group(0)
    shas = re.findall(r"/commit/([0-9a-f]{4,40})", block)
    if not shas:
        shas = re.findall(r"`([0-9a-f]{4,40})`", block)
    cleaned = (desc[:match.start()].rstrip() + "\n" + desc[match.end():].lstrip()).strip()
    return cleaned, shas


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def http(method: str, path: str, params: dict[str, Any] | None = None,
         body: dict[str, Any] | None = None, retries: int = 3) -> Any:
    key = os.environ["TRELLO_API_KEY"]
    token = os.environ["TRELLO_TOKEN"]
    qs = {"key": key, "token": token}
    if params:
        qs.update({k: v for k, v in params.items() if v is not None})
    url = f"{API_BASE}{path}?{urllib.parse.urlencode(qs)}"

    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    last_err: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                last_err = e
                time.sleep(2 ** attempt)
                continue
            detail = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} -> {e.code}: {detail}") from e
        except urllib.error.URLError as e:
            last_err = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"{method} {path} failed after {retries} retries: {last_err}")


def fetch_lists(board_id: str) -> list[dict]:
    return http("GET", f"/boards/{board_id}/lists", params={"filter": "open"})


def fetch_labels(board_id: str) -> list[dict]:
    return http("GET", f"/boards/{board_id}/labels", params={"limit": 1000})


def fetch_cards(board_id: str) -> list[dict]:
    return http("GET", f"/boards/{board_id}/cards",
                params={"filter": "open", "fields": "name,desc,idList,idLabels"})


def fetch_card_checklists(card_id: str) -> list[dict]:
    return http("GET", f"/cards/{card_id}/checklists")


def ensure_lists(board_id: str, wanted: list[str], dry_run: bool) -> dict[str, str]:
    existing = {l["name"]: l["id"] for l in fetch_lists(board_id)}
    out: dict[str, str] = {}
    for idx, name in enumerate(wanted):
        if name in existing:
            out[name] = existing[name]
            continue
        if dry_run:
            print(f"  + list (dry): {name}")
            out[name] = f"DRY_LIST_{idx}"
            continue
        created = http("POST", "/lists", params={"name": name, "idBoard": board_id, "pos": "bottom"})
        out[name] = created["id"]
        print(f"  + list: {name}")
    return out


def ensure_labels(board_id: str, wanted: dict[str, str], dry_run: bool) -> dict[str, str]:
    existing = {l["name"]: l["id"] for l in fetch_labels(board_id) if l.get("name")}
    out: dict[str, str] = {}
    for name, color in wanted.items():
        if name in existing:
            out[name] = existing[name]
            continue
        if dry_run:
            print(f"  + label (dry): {name} ({color})")
            out[name] = f"DRY_LABEL_{name}"
            continue
        created = http("POST", "/labels",
                       params={"name": name, "color": color, "idBoard": board_id})
        out[name] = created["id"]
        print(f"  + label: {name} ({color})")
    return out


def sync_card(board_id: str, card_def: dict, lists_map: dict[str, str],
              labels_map: dict[str, str], existing_by_name: dict[str, dict],
              dry_run: bool, repo_url: str | None = None) -> None:
    name = card_def["name"]
    list_id = lists_map[card_def["list"]]
    base_desc = card_def.get("desc", "")
    commits = _normalize_commits(card_def.get("commits"))
    desc = _compose_desc(base_desc, commits, repo_url)
    label_ids = [labels_map[l] for l in card_def.get("labels", []) if l in labels_map]
    checklist_items = card_def.get("checklist", [])

    if name in existing_by_name:
        card = existing_by_name[name]
        card_id = card["id"]
        needs_update = (
            card.get("desc", "") != desc
            or card.get("idList") != list_id
            or set(card.get("idLabels", [])) != set(label_ids)
        )
        if needs_update:
            if dry_run:
                print(f"  ~ update (dry): {name}")
            else:
                http("PUT", f"/cards/{card_id}",
                     params={"desc": desc, "idList": list_id, "idLabels": ",".join(label_ids)})
                print(f"  ~ update: {name}")
        else:
            print(f"  = same: {name}")
        if checklist_items and not dry_run:
            sync_checklist(card_id, checklist_items)
        return

    if dry_run:
        print(f"  + card (dry): {name}  [{card_def['list']}]")
        return

    created = http("POST", "/cards",
                   params={"name": name, "desc": desc, "idList": list_id,
                           "idLabels": ",".join(label_ids), "pos": "bottom"})
    card_id = created["id"]
    print(f"  + card: {name}  [{card_def['list']}]")
    if checklist_items:
        sync_checklist(card_id, checklist_items)


def fetch_board_cards_full(board_id: str) -> list[dict]:
    return http("GET", f"/boards/{board_id}/cards",
                params={"filter": "open", "checklists": "all",
                        "fields": "name,desc,idList,idLabels,pos"})


def pull(board_id: str, cards_path: Path) -> int:
    spec_existing: dict[str, Any] = {}
    if cards_path.exists():
        spec_existing = json.loads(cards_path.read_text(encoding="utf-8"))

    lists = http("GET", f"/boards/{board_id}/lists",
                 params={"filter": "open", "fields": "name,pos"})
    list_id_to_name = {l["id"]: l["name"] for l in lists}
    list_names_in_order = [l["name"] for l in lists]

    labels = http("GET", f"/boards/{board_id}/labels",
                  params={"limit": 1000, "fields": "name,color"})
    label_id_to_name = {l["id"]: l["name"] for l in labels if l.get("name")}

    new_labels: dict[str, str] = dict(spec_existing.get("labels", {}))
    for l in labels:
        n = l.get("name")
        if n and n not in new_labels:
            new_labels[n] = l.get("color") or "lime"

    cards = fetch_board_cards_full(board_id)
    list_order = {n: i for i, n in enumerate(list_names_in_order)}
    cards.sort(key=lambda c: (list_order.get(list_id_to_name.get(c["idList"], ""), 999),
                              c.get("pos", 0)))

    new_cards: list[dict] = []
    for c in cards:
        list_name = list_id_to_name.get(c["idList"])
        if not list_name:
            continue
        label_names = [label_id_to_name[lid] for lid in c.get("idLabels", [])
                       if lid in label_id_to_name]
        checklist_items: list[str] = []
        for cl in c.get("checklists", []):
            if cl.get("name") != "Subtareas":
                continue
            items_sorted = sorted(cl.get("checkItems", []), key=lambda i: i.get("pos", 0))
            checklist_items = [it["name"] for it in items_sorted]
            break
        clean_desc, commit_shas = _split_commits_block(c.get("desc", ""))
        entry = {
            "list": list_name,
            "name": c["name"],
            "labels": label_names,
            "desc": clean_desc,
            "checklist": checklist_items,
        }
        if commit_shas:
            entry["commits"] = commit_shas
        new_cards.append(entry)

    new_spec = {
        "lists": list_names_in_order,
        "labels": new_labels,
        "cards": new_cards,
    }
    cards_path.write_text(
        json.dumps(new_spec, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    existing_names = {c["name"] for c in spec_existing.get("cards", [])}
    pulled_names = {c["name"] for c in new_cards}
    added = pulled_names - existing_names
    dropped = existing_names - pulled_names
    print(f"Pulled {len(new_cards)} card(s) across {len(list_names_in_order)} list(s) "
          f"into {cards_path.name}")
    if added:
        print(f"  + new in Trello (added to JSON): {len(added)}")
        for n in sorted(added):
            print(f"      {n}")
    if dropped:
        print(f"  - missing on Trello (removed from JSON): {len(dropped)}")
        for n in sorted(dropped):
            print(f"      {n}")
    return 0


def sync_checklist(card_id: str, items: list[str]) -> None:
    existing = fetch_card_checklists(card_id)
    target = next((c for c in existing if c["name"] == "Subtareas"), None)
    if target is None:
        target = http("POST", "/checklists", params={"idCard": card_id, "name": "Subtareas"})
    have_items = {it["name"]: it for it in target.get("checkItems", [])}
    for label in items:
        if label in have_items:
            continue
        http("POST", f"/checklists/{target['id']}/checkItems",
             params={"name": label, "checked": "false"})


def is_bare(card: dict) -> bool:
    return (not (card.get("desc") or "").strip()
            and not card.get("checklist")
            and not card.get("labels"))


def _build_prompt(bare_cards: list[dict], spec: dict) -> tuple[str, str]:
    target_lists = [l for l in spec["lists"] if l not in DONE_LISTS]
    label_names = list(spec.get("labels", {}).keys())
    examples = [
        {"name": c["name"], "list": c["list"], "labels": c.get("labels", []),
         "desc": c.get("desc", ""), "checklist": c.get("checklist", [])}
        for c in spec["cards"]
        if (c.get("desc") or "").strip() and c.get("checklist")
        and c["list"] not in DONE_LISTS
    ][:4]

    system = (
        "Triage Trello cards for Conico CRM (Chilean SaaS for SMEs, es-CL).\n\n"
        f"Target lists (pick one per card): {target_lists}\n"
        f"Available labels: {label_names}\n\n"
        "Style examples (existing well-formed cards in this board):\n"
        f"{json.dumps(examples, ensure_ascii=False, indent=2)}\n\n"
        "Rules:\n"
        '- NEVER change "name" — it is the stable id.\n'
        "- Pick best list: Bugs (defects), Feature requests (new work, has scope), "
        "Ideas (speculative/long-term), Client feedback (client-asked), "
        "In progress (only if clearly active).\n"
        '- "desc" in es-CL: 2-4 sentences. What + why + scope hint. Match terse style.\n'
        '- "checklist" 3-7 actionable items.\n'
        "- Labels 1-3 max. Use Bug only on Bugs list.\n"
        '- "confidence": high|medium|low. Low when name alone is too vague.\n'
        '- If low: still return list+labels+desc as best-effort, set "needs_review" '
        "to a one-line reason.\n"
    )
    user = (
        "Bare cards to triage. Return a JSON object {\"cards\": [...]} where each "
        "entry has: "
        '{"name", "list", "labels", "desc", "checklist", "confidence", "needs_review"}.\n'
        "One entry per input card, same order, names verbatim.\n"
        "Return ONLY the JSON object. No prose, no markdown fences.\n\n"
        f"{json.dumps(bare_cards, ensure_ascii=False, indent=2)}\n"
    )
    return system, user


def _parse_llm_json(text: str) -> list[dict]:
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    parsed = json.loads(text)
    if isinstance(parsed, dict) and "cards" in parsed:
        return parsed["cards"]
    if isinstance(parsed, list):
        return parsed
    raise RuntimeError(f"unexpected LLM response shape: {type(parsed).__name__}")


def _call_straico(bare_cards: list[dict], spec: dict, model_alias: str) -> list[dict]:
    api_key = os.environ.get("STRAICO_API_KEY")
    if not api_key:
        raise RuntimeError("missing STRAICO_API_KEY")
    model_id = PROVIDER_MODELS["straico"].get(model_alias, model_alias)
    system, user = _build_prompt(bare_cards, spec)
    body = {"models": [model_id], "message": f"{system}\n\n---\n\n{user}"}
    req = urllib.request.Request(
        STRAICO_API,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        result = json.loads(resp.read())
    completions = (result.get("data") or {}).get("completions") or {}
    if not completions:
        raise RuntimeError(f"straico: empty completions in response: {result}")
    first = next(iter(completions.values()))
    text = first["completion"]["choices"][0]["message"]["content"]
    return _parse_llm_json(text)


def _call_openrouter(bare_cards: list[dict], spec: dict, model_alias: str) -> list[dict]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("missing OPENROUTER_API_KEY")
    model_id = PROVIDER_MODELS["openrouter"].get(model_alias, model_alias)
    system, user = _build_prompt(bare_cards, spec)
    body = {
        "model": model_id,
        "max_tokens": 8192,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if os.environ.get("OPENROUTER_REFERER"):
        headers["HTTP-Referer"] = os.environ["OPENROUTER_REFERER"]
    if os.environ.get("OPENROUTER_TITLE"):
        headers["X-Title"] = os.environ["OPENROUTER_TITLE"]
    req = urllib.request.Request(
        OPENROUTER_API,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        result = json.loads(resp.read())
    text = result["choices"][0]["message"]["content"]
    return _parse_llm_json(text)


PROVIDER_FUNCS = {
    "straico": _call_straico,
    "openrouter": _call_openrouter,
}


def call_llm(bare_cards: list[dict], spec: dict, model_alias: str,
             provider: str = "auto") -> list[dict]:
    if provider == "auto":
        candidates = [p for p in PROVIDER_ORDER
                      if os.environ.get({"straico": "STRAICO_API_KEY",
                                         "openrouter": "OPENROUTER_API_KEY"}[p])]
        if not candidates:
            raise RuntimeError(
                "no provider key set (STRAICO_API_KEY or OPENROUTER_API_KEY)"
            )
    else:
        candidates = [provider]

    last_err: Exception | None = None
    for p in candidates:
        try:
            print(f"  llm: trying {p} ({PROVIDER_MODELS[p].get(model_alias, model_alias)})")
            return PROVIDER_FUNCS[p](bare_cards, spec, model_alias)
        except Exception as e:
            print(f"  llm: {p} failed: {e}", file=sys.stderr)
            last_err = e
    raise RuntimeError(f"all providers failed; last error: {last_err}")


def apply_spec(spec: dict, board_id: str, dry_run: bool,
               only_cards: str | None = None,
               only_list: str | None = None) -> int:
    cards = spec["cards"]
    if only_cards:
        needle = only_cards.lower()
        cards = [c for c in cards if needle in c["name"].lower()]
        print(f"filter --only-cards={only_cards!r}: {len(cards)} card(s) match")
    if only_list:
        needle = only_list.lower()
        cards = [c for c in cards if needle in c["list"].lower()]
        print(f"filter --only-list={only_list!r}: {len(cards)} card(s) match")

    print(f"\n== Syncing to board {board_id} ({'DRY RUN' if dry_run else 'APPLY'}) ==\n")

    print("Lists:")
    lists_map = ensure_lists(board_id, spec["lists"], dry_run)
    print("\nLabels:")
    labels_map = ensure_labels(board_id, spec["labels"], dry_run)

    print("\nCards:")
    existing_cards = [] if dry_run else fetch_cards(board_id)
    existing_by_name = {c["name"]: c for c in existing_cards}
    repo_url = _github_repo_url()

    for card_def in cards:
        try:
            sync_card(board_id, card_def, lists_map, labels_map, existing_by_name,
                      dry_run, repo_url=repo_url)
        except Exception as e:
            print(f"  ! error on {card_def['name']!r}: {e}", file=sys.stderr)

    print(f"\nDone. {len(cards)} card(s) processed.")
    return 0


def enrich(spec: dict, cards_path: Path, model_alias: str,
           board_id: str | None = None, push: bool = True,
           provider: str = "auto") -> int:
    bare = [
        {"name": c["name"], "list": c["list"]}
        for c in spec["cards"]
        if c["list"] not in DONE_LISTS and is_bare(c)
    ]
    if not bare:
        print("No bare cards outside done lists. Nothing to triage.")
        return 0

    print(f"Found {len(bare)} bare card(s) to triage (model={model_alias}, provider={provider}):")
    for c in bare:
        print(f"  - {c['name']!r}  [{c['list']}]")

    try:
        enrichments = call_llm(bare, spec, model_alias, provider=provider)
    except Exception as e:
        print(f"error: LLM call failed: {e}", file=sys.stderr)
        return 1

    valid_lists = set(spec["lists"]) - DONE_LISTS
    valid_labels = set(spec.get("labels", {}).keys())
    by_name = {c["name"]: c for c in spec["cards"]}

    applied = 0
    review_pile: list[dict] = []
    for e in enrichments:
        name = e.get("name")
        target = by_name.get(name)
        if not target:
            print(f"  ! skip — no card named {name!r} in JSON")
            continue
        if not is_bare(target):
            print(f"  ! skip — {name!r} is no longer bare")
            continue

        confidence = (e.get("confidence") or "").lower()
        new_list = e.get("list") if e.get("list") in valid_lists else None
        new_labels = [l for l in (e.get("labels") or []) if l in valid_labels]
        new_desc = (e.get("desc") or "").strip()
        new_checklist = [s for s in (e.get("checklist") or []) if s.strip()]

        if confidence == "low":
            review_pile.append({"name": name, "reason": e.get("needs_review", "low confidence")})
            continue

        if new_list:
            target["list"] = new_list
        if new_labels:
            target["labels"] = new_labels[:3]
        if new_desc:
            target["desc"] = new_desc
        if new_checklist:
            target["checklist"] = new_checklist
        applied += 1
        print(f"  ~ enriched: {name!r}  [{target['list']}]  ({confidence or 'no-conf'})")

    cards_path.write_text(
        json.dumps(spec, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"\nEnriched {applied} card(s); JSON updated at {cards_path}.")

    if review_pile:
        print(f"\nNeeds manual review ({len(review_pile)}):")
        for r in review_pile:
            print(f"  ? {r['name']!r}: {r['reason']}")

    if push and board_id and applied > 0:
        print("\n--- Pushing enriched JSON to Trello ---")
        spec = json.loads(cards_path.read_text(encoding="utf-8"))
        return apply_spec(spec, board_id, dry_run=False)

    if not push:
        print("\n--no-push set: review JSON diff, then run --apply to push to Trello.")
    return 0


def link_commit(spec: dict, cards_path: Path, sha_arg: str, card_needle: str,
                board_id: str, push: bool) -> int:
    """Resolve sha (HEAD ok), find card by name substring, append to commits, write JSON."""
    sha = _git("rev-parse", sha_arg)
    if not sha:
        print(f"error: cannot resolve commit {sha_arg!r} via git", file=sys.stderr)
        return 2

    needle = card_needle.lower()
    matches = [c for c in spec["cards"] if needle in c["name"].lower()]
    if not matches:
        print(f"error: no card matches {card_needle!r}", file=sys.stderr)
        return 2
    if len(matches) > 1:
        print(f"error: {card_needle!r} matches {len(matches)} cards (need exactly 1):",
              file=sys.stderr)
        for m in matches:
            print(f"   - {m['name']!r}", file=sys.stderr)
        return 2

    card = matches[0]
    commits = _normalize_commits(card.get("commits"))
    if any(c["hash"] == sha or sha.startswith(c["hash"]) or c["hash"].startswith(sha)
           for c in commits):
        print(f"already linked: {sha[:7]} -> {card['name']!r}")
    else:
        commits.append({"hash": sha})
        card["commits"] = [c["hash"] for c in commits]
        cards_path.write_text(
            json.dumps(spec, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"linked: {sha[:7]} -> {card['name']!r}  (JSON updated)")

    if push:
        return apply_spec(spec, board_id, dry_run=False, only_cards=card["name"])
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Conico tasks to Trello")
    parser.add_argument("--dry-run", action="store_true", help="preview push, no writes")
    parser.add_argument("--apply", action="store_true", help="push JSON -> Trello")
    parser.add_argument("--pull", action="store_true",
                        help="pull Trello -> JSON (Trello wins; rewrites trello_cards.json)")
    parser.add_argument("--enrich", action="store_true",
                        help="LLM triage: pull -> fill desc/checklist/labels/list "
                             "for bare cards (skips done lists) -> push back to Trello.")
    parser.add_argument("--no-push", action="store_true",
                        help="with --enrich: stop after writing enriched JSON, "
                             "do not auto-push to Trello.")
    parser.add_argument("--model", default="haiku",
                        help="LLM alias for --enrich: "
                             "haiku|sonnet|opus|gemini-flash|gpt-mini, "
                             "or any full provider slug like 'anthropic/claude-haiku-4.5' "
                             "(default: haiku)")
    parser.add_argument("--provider", default="auto",
                        choices=["auto", "straico", "openrouter"],
                        help="LLM provider for --enrich. "
                             "'auto' tries Straico first, falls back to OpenRouter. "
                             "(default: auto)")
    parser.add_argument("--only-cards", default=None,
                        help="filter cards by name substring (case-insensitive); push only")
    parser.add_argument("--only-list", default=None,
                        help="filter cards by list/column name substring (case-insensitive); push only")
    parser.add_argument("--link-commit", default=None, metavar="HASH",
                        help="link a commit (sha, ref, or HEAD) to one card; "
                             "use with --card. Updates JSON + auto-applies "
                             "unless --no-push is set.")
    parser.add_argument("--card", default=None, metavar="NAME_SUBSTR",
                        help="card name substring for --link-commit (must match exactly one)")
    parser.add_argument("--cards-file", default=str(CARDS_FILE))
    args = parser.parse_args()

    modes = sum([args.dry_run, args.apply, args.pull, args.enrich,
                 bool(args.link_commit)])
    if modes != 1:
        print("error: pass exactly one of "
              "--dry-run / --apply / --pull / --enrich / --link-commit",
              file=sys.stderr)
        return 2

    if args.link_commit and not args.card:
        print("error: --link-commit requires --card NAME_SUBSTR", file=sys.stderr)
        return 2

    load_dotenv(ENV_FILE)
    missing = [v for v in ("TRELLO_API_KEY", "TRELLO_TOKEN", "TRELLO_BOARD_ID")
               if not os.environ.get(v)]
    if missing:
        print(f"error: missing env vars: {', '.join(missing)}", file=sys.stderr)
        print(f"set them in env or create {ENV_FILE}", file=sys.stderr)
        return 2

    board_id = os.environ["TRELLO_BOARD_ID"]
    cards_path = Path(args.cards_file)

    if args.pull:
        return pull(board_id, cards_path)

    if args.link_commit:
        spec = json.loads(cards_path.read_text(encoding="utf-8"))
        return link_commit(spec, cards_path, args.link_commit, args.card,
                           board_id=board_id, push=not args.no_push)

    if args.enrich:
        print("Pulling Trello -> JSON before enrichment...")
        pull(board_id, cards_path)
        spec = json.loads(cards_path.read_text(encoding="utf-8"))
        return enrich(spec, cards_path, args.model,
                      board_id=board_id, push=not args.no_push,
                      provider=args.provider)

    spec = json.loads(cards_path.read_text(encoding="utf-8"))
    return apply_spec(spec, board_id, dry_run=args.dry_run,
                      only_cards=args.only_cards, only_list=args.only_list)


if __name__ == "__main__":
    sys.exit(main())
