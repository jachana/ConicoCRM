# Codebase Concerns

**Analysis Date:** 2026-04-25

> Brownfield Chilean SMB PMS. PROGRESS.md tracks completed work; `docs/backlog.md` and `docs/roadmap-crm.md` track open commitments. Concerns below are derived from a live audit of `backend/app/` and `frontend/src/` and cross-referenced with the published backlog.

---

## Tech Debt

**Stock-on-NV instead of stock-on-emit (W1-08, P0):**
- Issue: NV creation eagerly decrements `Producto.stock_actual` and writes `MovimientoInventario(tipo='salida')`, but a NV is not yet a fiscal sale. The boleta path already moved to "decrement on emit" (`app/services/boleta_stock.py`). Factura path inherits stock state from the NV — there is no inventory event at factura emission. Cancelling/editing a NV requires manual reversal logic in `_registrar_movimientos_devolucion`.
- Files: `backend/app/api/nota_ventas.py:159-190,319,396,491`, `backend/app/api/aprobaciones_costo.py:31`, `backend/app/services/boleta_stock.py`
- Impact: divergent stock semantics between channels (boleta vs NV→factura); cancelled NVs that never became factura still consumed stock until reversed; reports that count `salida` movements double-count when a NV becomes a factura.
- Fix approach: per W1-08, move all stock decrement to factura/boleta emission; on NV creation only reserve via a soft `Reserva` table or status flag; reverse on cancel/anular.

**Duplicate `.js` files alongside `.tsx` in `frontend/src/pages/` (CC-04, P2):**
- Issue: 40 build-artifact `.js` files committed next to their `.tsx` source (e.g., `Cotizaciones.js` + `Cotizaciones.tsx`). Same problem in `frontend/src/api/` (`preferencias.js`, `search.js`, `tareas.js`). Vite resolves `.tsx` first so they are dead, but they pollute search, diff and reviewer attention.
- Files: `frontend/src/pages/*.js` (40 files), `frontend/src/api/preferencias.js`, `frontend/src/api/search.js`, `frontend/src/api/tareas.js`, `frontend/src/lib/api.js`, `frontend/src/lib/columnDefs.js`, `frontend/src/lib/pdf.js`
- Impact: misleading `Grep` results; new contributors edit the wrong file; CI build size inflated.
- Fix approach: `git rm` the `.js` duplicates, add `*.js` to `frontend/src/.gitignore` for source folders, run `npm test` + `tsc --noEmit` to confirm.

**`metodo_pago` enum drift across modules (high confusion risk):**
- Issue: same business concept defined four times with different value sets and casing.
  - `backend/app/schemas/factura.py:41` — Title-Case Spanish: `{"Efectivo", "Transferencia", "Cheque", "Débito", "Crédito", "Mixto"}`
  - `backend/app/api/pagos.py:16` — lowercase + `deposito`: `{"efectivo", "transferencia", "cheque", "debito", "credito", "deposito"}`
  - `backend/app/schemas/boleta.py:7` — lowercase + `otro`: `{"efectivo", "debito", "credito", "transferencia", "otro"}`
  - `frontend/src/pages/FacturaDetalle.tsx:26` and `Pagos.tsx:9` — different casings replicated client-side.
- Impact: a payment registered from `/pagos` against a factura is stored with a value the factura schema would reject on PATCH; reports that aggregate by `metodo_pago` undercount due to case sensitivity; UI mismatches confuse users.
- Fix approach: introduce a single `app/schemas/payment_methods.py` enum (canonical lowercase, e.g., `efectivo|transferencia|cheque|debito|credito|deposito|otro|mixto`), normalize on input, migrate existing rows.

