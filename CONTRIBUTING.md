# Contributing to Conico

Conico is a SaaS CRM/ERP for Chilean SMBs, built with FastAPI (backend) and React/Vite (frontend).

## Bundle size budget

### Current limits

These limits are enforced by CI via `scripts/size-check.js`. A build that exceeds them will fail the `bundle-size` job.

| Chunk   | Limit  |
|---------|--------|
| main    | 500 KB |
| vendor  | 600 KB |

Limits are defined in `config/perf-budget.json`.

### Long-term optimization target

The aspirational goal is **350 KB** for the main chunk. The current limits are intentionally relaxed to reflect the actual production bundle (~446 KB gzipped) and to avoid blocking the team while optimization work is in progress. Once the bundle is trimmed below 350 KB, update `config/perf-budget.json` accordingly.

### Run the visualizer locally

```bash
cd frontend
npm run build
# Open dist/stats.html in a browser
```

`stats.html` is a Rollup/Vite bundle visualizer. It shows every module's contribution to the final bundle and is the fastest way to find large dependencies.

### Run the size check locally

From the repo root:

```bash
node scripts/size-check.js
```

This reads `config/perf-budget.json` and compares it against the built assets in `frontend/dist/assets/`. Run `npm run build` inside `frontend/` first.

### If the CI bundle-size job fails

1. Open the GitHub Actions run that failed.
2. Download the `bundle-stats` artifact — it contains `stats.html`.
3. Open `stats.html` and look for unexpectedly large chunks or duplicated libraries.
4. Consider lazy-loading large routes with `React.lazy` / dynamic `import()`.
5. Check for accidental full-library imports (e.g. `import _ from 'lodash'` instead of `import debounce from 'lodash/debounce'`).
6. If the increase is intentional (new feature area), update `config/perf-budget.json` and document the reason in the PR description.
