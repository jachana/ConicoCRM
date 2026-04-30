# Trello/auto_loop refactor — continuation

Picks up after commit `80dd3af` (`refactor(trello): cache, dedup helpers, lean LLM payload`).

## Done so far (in `trello_sync.py`)

- `http()` honors `Retry-After` on 429 (clamped 30 s).
- Module-level `_BOARD_CACHE` (90 s TTL) wraps `fetch_lists` / `fetch_labels`. `invalidate_cache()` exposed; auto-invalidated on POST list/label.
- New helpers:
  - `update_card(card_id, **fields)` — single PUT.
  - `find_card_id(board_id, name)` — lookup.
  - `dedupe_cards(board_id, exclude_lists=None)` — moves every copy of duplicate-named cards into list `Duplicates - review` (creates list if missing). Returns names moved.
- `PROVIDERS` config table replaces `_call_straico` / `_call_openrouter`. Same external behavior; `_call_provider(name, ...)` is the unified path.
- `_build_prompt` slims style examples: drops empty fields, truncates desc to 500 chars.

## Remaining tasks (in `auto_loop.py`)

### Task 1 — refactor `claim()` to single PUT

Replace `claim()` body so it does NOT call `ts.apply_spec`. Use the new `ts.update_card`.

```python
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
```

Update callsite in `iteration()` to pass `board_id`. Same shape for `ship()` and `fail()` if you want — single PUT instead of full apply each. (Optional but cheap.)

### Task 5 — smaller commit window

In `_recent_commits`, change default `n: int = 500` to `n: int = 200`. Optional: expose as `--commit-window` CLI arg.

### Task 6 — call `dedupe_cards` + skip duplicates

In `iteration()`, right after `ts.pull(...)` and before `reconcile_already_done`:

```python
print("\n=== dedupe ===")
moved_dups = ts.dedupe_cards(board_id, exclude_lists=set(DONE_LISTS))
if moved_dups:
    ts.pull(board_id, CARDS_FILE)  # refresh JSON after move
    spec = load_spec()
```

In `candidates()` and `reconcile_already_done()`, filter out cards in list `ts.DUPLICATES_LIST` ("Duplicates - review"). Trivially `if c["list"] == ts.DUPLICATES_LIST: continue`.

### Task 7 — replace `looks_implemented` regex auto-ship with scoped-test gate

Goal: when token-match flags a card as "maybe implemented", confirm by running ONLY the tests touched in the matching commits. Auto-ship only on pass.

New helpers:

```python
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
```

Rewrite `reconcile_already_done` so the auto-ship branch becomes:

1. `matches = looks_implemented(card, commits)` — keep current heuristic, it's only the *candidate* signal now.
2. `files = _files_in_commits([sha for sha,_ in matches])`
3. `tests_in_commits = [f for f in files if is_test_file(f)]` (use `_split_test_files` above to filter)
4. If `tests_in_commits` non-empty → `run_scoped_tests`. Pass → ship. Fail → log + skip.
5. Else if no test files → fall through to **Task 8** (gen tests).

### Task 8 — coverage gate: auto-write tests + tautology guard

Path B from Task 7 (matched commits but no tests touched).

```python
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
        "- Backend: backend/tests/test_<feature>.py — pytest, FastAPI TestClient via conftest.\n"
        "- Frontend: frontend/src/__tests__/<feature>.test.tsx — vitest + RTL.\n"
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


def _llm_call_with_prompt(system: str, user: str) -> dict | None:
    """Invoke ts.call_llm with a one-off prompt by monkey-patching ts._build_prompt."""
    spec_stub = {"cards": [], "lists": [], "labels": {}}
    orig = ts._build_prompt
    ts._build_prompt = lambda _b, _s: (system, user)
    try:
        result = ts.call_llm([], spec_stub, "haiku", provider="auto")
    finally:
        ts._build_prompt = orig
    if isinstance(result, list) and result:
        return result[0]
    if isinstance(result, dict):
        return result
    return None
```

Wire into reconcile (path B):

```python
gen = _generate_test_via_llm(card, matches)
if not gen or not gen.get("path") or not gen.get("code"):
    print(f"  ! gen-tests: LLM returned nothing for {name}; skip"); continue

test_path = REPO_ROOT / gen["path"]
test_path.parent.mkdir(parents=True, exist_ok=True)
test_path.write_text(gen["code"], encoding="utf-8")

ok, msg = run_scoped_tests([gen["path"]])
if not ok:
    test_path.unlink(missing_ok=True)
    print(f"  ! gen-tests fail for {name}: {msg[:200]}"); continue

if not _grade_test_via_llm(card, gen["code"]):
    test_path.unlink(missing_ok=True)
    print(f"  ! gen-tests deemed tautological for {name}; skip"); continue

git("add", gen["path"])
subprocess.run(["git", "commit", "-m", f"test: add coverage for {name}"],
               cwd=str(REPO_ROOT), check=False)
new_sha = git_head()
matches = matches + [(new_sha, f"test: add coverage for {name}")]
# fall through to ship
```

## Verify

After all changes:
- `python -c "import ast; ast.parse(open('scripts/auto_loop.py', encoding='utf-8').read())"` — syntax.
- `python scripts/auto_loop.py --dry-run` — runs through pull → dedupe → triage → pick, stops before claim.
- Single-iteration smoke: `python scripts/auto_loop.py --max 1` against a deliberately-bare `Feature requests` card.

## State of TaskList in last session

```
#1 [in_progress] Add update_card single-PUT helper          (helper done in trello_sync; auto_loop wiring pending)
#2 [completed]   Honor 429 Retry-After in http()
#3 [completed]   Cache lists/labels per iteration
#4 [completed]   Dedupe Straico/OpenRouter clients
#5 [pending]     Lean triage payload + smaller commit window  (payload done; commit window pending)
#6 [pending]     Detect duplicate-name cards → Duplicates list
#7 [pending]     Replace looks_implemented with scoped-test ship gate
#8 [pending]     Coverage gate + auto-add tests + tautology guard
```