**Centralised permission layer split (CC-02, P2):**
- Issue: permission logic is split between `app/core/security.py` (token + hashing only), `app/api/deps.py` (`require_permission`), and per-router role checks (`if current_user.role not in ("admin", "subadmin")` repeated in `facturas.py`, `cobranza.py`, `nota_ventas.py`, etc.). No single source of truth for "who can do X".
- Files: `backend/app/api/facturas.py:317,352,412`, `backend/app/api/cobranza.py:188`, `backend/app/api/nota_ventas.py:108-109,282`, `backend/app/api/dte.py` (NC/ND endpoints have permission-only check, no role guard)
- Impact: easy to forget a role check on a new endpoint (DTE NC/ND creation only checks `facturas:create` permission but no role guard, while paired factura endpoint enforces admin/subadmin); audit/reasoning is fragmented.
- Fix approach: collapse all role/permission decisions into a single `Authorizer` class consumed via dependency injection; remove inline `role not in (...)` literals.

**Frontend axios duplication (CC-03, P2):**
- Issue: `frontend/src/lib/api.ts` defines a properly-configured axios client with auth + refresh interceptors, but multiple modules import `axios` directly instead of `api`, bypassing the interceptor stack.
- Files: search for `from 'axios'` imports outside `lib/api.ts` (e.g., refresh call inside `lib/api.ts:21` is fine; the concern is non-`api`-typed call sites in pages).
- Impact: 401-driven refresh and Authorization header injection only fire for callers that imported `api`; ad-hoc `axios.get` from a component will silently log out.
- Fix approach: enforce a single client; ESLint rule `no-restricted-imports` for `axios` outside `lib/api.ts`.

**No central CI pipeline (W1-03, P0):**
- Issue: branch-protection-quality guardrails missing despite parallel-agent workflow declared in `docs/AGENTS.md`. Tests exist (63 backend pytest files, vitest in frontend) but are not enforced on PR.
- Files: no `.github/workflows/*.yml`, no `.gitlab-ci.yml`.
- Impact: regressions land on `master`; backlog explicitly flags this as P0 hardening blocker for the multi-agent workflow.
- Fix approach: per backlog W1-03 — GitHub Actions matrix (`backend pytest`, `frontend lint+vitest`, `docker build`).

---

## Known Bugs

**Tokens persisted to `localStorage` via Zustand `persist` (XSS exposure):**
- Symptoms: `accessToken` + `refreshToken` survive page reload but live in JS-readable storage.
- Files: `frontend/src/stores/auth.ts:14-26` (`persist({ name: 'conico-auth' })`)
- Trigger: any DOM XSS (e.g., a third-party SDK injection, a markdown render in a future feature) hands tokens to the attacker; refresh-token theft = persistent account access.
- Workaround: short access TTL (`access_token_expire_minutes=30`) + 7d refresh, but refresh in localStorage defeats that protection.
- Fix approach: switch to httpOnly+Secure+SameSite=Strict refresh cookie issued by `/api/auth/refresh`; access token kept in memory only; logout clears cookie server-side.

**`refresh` endpoint trusts JWT `sub` without rotation/blacklist:**
- Symptoms: a stolen refresh token works until natural expiry (7d). No rotation, no revocation list, no `iat`/`jti` tracking.
- Files: `backend/app/api/auth.py:35-46`, `backend/app/core/security.py:22-31`
- Trigger: token leak via XSS, postman history, log inadvertently capturing Bearer.
- Workaround: rotate `SECRET_KEY` (invalidates everyone).
- Fix approach: add `jti` claim, persist active refresh tokens table, rotate on each `/refresh`, allow per-user revocation; integrate with W1-07 2FA spec.

