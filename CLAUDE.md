# Conico Project

## Execution

When executing implementation plans, always use **superpowers:subagent-driven-development** (never superpowers:executing-plans or inline execution).

## Trello sync

The Trello board (ConicoCRM, id `69f0015d87f756962fb74da8`) is the single source of truth for project status. It is driven by `scripts/trello_cards.json` + `scripts/trello_sync.py` (idempotent — match by card name).

Update Trello whenever any of these happen:
- **A task / card is started** → move card to `In progress` *before* beginning work, sync with `--apply`, and commit. This is the multi-agent coordination signal — other agents must NOT pick up a card already in `In progress`. Use `--pull` first if another agent may have just claimed something.
- A phase / feature / wave item is shipped → move card to the appropriate list (`Friendly Beta 0.1` for shipped MVP work, `In review` if PR open, `Live Beta 0.2` / `Live 1.0` once promoted).
- A new TODO / pending item / bug is discovered → add a card to `Feature requests` (engineering backlog), `Bugs`, `Client feedback`, or `Ideas` (Wave 4–6 / speculative).
- A checklist sub-item is completed → tick it on Trello (or, if the whole card is done, move the card list-state).
- A pending item gains scope (new sub-task) → append to that card's `checklist` array.

Multi-agent claim protocol (when starting a task):
1. `python scripts/trello_sync.py --pull` — refresh JSON from board (other agents may have claimed cards).
2. Confirm the target card is NOT already in `In progress`. If it is, pick a different card.
3. Edit `scripts/trello_cards.json`: set the card's `list` to `In progress`.
4. `python scripts/trello_sync.py --apply` — publish the claim immediately (don't batch with later edits).
5. Commit the JSON change with a `chore(trello): claim <card name>` message so the claim is visible in git too.
6. Then begin the actual work.

Workflow (push, JSON wins):
1. Edit `scripts/trello_cards.json` — change card's `list`, append `checklist` items, add new card objects, etc. Card `name` is the stable id; never rename casually.
2. Run `python scripts/trello_sync.py --apply` (no dry-run needed — idempotent and safe to re-run).
3. Commit `scripts/trello_cards.json` alongside the code change so Trello state is reproducible from git.

Workflow (pull, Trello wins):
- Run `python scripts/trello_sync.py --pull` to refresh `scripts/trello_cards.json` from current board state. Always do this **before** editing the JSON if the user has been adding/moving cards on Trello directly — otherwise `--apply` will drop their additions.
- Pull adds Trello-only cards to JSON and removes JSON-only cards from JSON (Trello is canonical for that direction). Only the `Subtareas` checklist is round-tripped; checked/unchecked state lives only on Trello.

Notes:
- `scripts/.trello.env` is gitignored and holds credentials — never commit it.
- `--apply` never deletes cards or checklist items; deletions must happen on Trello (then `--pull` to reconcile).
- Labels in use: `Wave 1`, `Wave 2`, `Tier A`, `DTE/SII`, `Design System`, `Core`, `Roadmap`, `Bug`, `Blocked`.

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