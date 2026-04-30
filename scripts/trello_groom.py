#!/usr/bin/env python3
"""
Trello groomer for Conico.

Separate scrum-style prep pass. Runs *before* auto_loop so implementer
agents only ever pick well-shaped, ready cards.

Per non-done card it adds a structured groom block to the description:

    <!-- groom:start -->
    ```yaml
    complexity: S | M | L | XL
    priority_score: 0..100
    status: ready | stale | needs-split | blocked
    dependencies: ["[W1-04] Boleta DTE 39/41"]
    groomed_at: 2026-04-30
    groomed_by: claude-haiku
    evidence:
      - file: backend/app/api/proveedores.py:42
      - commit: f43fe50 (chore: ...)
    notes: "..."
    ```
    <!-- groom:end -->

The block is round-trippable through `trello_sync.py --pull` because it
lives inside the desc — the existing sync code preserves desc verbatim.

XL cards are decomposed: groomer asks the LLM for 2-4 sub-cards, posts
them to the same list with desc referencing parent name, and flips the
parent's status to `needs-split` (auto_loop should skip these).

Usage:
  python scripts/trello_groom.py --pull --apply
  python scripts/trello_groom.py --apply --only-list "Feature requests"
  python scripts/trello_groom.py --dry-run --provider straico --model haiku
  python scripts/trello_groom.py --regroom-after 24h    # re-groom stale grooms

This script is intentionally idempotent. Re-running on the same board
updates the groom block in place; never duplicates sub-cards (matches
sub-card name on parent).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

# Reuse the existing sync infra. Both files live in scripts/.
from trello_sync import (
    DONE_LISTS,
    ENV_FILE,
    fetch_cards,
    http,
    load_dotenv,
    prompt_json,
    update_card,
)

GROOM_START = "<!-- groom:start -->"
GROOM_END = "<!-- groom:end -->"
DEFAULT_REGROOM_AFTER = timedelta(hours=24)
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent


# --------------------------------------------------------------------------- #
# Groom block parse / render
# --------------------------------------------------------------------------- #

def parse_groom_block(desc: str) -> dict | None:
    """Pull the YAML-ish payload out of a desc, if present."""
    m = re.search(
        rf"{re.escape(GROOM_START)}\s*```yaml\s*(.*?)\s*```\s*{re.escape(GROOM_END)}",
        desc or "",
        re.DOTALL,
    )
    if not m:
        return None
    # We always write JSON inside the ```yaml fence (valid YAML, no anchors),
    # so json.loads round-trips. Hand-edits in Trello break this — that's
    # fine, parse failure just re-grooms the card next pass.
    try:
        return json.loads(m.group(1).strip())
    except Exception:
        return None


def render_groom_block(payload: dict) -> str:
    body = json.dumps(payload, indent=2, ensure_ascii=False)
    return f"{GROOM_START}\n```yaml\n{body}\n```\n{GROOM_END}"


def replace_groom_block(desc: str, new_block: str) -> str:
    if not desc:
        return new_block
    if GROOM_START in desc:
        return re.sub(
            rf"{re.escape(GROOM_START)}.*?{re.escape(GROOM_END)}",
            new_block,
            desc,
            flags=re.DOTALL,
        )
    sep = "" if desc.endswith("\n") else "\n\n"
    return f"{desc}{sep}\n{new_block}\n"


# --------------------------------------------------------------------------- #
# Heuristics — cheap signals before any LLM call
# --------------------------------------------------------------------------- #

def already_shipped_signals(card: dict) -> list[str]:
    """Grep codebase + recent commits for keywords from card name/desc.

    Returns evidence strings; empty list = no hit. We bias toward false
    negatives (don't mark stale unless multiple signals agree) — the LLM
    later weighs evidence against the actual ask.
    """
    keywords = _extract_keywords(card)
    if not keywords:
        return []

    hits: list[str] = []
    for kw in keywords[:3]:  # cap — keywords beyond top 3 are noise
        # Recent commits.
        try:
            log = subprocess.check_output(
                ["git", "-C", str(REPO_ROOT), "log", "--oneline",
                 "-n", "60", f"--grep={kw}"],
                stderr=subprocess.DEVNULL, text=True, encoding="utf-8",
            ).strip()
            for line in log.splitlines()[:2]:
                hits.append(f"commit: {line}")
        except subprocess.CalledProcessError:
            pass

        # Codebase grep — limit to source dirs to avoid node_modules noise.
        try:
            grep = subprocess.check_output(
                ["git", "-C", str(REPO_ROOT), "grep", "-l", "-i", kw,
                 "--", "backend/app", "frontend/src"],
                stderr=subprocess.DEVNULL, text=True, encoding="utf-8",
            ).strip()
            for path in grep.splitlines()[:2]:
                hits.append(f"file: {path}")
        except subprocess.CalledProcessError:
            pass

    return hits


def _extract_keywords(card: dict) -> list[str]:
    """Strip [W1-XX] tags, drop stopwords, keep distinctive Spanish nouns."""
    name = re.sub(r"\[[^\]]+\]", "", card.get("name") or "").strip()
    tokens = re.findall(r"[A-Za-zÀ-ÿ]{4,}", name)
    stop = {
        "para", "como", "desde", "hasta", "este", "esta", "todos", "todas",
        "agregar", "permitir", "implementar", "feature", "bug",
    }
    return [t for t in tokens if t.lower() not in stop]


# --------------------------------------------------------------------------- #
# LLM call: one card -> groom payload (complexity, deps, decomposition)
# --------------------------------------------------------------------------- #

GROOM_SYSTEM = """You are a scrum-style backlog groomer for the Conico SaaS
(Python/FastAPI + React/TS + Trello). For each card, decide:

  complexity:  S (<2h, single file/module)
               M (~half day, 2-4 files, one layer)
               L (~1-2 days, full stack but cohesive)
               XL (>2 days OR cross-cutting OR ambiguous spec)
  status:      ready    -> implementer can pick now
               stale    -> evidence shows it's already shipped
               needs-split -> XL or ambiguous; subcards proposed
               blocked  -> depends on another open card
  priority_score: 0-100. High = small + unblocked + user-facing.
  dependencies: list of OTHER card names (verbatim) this needs first.
  notes: one sentence. why this status. cite evidence file/commit if stale.
  subcards: ONLY when status=needs-split. 2-4 items, each
            {name: "[parent-tag] sub-name", scope: "..."}.
            Each sub-card MUST be S or M individually.

Output JSON only — array with one object per input card. No prose."""


def groom_card_via_llm(
    card: dict,
    all_cards: list[dict],
    evidence: list[str],
    model_alias: str,
    provider: str,
) -> dict:
    """One LLM call per card. Cheap model OK — payload is small.

    Returns the groom payload (complexity, status, priority_score,
    dependencies, notes, [subcards]). `groomed_at`/`groomed_by` are
    stamped by the caller after success.
    """
    sibling_names = [c["name"] for c in all_cards if c["name"] != card.get("name")]
    user_payload = {
        "card": {
            "name": card.get("name"),
            "list": card.get("_list_name") or card.get("list"),
            "desc": (card.get("desc") or "")[:1500],
            "checklist": card.get("checklist") or [],
            "labels": card.get("labels") or [],
        },
        "siblings": sibling_names,
        "shipped_signals": evidence,
    }
    user = (
        "Groom this card. Return a single JSON object with fields: "
        "complexity, status, priority_score, dependencies, notes, "
        "and (only when status='needs-split') subcards. "
        "Names must match siblings verbatim if referenced. "
        "Return ONLY the JSON object — no prose, no markdown fences.\n\n"
        f"{json.dumps(user_payload, ensure_ascii=False, indent=2)}\n"
    )
    payload = prompt_json(GROOM_SYSTEM, user, model_alias, provider=provider)
    if not isinstance(payload, dict):
        raise RuntimeError(f"groom payload not an object: {type(payload).__name__}")

    # Light validation — keep only known fields, coerce types we care about.
    out = {
        "complexity": str(payload.get("complexity", "")).upper() or "M",
        "status": str(payload.get("status", "")).lower() or "ready",
        "priority_score": int(payload.get("priority_score") or 0),
        "dependencies": [str(d) for d in (payload.get("dependencies") or [])],
        "notes": (payload.get("notes") or "").strip(),
    }
    if out["complexity"] not in {"S", "M", "L", "XL"}:
        out["complexity"] = "M"
    if out["status"] not in {"ready", "stale", "needs-split", "blocked"}:
        out["status"] = "ready"
    if out["status"] == "needs-split":
        subs = payload.get("subcards") or []
        out["subcards"] = [
            {"name": str(s.get("name", "")).strip(),
             "scope": str(s.get("scope", "")).strip()}
            for s in subs
            if isinstance(s, dict) and s.get("name")
        ]
    if evidence:
        out["evidence"] = evidence[:6]
    return out


# --------------------------------------------------------------------------- #
# Sub-card creation (XL decomposition)
# --------------------------------------------------------------------------- #

def create_subcards(parent: dict, parent_id: str, list_id: str,
                    subcards: list[dict], dry_run: bool) -> list[str]:
    """Create proposed sub-cards on Trello, idempotent by name."""
    existing = {c["name"] for c in fetch_cards(parent.get("_board_id"))}
    created: list[str] = []
    for sc in subcards:
        name = sc["name"]
        if name in existing:
            print(f"    = subcard exists: {name}")
            continue
        desc = (
            f"Parent: **{parent['name']}**\n\n"
            f"**Scope:** {sc.get('scope', '')}\n\n"
            f"_Created by trello_groom on {datetime.now(timezone.utc):%Y-%m-%d}_"
        )
        if dry_run:
            print(f"    + subcard (dry): {name}")
        else:
            http("POST", "/cards",
                 params={"name": name, "desc": desc, "idList": list_id})
            print(f"    + subcard: {name}")
        created.append(name)
    return created


# --------------------------------------------------------------------------- #
# Main groom pass
# --------------------------------------------------------------------------- #

def groom(
    board_id: str,
    model_alias: str,
    provider: str,
    dry_run: bool,
    only_list: str | None,
    regroom_after: timedelta,
) -> int:
    cards = fetch_cards(board_id)
    # Resolve list names — fetch_cards returns idList only.
    lists = http("GET", f"/boards/{board_id}/lists")
    list_name = {l["id"]: l["name"] for l in lists}
    list_id_by_name = {l["name"]: l["id"] for l in lists}

    now = datetime.now(timezone.utc)
    cutoff = now - regroom_after
    eligible: list[dict] = []
    for c in cards:
        lname = list_name.get(c["idList"], "")
        if lname in DONE_LISTS:
            continue
        if only_list and only_list.lower() not in lname.lower():
            continue
        existing_groom = parse_groom_block(c.get("desc") or "")
        if existing_groom:
            ts = existing_groom.get("groomed_at")
            try:
                if ts and datetime.fromisoformat(ts) > cutoff:
                    continue  # fresh enough, skip
            except ValueError:
                pass
        c["_list_name"] = lname
        c["_board_id"] = board_id
        eligible.append(c)

    print(f"Grooming {len(eligible)} card(s)  "
          f"(cutoff: {regroom_after}, model: {model_alias}, provider: {provider})")

    for c in eligible:
        print(f"\n• {c['name']}  [{c['_list_name']}]")
        evidence = already_shipped_signals(c)
        if evidence:
            print(f"    shipped signals: {len(evidence)}")
            for e in evidence[:3]:
                print(f"      - {e}")

        try:
            payload = groom_card_via_llm(c, cards, evidence, model_alias, provider)
        except NotImplementedError as e:
            print(f"    ! {e}")
            continue
        except Exception as e:
            print(f"    ! groom failed: {e}", file=sys.stderr)
            continue

        payload.setdefault("groomed_at", now.isoformat(timespec="seconds"))
        payload.setdefault("groomed_by", f"{provider}:{model_alias}")

        block = render_groom_block(payload)
        new_desc = replace_groom_block(c.get("desc") or "", block)

        if dry_run:
            print(f"    (dry) would update desc; status={payload.get('status')}")
        else:
            update_card(c["id"], desc=new_desc)
            print(f"    ~ groomed: status={payload.get('status')} "
                  f"complexity={payload.get('complexity')} "
                  f"prio={payload.get('priority_score')}")

        if payload.get("status") == "needs-split":
            subcards = payload.get("subcards") or []
            if subcards:
                create_subcards(c, c["id"], c["idList"], subcards, dry_run)

    return 0


def main() -> int:
    load_dotenv(ENV_FILE)  # populates TRELLO_*, STRAICO_*, OPENROUTER_*
    p = argparse.ArgumentParser(description="Trello backlog groomer")
    p.add_argument("--apply", action="store_true",
                   help="Push groom blocks + subcards to Trello")
    p.add_argument("--dry-run", action="store_true",
                   help="Print plan, no writes")
    p.add_argument("--provider", default="auto",
                   choices=["auto", "straico", "openrouter"])
    p.add_argument("--model", default="haiku",
                   help="alias from PROVIDER_MODELS (haiku|sonnet|gemini-flash|...)")
    p.add_argument("--only-list", default=None,
                   help="restrict to one list (substring match)")
    p.add_argument("--regroom-after", default="24h",
                   help="skip cards groomed within this window (e.g. 6h, 2d)")
    args = p.parse_args()

    if not (args.apply or args.dry_run):
        p.error("pass --apply or --dry-run")

    board_id = (
        __import__("os").environ.get("TRELLO_BOARD_ID")
        or "69f0015d87f756962fb74da8"  # ConicoCRM, per CLAUDE.md
    )
    return groom(
        board_id=board_id,
        model_alias=args.model,
        provider=args.provider,
        dry_run=args.dry_run,
        only_list=args.only_list,
        regroom_after=_parse_duration(args.regroom_after),
    )


def _parse_duration(s: str) -> timedelta:
    m = re.fullmatch(r"(\d+)\s*([hdm])", s.strip().lower())
    if not m:
        raise SystemExit(f"bad --regroom-after: {s!r}")
    n, unit = int(m.group(1)), m.group(2)
    return {"h": timedelta(hours=n),
            "d": timedelta(days=n),
            "m": timedelta(minutes=n)}[unit]


if __name__ == "__main__":
    sys.exit(main())