**Migration history vs declarative schema mismatch (silent prod risk):**
- Symptoms: `backend/migrate_sprint_a.py` and `backend/tests/conftest.py:91` call `Base.metadata.create_all`, while production runs Alembic migrations from `migrations/versions/`. Recent commit `9e86b4c fix(db): idempotent repair migration for dashboard_layouts` and migration `b7c8d9e0f1g2_repair_dashboard_layouts.py` and `v1w2x3y4z5a6_fix_schema_drift_descuento_banco_fk.py` confirm drift incidents have already shipped.
- Files: `backend/migrate_sprint_a.py:11`, `backend/tests/conftest.py:91`, `backend/migrations/versions/3a52bd7e8f91_drift_add_ordenes_compra.py`, `backend/migrations/versions/v1w2x3y4z5a6_fix_schema_drift_descuento_banco_fk.py`, `backend/migrations/versions/b7c8d9e0f1g2_repair_dashboard_layouts.py`
- Trigger: a developer adds a column to the model without an Alembic revision; tests pass against `create_all` SQLite, prod (Postgres + Alembic head) breaks at next deploy.
- Workaround: manual `alembic check` + repair migrations after the fact.
- Fix approach: pre-commit / CI step `alembic check` against current models; remove `migrate_sprint_a.py`; convert `conftest.py` to run actual migrations against an ephemeral Postgres.

**Frontend missing per-boleta XML drawer (TODO marker):**
- Symptoms: detail page shows DTE state but no raw XML for support/SII reconciliation.
- Files: `frontend/src/pages/BoletaDetalle.tsx:143` (`// TODO: backend does not expose per-boleta XML`)
- Workaround: query DB / Lioren dashboard manually.
- Fix approach: add `GET /api/boletas/{id}/xml` (proxy to `DteEmision.respuesta_sii`/Lioren) gated behind `boletas:view` + role admin.

**BoletaNueva not wired to canonical autocomplete / cliente picker:**
- Symptoms: vendedor types raw description and numeric `cliente_id`, bypassing the existing product autocomplete and `ClienteSelectModal`.
- Files: `frontend/src/pages/BoletaNueva.tsx:5-6` (TODOs)
- Trigger: every retail boleta entered via this form.
- Workaround: paste `cliente_id` from another tab.
- Fix approach: integrate the same components used in `CotizacionDetalle.tsx`/`NotaVentas.tsx`.

---

## Security Considerations

**No login throttling / brute-force protection:**
- Risk: `POST /api/auth/login` has no rate limit, no captcha, no account lockout.
- Files: `backend/app/api/auth.py:24-32`
- Current mitigation: bcrypt password hashing (`backend/app/core/security.py:6`).
- Recommendations: add slowapi or starlette-limiter (`5 attempts / 15 min / IP+email`), expose 429; log failed attempts to the existing `AuditLog`.

**No 2FA / no password reset (W1-07, P1):**
- Risk: any leaked password = full account access; no self-service recovery.
- Files: `backend/app/api/auth.py`, `backend/app/models/user.py`
- Current mitigation: passwords hashed with bcrypt; admin can reset via `/api/users` PATCH.
- Recommendations: per W1-07 — TOTP with `pyotp`, QR onboarding, signed-token reset email TTL 30 min, `system_config.require_2fa` toggle.

**File upload paths trust caller-derived components (RRHH + ProductoDocumento):**
- Risk: file save path is `uploads/empleados/{empleado_id}/{uuid}_{file.filename}` and `uploads/productos/{producto_id}/{uuid}_{file.filename}`. The `file.filename` is appended raw — a malicious filename like `..\..\windows.exe` is partially mitigated by the UUID prefix (so the file name still starts with a UUID) but it preserves attacker-chosen extensions and unicode tricks; `Path.write_bytes` does not normalise traversal. Download route reads `doc.ruta` directly from DB and `FileResponse`s it — if any code path ever wrote a non-uploads `ruta` it would leak.
- Files: `backend/app/api/empleados_documentos.py:51-53,75-81`, `backend/app/api/productos_documentos.py:64-66,86-93`
- Current mitigation: random UUID prefix on disk, content-type check on producto docs (PDF only), 10 MB cap, role-gated routes.
- Recommendations:
  1. Sanitize `file.filename` (strip path separators, NFC-normalise, restrict to `[A-Za-z0-9._-]`).
  2. On download, resolve the path and assert it is a child of `UPLOAD_DIR` (`Path.resolve().is_relative_to(UPLOAD_DIR.resolve())`).
  3. Validate magic bytes (not only `Content-Type`) for the producto PDF.
  4. Empleado upload accepts ANY MIME with no extension/type whitelist — restrict to `.pdf|.docx|.jpg|.png` + magic-byte sniff.

