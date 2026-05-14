# Conico Project

## Trello Workflow
- Trello online is the canonical source of truth; local JSON only tracks the active card.
- Before claiming a card, verify it isn't already shipped/implemented by checking recent commits and the actual codebase, not just the card title.
- After implementing, run full test suite, commit, push, AND move the card to 'In review' on Trello.

## Execution

When executing implementation plans, always use **superpowers:subagent-driven-development** (never superpowers:executing-plans or inline execution).

## Trello sync

The Trello board (ConicoCRM, id `69f0015d87f756962fb74da8`) is the **single source of truth** for project status. The local `.trello_agent/cards.json` is **not** a mirror of the board — it holds only the card currently being worked on, as a transient working file.

All project-specific tboard artifacts live under `.trello_agent/`: `config.toml`, `cards.json`, `.env` (gitignored), `breakdowns.json`, `codebase_map.md`, `logs/` (gitignored), `failure_log.json` (gitignored).

Sync is driven by the **`tboard`** CLI (project-agnostic, lives in `C:/Otros/trello`, installed via `pip install -e`). It auto-discovers `.trello_agent/config.toml` walking up from CWD. Idempotent — matches cards by name.

Conflict rule: **online wins**. If local JSON disagrees with the board, `tboard sync --pull` overwrites local. But online must also be kept up to date — every state change (start, ship, scope, new bug) must be pushed to Trello.

### Workflow

1. **Pull to look around.** `tboard sync --pull` to fetch current board into JSON. Read what's available, decide what to work on. Don't commit this snapshot — it's transient.
2. **Pick a card.** Confirm it is NOT already in `In progress` (another agent may have claimed it). If it is, pick a different one.
3. **Prune local JSON to just that card.** Remove every other card from `.trello_agent/cards.json` so the file represents only the active claim.
4. **Claim on Trello.** Set the chosen card's `list` to `In progress`, run `tboard sync --apply`, commit with `chore(trello): claim <card name>`. `--apply` never deletes cards from Trello, so pruning local JSON is safe.
5. **Do the work.**
6. **Update Trello as state changes.** Move list, tick checklist items, append sub-tasks — edit local JSON for the active card, `tboard sync --apply`, commit.
7. **When the card ships.** Use `--ship-review` (see below) — DO NOT just edit `list` to `In review` and `--apply`. The ship-review command rewrites the card description and checklist into the review-ready format the human reviewer expects.

### Shipping a card → `In review` (mandatory format)

When moving a card to `In review`, **always** use:

```
tboard sync --ship-review --card "<unique substring>"
```

This regenerates the card via LLM (default haiku, `--model sonnet` for richer output) using the git log between the claim commit and HEAD:

- **Description** is replaced with `**Resumen**` (1–2 sentence restatement of the ask) + `**Cambios / Decisiones**` (concrete bullets: real file paths, endpoints, schema changes, libs added).
- **Subtareas checklist** is replaced (wiped + refilled) with 3–7 short imperative manual-test steps a reviewer can run by hand to verify the change works end-to-end.

Auto-detects the "since" sha from the `chore(trello): claim <name>` commit. Override with `--since <sha>` if the claim commit is missing or wrong.

This rule applies to **every** card move to `In review`, whether shipped via `tboard loop` (which does this automatically) or via interactive Claude Code work. Do not bypass it.

### When to push updates to Trello

- Task started → card → `In progress` (before work begins; multi-agent claim signal).
- Feature shipped → card → `In review` (PR open) or `Friendly Beta 0.1` / `Live Beta 0.2` / `Live 1.0` per stage. User promotes between live lists manually.
- **Deferred/Phase work** → Create new card(s) in `Feature requests` for each deferred phase/subtask. Link to parent card, describe scope clearly. Push to board same cycle (`tboard sync --apply`).
- New TODO / bug / client request discovered → add card to `Feature requests`, `Bugs`, `Client feedback`, or `Ideas`. Push to board same cycle, don't accumulate locally.
- Checklist sub-item completed → tick it on the card (or move the whole card if the card itself is done).
- Sub-task added → append to that card's `checklist` array, `tboard sync --apply`.

### Autonomous loop (`tboard loop`)

Runs the workflow above end-to-end without supervision: pull → triage `Feature requests` via Straico/OpenRouter (Qwen) → pick easiest feasible card → claim → spawn `claude` CLI on the user's subscription (no API credit) → run the test pipeline declared in `trello.toml` → on pass: link commit, move to `In review`, push. On fail: `git reset --hard` to pre-attempt sha, append failure note to card, move back to `Feature requests`.

```
tboard loop                              # default branch (from trello.toml), until no eligible cards
tboard loop --branch dev --max 3
tboard loop --dry-run                    # triage only
tboard loop --triage-model qwen-72b --provider openrouter
```

Logs at `.trello_agent/logs/<ts>_<slug>.log`.

### Notes

- `.trello_agent/.env` is gitignored — never commit credentials.
- `tboard sync --apply` never deletes cards or checklist items from Trello; deletions happen on the board, then `--pull` reconciles.
- `--pull` removes JSON-only cards (Trello is canonical) and adds Trello-only cards. Only the configured checklist (`Subtareas`) is round-tripped; checked/unchecked state lives only on Trello.
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

## Testing & Shipping Checklist
- **On commit**: run only tests for changed module/files (targeted).
- **On card → `In review`**: run a smoke check (happy-path tests for the affected area).
- **Full suite** (backend + frontend): only when finishing a large multi-card feature or explicitly asked. Never run it for a single card.
- Always commit AND push when the user asks to 'ship' or 'implement' a task — don't stop at commit.
- After Alembic migrations, verify there's only one head before committing.

## UI Component Conventions
- This project uses `Modal` (not `Dialog`) and the `danger` variant (not `destructive`).
- Import icons from `lucide-react` directly; do not redefine `LucideIcon` types.
- Check existing component usage in the codebase before introducing new component names.

## Encoding
- Always read/write subprocess output and files with `encoding='utf-8'` explicitly. Windows/WSL defaults to cp1252 and will crash on Spanish characters or emoji.

CLAUDE_CODE_DISABLE_1M_CONTEXT=1
keep context lower than 300k