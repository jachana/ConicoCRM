# Conico Project

## Execution

When executing implementation plans, always use **superpowers:subagent-driven-development** (never superpowers:executing-plans or inline execution).

## Trello sync

The Trello board (ConicoCRM, id `69f0015d87f756962fb74da8`) is the **single source of truth** for project status. The local `scripts/trello_cards.json` is **not** a mirror of the board — it holds only the card currently being worked on, as a transient working file. Sync is driven by `scripts/trello_sync.py` (idempotent — match by card name).

Conflict rule: **online wins**. If local JSON disagrees with the board, `--pull` overwrites local. But online must also be kept up to date — every state change (start, ship, scope, new bug) must be pushed to Trello.

### Workflow

1. **Pull to look around.** `python scripts/trello_sync.py --pull` to fetch current board into JSON. Read what's available, decide what to work on. Don't commit this snapshot — it's transient.
2. **Pick a card.** Confirm it is NOT already in `In progress` (another agent may have claimed it). If it is, pick a different one.
3. **Prune local JSON to just that card.** Remove every other card from `scripts/trello_cards.json` so the file represents only the active claim.
4. **Claim on Trello.** Set the chosen card's `list` to `In progress`, run `python scripts/trello_sync.py --apply`, commit with `chore(trello): claim <card name>`. `--apply` never deletes cards from Trello, so pruning local JSON is safe.
5. **Do the work.**
6. **Update Trello as state changes.** Move list, tick checklist items, append sub-tasks — edit local JSON for the active card, `--apply`, commit.
7. **When the card ships.** Move it to `In review` (PR open) or the appropriate shipped list, `--apply`, commit. Then it can be removed from local JSON on the next pull/prune cycle.

### When to push updates to Trello

- Task started → card → `In progress` (before work begins; multi-agent claim signal).
- Feature shipped → card → `In review` (PR open) or `Friendly Beta 0.1` / `Live Beta 0.2` / `Live 1.0` per stage. User promotes between live lists manually.
- New TODO / bug / client request discovered → add card to `Feature requests`, `Bugs`, `Client feedback`, or `Ideas`. Push to board same cycle (--apply), don't accumulate locally.
- Checklist sub-item completed → tick it on the card (or move the whole card if the card itself is done).
- Sub-task added → append to that card's `checklist` array, --apply.

### Autonomous loop (`scripts/auto_loop.py`)

Runs the workflow above end-to-end without supervision: pull → triage `Feature requests` via Straico/OpenRouter (Qwen) → pick easiest feasible card → claim → spawn `claude` CLI on the user's subscription (no API credit) → run full backend + frontend tests → on pass: link commit, move to `In review`, push. On fail: `git reset --hard` to pre-attempt sha, append failure note to card, move back to `Feature requests`.

```
python scripts/auto_loop.py                       # master, until no eligible cards
python scripts/auto_loop.py --branch dev --max 3
python scripts/auto_loop.py --dry-run             # triage only
python scripts/auto_loop.py --triage-model qwen-72b --provider openrouter
```

Logs at `.claude/auto_loop_logs/<ts>_<slug>.log`.

### Notes

- `scripts/.trello.env` is gitignored — never commit credentials.
- `--apply` never deletes cards or checklist items from Trello; deletions happen on the board, then `--pull` reconciles.
- `--pull` removes JSON-only cards (Trello is canonical) and adds Trello-only cards. Only `Subtareas` checklist is round-tripped; checked/unchecked state lives only on Trello.
- Card `name` is the stable id — never rename casually.
- Labels: `Wave 1`, `Wave 2`, `Tier A`, `DTE/SII`, `Design System`, `Core`, `Roadmap`, `Bug`, `Blocked`.

# Project Rules

## Tool & Command Policy
- **Permission Handling**: Do not ask for permission for routine read, test, or build commands.
- **Authorized Commands**: 
  - `npm test`
  - `git status`
  - `ls`
- **Confirmation Required**: Always ask before running destructive commands like `rm` or `git reset --hard`.
CLAUDE_CODE_DISABLE_1M_CONTEXT=1
keep context lower than 300k