**Empleado document download exposes any file referenced by `EmpleadoDocumento.ruta`:**
- Risk: `descargar_documento` does `path = Path(doc.ruta)` and `FileResponse(str(path), filename=doc.nombre)` with no containment check (`backend/app/api/empleados_documentos.py:75-81`). If a future migration / data-fix sets `ruta` to anything outside `uploads/`, the route serves it.
- Current mitigation: only created via the upload endpoint that uses a controlled prefix; permission `rrhh:view` required.
- Recommendation: enforce `Path.resolve().is_relative_to((UPLOAD_DIR/'empleados').resolve())` before `FileResponse`.

**CORS reads from comma-separated env with `allow_credentials=True`:**
- Risk: `app/main.py:58-64` enables `allow_credentials=True` plus `allow_methods=["*"]` plus `allow_headers=["*"]`. If `CORS_ORIGINS` env is misconfigured to `*` or to a too-broad domain, browser cookies/Authorization can be exfiltrated cross-origin.
- Files: `backend/app/main.py:58-64`, `backend/app/config.py:14`
- Current mitigation: default is `http://localhost:15173` (dev only).
- Recommendations: validate at startup that no entry equals `*` when `allow_credentials=True`; document the prod allowed-origins set explicitly.

**JWT signed with HS256 + a single shared `secret_key`:**
- Risk: any service / test fixture / debug log that captures the secret can mint tokens. No key rotation hook.
- Files: `backend/app/core/security.py:18-29`, `backend/app/config.py:7`
- Current mitigation: secret loaded from env.
- Recommendation: when 2FA + refresh-rotation lands (W1-07), consider asymmetric (RS256 with a key pair) so verifier nodes never see the signing key; add `kid` for rotation.

**SMTP credentials stored as plain settings:**
- Risk: `smtp_password` is loaded from `.env` (`backend/app/config.py:10-13`) — fine for self-host, fragile for SaaS.
- Recommendation: when W6-01 multi-tenant ships, move tenant SMTP credentials to a vault, never to a single-config file.

**Lioren webhook signature uses `hmac.compare_digest` correctly, but raw body is decoded:**
- Risk: signature validation is correct (`backend/app/services/dte_service.py:216-220`); however the route does `await request.body()` then re-parses JSON (`backend/app/api/dte.py:261-269`), and silently ignores webhooks without `track_id`. An attacker who somehow guesses `webhook_secret` could replay state transitions; no replay window check.
- Recommendation: include `event_id` + `timestamp` in signature; reject if timestamp older than 5 min; persist last `event_id` per `track_id`.

---

## Performance Bottlenecks

**Unbounded list endpoints (no pagination):**
- Problem: `GET /api/cotizaciones`, `GET /api/nota_ventas/`, `GET /api/facturas/`, `GET /api/empresas/`, `GET /api/dte/notas-credito/`, `GET /api/dte/notas-debito/` return the full table ordered by id desc. Only `/api/auditoria` is paginated (`auditoria.py:102-129`).
- Files: `backend/app/api/nota_ventas.py:269`, `backend/app/api/facturas.py:308`, `backend/app/api/empresas.py:91,154,200,271,310,364,424,474,532` (many `.all()`), `backend/app/api/dte.py:138,213`
- Cause: missing `limit/offset` Query params + `.limit().offset()` chain.
- Improvement path: introduce a shared `Pagination` dependency (default `limit=50, max=200`) and migrate list endpoints; on the frontend, switch lists from full-load to virtualised + cursor pagination.

**`Cobranza.dashboard` and `Cobranza.recordatorios` load every pending factura into Python:**
- Problem: aging buckets and recordatorio filtering are computed in app code over a `.all()` result set; with 10k+ invoices this becomes an O(N) Python pass per page-load.
- Files: `backend/app/api/cobranza.py:41-108,116-169`
- Cause: aggregation that belongs in SQL is done in Python.
- Improvement path: rewrite aging as a `CASE WHEN` aggregate (`SELECT SUM(...) FILTER (WHERE ...)`); add covering index `(estado, fecha_vencimiento)` on `facturas`.

**`_check_credit_limit` materialises every non-anulada factura per NV save:**
- Problem: every NV creation (including from cotización) issues `SELECT * FROM facturas WHERE empresa_id=... AND estado!='anulada'` and sums in Python.
- Files: `backend/app/api/nota_ventas.py:108-132`
- Cause: same aggregation done in SQL would scale linearly with active customer load.
- Improvement path: replace with `SELECT COALESCE(SUM(total - monto_pagado), 0) FROM facturas WHERE empresa_id=:e AND estado IN ('emitida','parcial')`; add index `(empresa_id, estado)` on `facturas`.

**`reportes.py` is 2,036 lines of in-Python aggregations:**
- Problem: largest backend module by far. Every `/reportes/*` endpoint loads relevant rows and aggregates in memory, including `por-marca` cross-tabs.
- Files: `backend/app/api/reportes.py` (2,036 lines), 18 `joinedload` callsites, 23 `.all()` callsites.
- Cause: rapid feature delivery; reports never moved to DB-side aggregation.
- Improvement path: push aggregations to SQL; consider a materialised view for `ventas_por_dia`/`ventas_por_marca`; cap row count and stream Excel in chunks.

**`SystemConfig._get_config_dict` reloads all config rows for every NV operation:**
- Problem: `nota_ventas.py:50` does `db.query(SystemConfig).all()` to build a dict on each numbering pass. Small table today, but called on every NV mutation.
- Files: `backend/app/api/nota_ventas.py:49-50`
- Improvement path: cache via Redis with invalidation on config write; or query only the keys actually needed.

**Pageful `joinedload` on list endpoints can produce O(N×M) row explosions:**
- Problem: `_load_nv` chains 6 `joinedload`s including `lineas` and `sede_despacho` in a single query — Cartesian product when a NV has many lines AND many other related rows.
- Files: `backend/app/api/nota_ventas.py:194-201`, similar patterns in `facturas.py:79-110`.
- Improvement path: split collection relationships into `selectinload` (separate IN query) and keep `joinedload` only for *-to-one.

---

## Fragile Areas

**Number-correlative SELECT FOR UPDATE only protects under Postgres + RW transaction:**
- Files: `backend/app/api/nota_ventas.py:53-66`, `backend/app/api/facturas.py:79`, `backend/app/api/cotizaciones.py:108`, `backend/app/api/boletas.py:31`, `backend/app/api/ordenes_compra.py:68`, `backend/app/api/dte.py:26`
- Why fragile:
  - `with_for_update()` is a no-op on SQLite (used by tests via `conftest.py:91`), so concurrent-numbering tests run green but aren't actually validating the lock — confirmed by the boleta test note: "1 skipped (concurrent numbering — Postgres-only)" in PROGRESS.md.
  - The lock on a `SystemConfig` row only serialises that one key; unrelated keys read in the same transaction are not blocked, so `_get_config_dict` (`nota_ventas.py:50`) triggered earlier in the request can read a stale view.
  - If the route raises after the `flush()` but before `commit()`, the increment is rolled back — correct — but only because the whole row is locked.
- Safe modification: keep one `with_for_update()` per correlative key; never read the same key without the lock; add a Postgres-only integration test that spawns N concurrent workers.
- Test coverage: gap (skipped Postgres-only test).

**Chain-locking gaps between cotización → NV → factura:**
- Files: `backend/app/api/nota_ventas.py:382-383` (locks cotización), `backend/app/api/facturas.py:341,401` (locks NV), `backend/app/api/cotizaciones.py:405,451` (checks `is_locked` on PATCH), `backend/app/api/nota_ventas.py:420,448` (same).
- Why fragile:
  - Locking is set in two different routes (`POST /from_nv/...` AND `POST /` when `body.nv_id` is provided). Anyone adding a new "create factura from X" path must remember both.
  - There is no DB-level constraint preventing a NV from having two factura children if two requests race between the `nv.factura is not None` check and the `db.commit()` (`facturas.py:355-365`).
  - `is_locked` is advisory: a future job/script that bypasses the API can mutate locked rows.
- Safe modification: replace advisory boolean with a foreign-key+UNIQUE constraint (e.g., `factura.nv_id UNIQUE`); add a DB trigger or `EXCLUDE` constraint to prevent multiple non-anulada factura per NV.
- Test coverage: `backend/tests/test_chain_locking.py` exists (good); does not cover concurrent racing.

**Boleta stock reversal idempotency depends on race-free state transitions:**
- Files: `backend/app/services/boleta_stock.py`, `backend/app/api/boletas.py:147`
- Why fragile: PROGRESS.md describes "reversa automática si DTE rechazado o boleta anulada (idempotente, no duplica si ya está anulada manualmente)". Logic is in service module; if the DTE Celery worker and a manual anular hit at the same time, both branches may try to revert. The note about `sync_rechazada` test suggests this was already a bug once.
- Safe modification: encode state transitions as `UPDATE ... WHERE estado='emitida' RETURNING ...` so only one path reverts; rely on rowcount.

**Audit listener swallows exceptions silently:**
- Files: `backend/app/services/auditoria.py` (registered in `app/main.py:70`)
- Why fragile: PROGRESS.md notes "listeners protegidos con guard `try/except + logger.exception` para que un fallo de auditoría nunca tumbe la mutación de negocio". This is the right call for availability, but a misconfigured DB column or a new model with non-serialisable state will silently drop audit rows; nobody notices until forensic time.
- Safe modification: add a Sentry/loguru alert hook so silent drops are surfaced; weekly job that compares mutation count vs audit count per entity.

**`_after_flush_postexec` runs after flush but before commit:**
- Files: `backend/app/services/auditoria.py:258`
- Why fragile: if the surrounding transaction rolls back after the audit row is written but in the same session, it rolls back too (correct). But if a future contributor wraps the audit write in a separate session/engine for performance, audits will leak even on failed business mutations. Code review trap.

**Single Alembic head + manual repair migrations:**
- Files: `backend/migrations/versions/v1w2x3y4z5a6_fix_schema_drift_descuento_banco_fk.py`, `b7c8d9e0f1g2_repair_dashboard_layouts.py`, `3a52bd7e8f91_drift_add_ordenes_compra.py`
- Why fragile: three "drift fix" migrations in history indicate the team has shipped schema without an accompanying revision multiple times.
- Safe modification: add `alembic check` to CI (W1-03) — failing migration drift is the canonical fix.

**`uploads/` is committed to git with runtime artifacts:**
- Files: `frontend/Dockerfile.prod`, `backend/Dockerfile`, recent commit `b6a9370 chore: ignore backend/uploads runtime artifacts`
- Why fragile: the recent ignore commit suggests live employee-document PDFs were accidentally tracked. Re-occurrence risk: any future contributor uploading docs from a dev server replays the leak.
- Safe modification: pre-commit hook that rejects pushes touching `uploads/`; verify Docker volume mount in `docker-compose.prod.yml`.

---

## Scaling Limits

**Single-node FastAPI + Celery, no horizontal scaling assumptions:**
- Current capacity: not measured. PROGRESS.md mentions Celery for `tasks/dte.py` and `tasks/tareas.py` (tareas auto-gen). Celery broker via Redis.
- Limit: `with_for_update` correlative numbering serialises on a single Postgres row per entity; under high concurrency, all NV creations queue on `nv_last_id`.
- Scaling path: replace `SystemConfig.value` correlatives with Postgres `SEQUENCE`s + a separate "reservation" that maps sequence value → user-visible number; this lets Postgres handle concurrency natively. SII/DTE numbering stays advisory in app code (since SII demands gap-free).

**Reports load full row sets:**
- Current capacity: works for a single-tenant Pyme with thousands of facturas.
- Limit: `app/api/reportes.py` aggregates in Python; with 100k+ rows the API will time out under WeasyPrint render path that also runs in-process.
- Scaling path: push aggregations to SQL; pre-compute monthly cubes in a Celery beat job; render PDFs in a background worker, not in the request thread.

**Excel exports build in memory with `openpyxl.Workbook()`:**
- Files: `backend/app/api/nota_ventas.py:218-241` and parallel patterns in `boletas.py`, `facturas.py`, `reportes.py`.
- Limit: O(N) memory; a `nv` export over the full table on a 1 GB worker will OOM at ~50k rows.
- Scaling path: add `LIMIT 5000` to export endpoints, or stream as `xlsxwriter` constant-memory mode; for very large exports, schedule a Celery job and email the user the link.

---

## Dependencies at Risk

**`bcrypt==4.0.1` pinned alongside `passlib[bcrypt]==1.7.4`:**
- Risk: passlib 1.7.4 has known compatibility issues with bcrypt ≥ 4.1 (the famous "trapped" warning). Pinning bcrypt at 4.0.1 papers over this but locks out CVE fixes in newer bcrypt builds.
- Files: `backend/requirements.txt`
- Impact: future security updates blocked.
- Migration plan: switch to `argon2-cffi` via passlib's `argon2` scheme, or replace passlib with `bcrypt` direct calls (passlib is in maintenance mode).

**`python-jose[cryptography]==3.3.0` is unmaintained:**
- Risk: project is effectively abandoned upstream; CVEs may go unpatched.
- Files: `backend/requirements.txt:6`, `backend/app/core/security.py`
- Impact: any JWT-related CVE leaves the app exposed.
- Migration plan: switch to `pyjwt` (active maintenance, simpler API).

**`weasyprint==62.3` + `pydyf==0.11.0`:**
- Risk: WeasyPrint is heavy, requires native libs in Docker, and renders synchronously inside the request handler for cotización/factura/boleta PDFs.
- Files: `backend/app/services/pdf.py`, `backend/Dockerfile`
- Impact: a 50-line factura under load can saturate uvicorn workers.
- Migration plan: keep WeasyPrint but render in a dedicated Celery queue (`pdf_queue`) with concurrency 2 and a memory-bound worker; cache rendered PDFs for unchanged docs (immutable post-emit).

---

## Missing Critical Features

**No CI pipeline (W1-03) — see Tech Debt above.**

**No 2FA / no password reset (W1-07) — see Security above.**

**Boleta DTE 39/41 done (W1-04 ✅), but tributario ladder still incomplete:**
- Pending DTEs: guía de despacho 52 (W1-05), factura exenta 34 (W3-03), factura de compra 46 (W3-03), libros compras/ventas (W3-02), recepción/intercambio DTE proveedores (W3-01).
- Blocks: legal compliance for moving stock (no guía 52 → SII fines), monthly libros submission, accepting DTEs from suppliers.
- Files: backlog `docs/backlog.md` Wave 1 + Wave 3.

**No timeline unificado (W2-02), no pipeline (W2-01), no notificaciones (W2-04):**
- Problem: tareas system (`backend/app/tasks/tareas.py`, `backend/app/api/tareas.py`) partially substitutes notifications and per-tarea timelines exist, but there is no `/api/clientes/{id}/timeline` endpoint that fuses cotis + NV + facturas + NC + ND + pagos + tareas + interacciones; no pipeline / oportunidades model; no in-app bell.
- Blocks: vendedor cannot answer "what is happening with this client?" without flipping 4 tabs; no email digest for stale cotizaciones / vencidas.

**Stock model lacks bodegas / lotes (W5-01, W5-02):**
- Problem: `Producto.stock_actual` is a single integer; `MovimientoInventario` has no `bodega_id`. Lotes table exists in Producto modal but is not wired to OC line / NV line.
- Blocks: any client with > 1 warehouse or with traceability requirements (alimentos, fármacos, lubricantes).

**Multi-tenant (W6-01) — `tenant_id` not in any table:**
- Problem: SaaS-readiness requires schema rewrite; current code assumes a single tenant per deployment (one VPS per customer).
- Blocks: shipping the SaaS pricing model documented in `docs/saas-pricing.md`.

---

## Test Coverage Gaps

**Concurrent numbering test skipped:**
- What's not tested: actual race-condition behaviour of `with_for_update` correlative numbering under load (Postgres-only).
- Files: `backend/tests/test_boletas.py` (1 skipped — concurrent numbering); same gap likely on `test_nota_ventas.py`, `test_facturas.py`.
- Risk: a SQLAlchemy upgrade silently disabling row-level locks would not be caught.
- Priority: Medium (mitigated by Lioren rejecting duplicate folios).

**Audit listener disabled by default in tests:**
- What's not tested: the audit pipeline runs across most CRUD tests because `conftest fixture autouse desactiva audit listeners en tests por default (opt-in vía audit_enabled)` (per PROGRESS.md W1-01).
- Files: `backend/tests/conftest.py`
- Risk: regressions that break the audit listener (e.g., a new model with non-serialisable column) only surface in production where they are silently swallowed (see Fragile Areas).
- Priority: High — at minimum, smoke-test the listener end-to-end on every PR.

**Frontend coverage uneven:**
- What's not tested: most pages have a `.test.tsx`, but heavyweight forms (`CotizacionDetalle.tsx` 1,355 lines, `FacturaDetalle.tsx` 925 lines, `NotaVentaDetalle.tsx` 862 lines) lack focused tests for state transitions (line edits, margin propose, payment register).
- Files: `frontend/src/pages/CotizacionDetalle.tsx`, `FacturaDetalle.tsx`, `NotaVentaDetalle.tsx`
- Risk: refactor of pricing/IVA logic regresses silently.
- Priority: Medium.

**No E2E tests covering Cotización → NV → Factura → Pago → DTE flow:**
- What's not tested: the canonical happy path described in PROGRESS.md "Flujo de documentos" has no Playwright/Cypress test that walks it end-to-end.
- Risk: contract drift between routes (e.g., the `metodo_pago` enum drift bug above) goes undetected.
- Priority: High when CI lands (W1-03).

**No load / performance tests:**
- What's not tested: report endpoints (`reportes.py`), unbounded list endpoints, PDF generation under concurrency.
- Risk: unbounded N+1 patterns and Python-side aggregations only surface at scale.
- Priority: Medium — add a `locust` smoke run gated on a manual workflow_dispatch.

**No security regression tests:**
- What's not tested: file upload path traversal, SSRF in DTE webhook payload follow-ups, login throttling.
- Files: gap.
- Priority: Medium.

---

## Cross-References

- `docs/backlog.md` — every P0 here maps to a backlog item (W1-01 done, W1-02 done, W1-03 P0 open, W1-04 done, W1-05 P0 open, W1-06 done, W1-07 P1 open, W1-08 derived).
- `docs/roadmap-crm.md` — confirms 4 brechas críticas (hardening, tributario, CRM, finanzas) that drive priority of concerns above.
- Memory note `project_inventario_decisions.md` — confirms stock-on-NV decision is intentional but pending refactor (W1-08).
- Memory note `project_tier1_status.md` — W1-04 boleta DTE shipped 2026-04-25; this audit incorporates that delivery.

---

*Concerns audit: 2026-04-25*
