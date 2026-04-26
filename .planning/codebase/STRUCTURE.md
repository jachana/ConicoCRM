# Codebase Structure

**Analysis Date:** 2026-04-25

## Directory Layout

```
Conico/
├── backend/                       # FastAPI + SQLAlchemy + Celery service
│   ├── app/
│   │   ├── main.py                # FastAPI entry point — registers all routers
│   │   ├── celery_app.py          # Celery app + beat schedule
│   │   ├── config.py              # Pydantic Settings (.env)
│   │   ├── database.py            # Engine, SessionLocal, Base, get_db
│   │   ├── api/                   # HTTP routers (one file per domain entity)
│   │   ├── schemas/               # Pydantic DTOs (Create/Update/Out)
│   │   ├── models/                # SQLAlchemy 2.0 ORM models
│   │   ├── services/              # Domain logic, integrations, side effects
│   │   ├── tasks/                 # Celery tasks (DTE poll, tareas auto)
│   │   ├── core/                  # Cross-cutting: security, permissions, logging
│   │   ├── middleware/            # Starlette middlewares
│   │   └── templates/             # Jinja2 PDF templates (cotización, factura, …)
│   ├── migrations/
│   │   ├── versions/              # Alembic revisions (one .py per migration)
│   │   └── env.py
│   ├── tests/                     # pytest suite (unit + integration)
│   ├── scripts/                   # seed_admin.py, seed_all.py
│   ├── alembic.ini
│   ├── pytest.ini
│   ├── requirements.txt
│   ├── Dockerfile
│   └── entrypoint.sh
├── frontend/                      # React 18 + Vite + TypeScript SPA
│   ├── src/
│   │   ├── main.tsx               # React root, QueryClientProvider, ErrorBoundary
│   │   ├── App.tsx                # ThemeProvider + RouterProvider
│   │   ├── router.tsx             # createBrowserRouter — all routes
│   │   ├── pages/                 # Route-level screens
│   │   ├── components/            # Shared UI (modals, panels, layout, search)
│   │   │   ├── layout/            # AppLayout, Sidebar, ThemeProvider
│   │   │   ├── dashboard/         # Widget grid + catalog
│   │   │   └── search/            # GlobalSearchModal + result items
│   │   ├── hooks/                 # useAuth, useDashboardLayout, useGlobalSearch, …
│   │   ├── stores/                # Zustand (auth, preferences)
│   │   ├── lib/                   # api.ts (axios), columnDefs, pdf
│   │   ├── api/                   # Typed API wrappers (auditoria, boletas, …)
│   │   ├── types/                 # TS shared types (badge, dashboard, tarea)
│   │   ├── __tests__/             # Vitest suites
│   │   ├── sentry.ts              # initSentry()
│   │   └── index.css              # Tailwind layer
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── package.json
│   ├── nginx.conf                 # Prod static-serve config
│   ├── Dockerfile / Dockerfile.prod
│   └── dist/                      # Build output (gitignored generally)
├── data_seed/                     # Seed JSON / CSV (mounted into backend container)
├── docs/                          # Roadmap, architecture notes, SaaS planning
├── nginx/                         # Reverse proxy config (production)
├── resources/                     # Static assets (logos, fonts, etc.)
├── scripts/                       # restore.sh and ops scripts
├── uploads/                       # Runtime upload root (gitignored)
├── docker-compose.yml             # Dev stack (db, redis, backend, worker, beat, frontend)
├── docker-compose.prod.yml        # Prod compose
├── PROGRESS.md                    # Phase-by-phase progress log
├── QUICKSTART.md / QUICKSTART.html
└── CLAUDE.md                      # Project rules for Claude Code
```

## Directory Purposes

**`backend/app/api/`:**
- Purpose: HTTP surface — one router module per domain entity.
- Contains: `auth.py`, `users.py`, `clientes.py`, `empresas.py`, `proveedores.py`, `productos.py`, `marcas.py`, `cotizaciones.py`, `nota_ventas.py`, `facturas.py`, `boletas.py`, `ordenes_compra.py`, `pagos.py`, `inventario.py`, `listas_precios.py`, `aprobaciones.py`, `aprobaciones_costo.py`, `aprobaciones_margen.py`, `cobranza.py`, `dashboard.py`, `dte.py`, `reportes.py`, `tags.py`, `bancos_receptores.py`, `sedes_despacho.py`, `tareas.py`, `reglas_tarea.py`, `empleados.py`, `empleados_documentos.py`, `empleados_vacaciones.py`, `productos_documentos.py`, `search.py`, `auditoria.py`, `health.py`, `config.py`, `deps.py` (shared dependency factories), `shared.py` (shared helpers).
- Key files: `deps.py` (RBAC dependency `require_permission`), `auth.py` (`get_current_user`).

**`backend/app/schemas/`:**
- Purpose: Pydantic v2 DTOs that define the wire contract.
- Naming: `<Entity>Create`, `<Entity>Update`, `<Entity>Out`, `<Entity>ListOut`, `<Entity>Ref`.
- Contains: One file per entity, mirroring `app/models/` and `app/api/` layout.

**`backend/app/models/`:**
- Purpose: SQLAlchemy 2.0 declarative models. One class per table, computed `@property` helpers (`margen_total`, `is_locked`).
- Key files: `user.py`, `permission.py`, `factura.py`, `boleta.py`, `cotizacion.py`, `nota_venta.py`, `nota_credito.py`, `nota_debito.py`, `producto.py`, `cliente.py`, `empresa.py`, `dte_emision.py`, `audit_log.py`, `system_config.py`, `movimiento_inventario.py`, `dashboard_layout.py`, `tarea.py`, `regla_tarea.py`.

**`backend/app/services/`:**
- Purpose: Domain logic, integrations, side effects.
- Key files: `dte_service.py` (Lioren payload builder + HTTP), `pdf.py` (WeasyPrint + Jinja2), `email.py` (SMTP, factura/recordatorio), `xml_dte.py` (parse SII XML uploads), `auditoria.py` (SA listeners), `boleta_stock.py` (inventory side-effects), `tareas_asignacion.py` (auto-tarea rules), `lista_precios_parser.py`.

**`backend/app/tasks/`:**
- Purpose: Celery tasks consumed by the worker.
- Key files: `dte.py` (DTE state poller, runs every 300 s), `tareas.py` (auto-task generation, runs hourly).

**`backend/app/core/`:**
- Purpose: Foundational cross-cutting modules (no domain coupling).
- Key files: `security.py` (JWT + bcrypt), `permissions.py` (RBAC matrix), `logging.py` (loguru config), `request_logger.py` (per-request structured log middleware), `observability.py` (Sentry init).

**`backend/app/middleware/`:**
- Purpose: Starlette middlewares added in `main.py`.
- Key files: `audit_context.py` (`AuditContextMiddleware`).

**`backend/app/templates/`:**
- Purpose: Jinja2 HTML templates rendered to PDF by `weasyprint`.
- Key files: `cotizacion.html`, `nota_venta.html`, `factura.html`, `boleta.html`, `orden_compra.html`.

**`backend/migrations/versions/`:**
- Purpose: Alembic revision files. Each named `<rev>_<slug>.py` (e.g. `a1b2c3d4e5f6_add_facturas.py`).
- Generated: Yes (`alembic revision --autogenerate`).
- Committed: Yes.

**`backend/tests/`:**
- Purpose: pytest suite. One file per feature/router (e.g. `test_facturas.py`, `test_boletas.py`, `test_dte_service.py`, `test_chain_locking.py`).
- Conftest: `tests/conftest.py` shared fixtures (db, client, auth headers).

**`frontend/src/pages/`:**
- Purpose: One component file per route registered in `router.tsx`.
- Naming: `PascalCase.tsx` matches the route concept (`Facturas.tsx`, `FacturaDetalle.tsx`, `BoletaNueva.tsx`).
- Tests co-located: `<Page>.test.tsx`.
- Note: `.js` files alongside `.tsx` are stale build artifacts (see CONCERNS.md).

**`frontend/src/components/`:**
- Purpose: Reusable UI building blocks.
- Subdirectories:
  - `layout/` — `AppLayout.tsx`, `Sidebar.tsx`, `ThemeProvider.tsx`.
  - `dashboard/` — `Widget.tsx`, `WidgetGrid.tsx`, `WidgetPicker.tsx`, `widgetCatalog.ts`, `WidgetConfig.tsx`.
  - `search/` — `GlobalSearchModal.tsx`, `SearchButton.tsx`, `RecentesGroup.tsx`, `items/` (per-entity result rows).

**`frontend/src/stores/`:**
- Purpose: Zustand global stores (small, persisted).
- Key files: `auth.ts` (tokens + user, persisted as `conico-auth`), `preferences.ts` (UI prefs).

**`frontend/src/hooks/`:**
- Purpose: Reusable React hooks.
- Key files: `useAuth.ts`, `useDashboardLayout.ts`, `useDashboardPresets.ts`, `useGlobalSearch.ts`, `useGlobalShortcut.ts`, `useRecentEntities.ts`.

**`frontend/src/lib/`:**
- Purpose: Singletons + helpers.
- Key files: `api.ts` (axios singleton w/ JWT interceptor), `columnDefs.ts` (export column metadata), `pdf.ts`.

**`frontend/src/api/`:**
- Purpose: Typed wrappers around `lib/api.ts` for specific endpoints (`auditoria.ts`, `boletas.ts`, `tareas.ts`, `preferencias.ts`, `search.ts`).

## Key File Locations

**Entry Points:**
- `backend/app/main.py`: FastAPI app + router registration.
- `backend/app/celery_app.py`: Celery app + beat schedule.
- `frontend/src/main.tsx`: React root.
- `frontend/src/router.tsx`: Route table + `RequireAuth` guard.

**Configuration:**
- `backend/app/config.py`: Pydantic Settings reading `.env`.
- `backend/alembic.ini`: Alembic config (`script_location = %(here)s/migrations`).
- `backend/pytest.ini`: pytest config.
- `frontend/vite.config.ts`: Vite + dev proxy.
- `frontend/tsconfig.json`: TypeScript compiler options.
- `frontend/tailwind.config.ts`: Tailwind theme + content globs.
- `docker-compose.yml`: Dev stack (db:15432, redis:16379, backend:18000, frontend:15173).
- `docker-compose.prod.yml`: Prod stack.

**Core Logic:**
- Domain entities: `backend/app/api/<entity>.py` + `backend/app/schemas/<entity>.py` + `backend/app/models/<entity>.py`.
- DTE/SII: `backend/app/services/dte_service.py`, `backend/app/tasks/dte.py`, `backend/app/services/xml_dte.py`.
- PDF generation: `backend/app/services/pdf.py` + `backend/app/templates/*.html`.
- Auditing: `backend/app/services/auditoria.py` + `backend/app/middleware/audit_context.py`.
- RBAC: `backend/app/core/permissions.py` + `backend/app/api/deps.py`.

**Testing:**
- Backend: `backend/tests/test_*.py`, fixtures in `backend/tests/conftest.py`.
- Frontend: `frontend/src/__tests__/*.test.tsx` and co-located `<Page>.test.tsx`.

## Naming Conventions

**Backend Python files:**
- `snake_case.py`, plural for collections (`facturas.py`, `cotizaciones.py`), singular for the model module (`factura.py`).
- Router file plural ↔ schema file singular ↔ model file singular: `api/facturas.py` ↔ `schemas/factura.py` ↔ `models/factura.py`.

**Backend classes:**
- ORM models: `PascalCase` singular (`Factura`, `FacturaLinea`, `NotaVenta`).
- Pydantic schemas: `<Entity><Suffix>` — `FacturaCreate`, `FacturaOut`, `FacturaListOut`, `FacturaUpdate`.
- Tablenames: `snake_case` plural (`facturas`, `factura_lineas`, `nota_ventas`).

**Backend functions:**
- `snake_case`. Private helpers prefixed `_` (`_calcular_lineas`, `_recalcular_totales`, `_load_factura`, `_asignar_numero_factura`).

**Frontend files:**
- Components/pages: `PascalCase.tsx` (`Facturas.tsx`, `BoletaDetalle.tsx`, `EmpresaDetailModal.tsx`).
- Hooks: `useCamelCase.ts` (`useGlobalSearch.ts`).
- Stores/lib/api/types: `camelCase.ts` (`auth.ts`, `api.ts`, `preferencias.ts`).
- Tests: co-located `<Name>.test.tsx`.

**Routes (URL paths):**
- Spanish, kebab-case for multi-word: `/notas-venta`, `/notas-credito`, `/ordenes-compra`, `/admin/auditoria`.
- API prefixes: `/api/<entity>` plural (`/api/facturas`, `/api/cotizaciones`, `/api/ordenes-compra`).

**Migrations:**
- `<12-char-rev>_<slug>.py` (e.g. `a1b2c3d4e5f6_add_facturas.py`, `b7c8d9e0f1g2_repair_dashboard_layouts.py`).

## Where to Add New Code

**New domain entity (e.g., "Suscripción"):**
1. Model: `backend/app/models/suscripcion.py` (subclass `Base`, declare `__tablename__`).
2. Schema: `backend/app/schemas/suscripcion.py` (`SuscripcionCreate`, `SuscripcionOut`, …).
3. Router: `backend/app/api/suscripciones.py`. Each route uses `current_user, db = Depends(require_permission("suscripciones", "create"))`.
4. Wire it in `backend/app/main.py` with `app.include_router(suscripciones.router, prefix="/api/suscripciones", tags=["suscripciones"])`.
5. Add module to `MODULES` list in `backend/app/core/permissions.py:5` and define defaults per role.
6. Migration: `alembic revision --autogenerate -m "add suscripciones"` → file appears in `backend/migrations/versions/`.
7. If auditable, add the model classname to `_AUDITABLE_MODEL_NAMES` in `backend/app/services/auditoria.py:47`.
8. Tests: `backend/tests/test_suscripciones.py`.

**New API endpoint on existing entity:**
- Add the handler to the matching `backend/app/api/<entity>.py`.
- Reuse private helpers (`_load_<entity>`, `_recalcular_totales`); keep new private helpers in the same file with `_` prefix.

**New service / external integration:**
- Module: `backend/app/services/<name>.py`.
- Routers/tasks import from there. Do NOT call external SDKs from `app/api/`.

**New Celery task:**
- File: `backend/app/tasks/<name>.py`.
- Register in `backend/app/celery_app.py` `include=[...]` list.
- For periodic, add an entry to `celery_app.conf.beat_schedule`.

**New frontend page:**
- File: `frontend/src/pages/<Name>.tsx`.
- Register in `frontend/src/router.tsx` under the authenticated children array.
- Add a sidebar entry in `frontend/src/components/layout/Sidebar.tsx`.

**New shared UI component:**
- One-off modals/panels: `frontend/src/components/<Name>.tsx`.
- Layout-related: `frontend/src/components/layout/`.
- Dashboard widget: `frontend/src/components/dashboard/` and register in `widgetCatalog.ts`.
- Search result row: `frontend/src/components/search/items/<Entity>Item.tsx`.

**New API wrapper on the frontend:**
- File: `frontend/src/api/<entity>.ts` exporting typed functions that call `api.get/post/...` from `lib/api.ts`.

**New Zustand store:**
- File: `frontend/src/stores/<name>.ts`. Use `persist` only for state that must survive reloads (auth, prefs).

**Utilities / shared helpers:**
- Backend: `backend/app/services/` if business-relevant, else `backend/app/core/`.
- Frontend: `frontend/src/lib/`.

**PDF templates:**
- `backend/app/templates/<name>.html` (Jinja2). Add a `generar_pdf_<name>` function in `backend/app/services/pdf.py`.

**Tests:**
- Backend: `backend/tests/test_<feature>.py`. Reuse fixtures from `conftest.py`.
- Frontend: co-located `<Name>.test.tsx` next to the component, or `frontend/src/__tests__/` for cross-cutting tests.

## Special Directories

**`backend/uploads/`:**
- Purpose: Runtime artifact root for user uploads (mounted as Docker volume `uploads_data`).
- Generated: Yes (runtime).
- Committed: No (`.gitignore`d).

**`backend/__pycache__/` and per-package `__pycache__/`:**
- Purpose: Python bytecode cache.
- Generated: Yes.
- Committed: No.

**`frontend/dist/`:**
- Purpose: Vite production build output.
- Generated: Yes (`npm run build`).
- Committed: Generally no.

**`frontend/node_modules/`:**
- Purpose: npm dependencies.
- Generated: Yes (`npm install`).
- Committed: No.

**`data_seed/`:**
- Purpose: Seed fixtures (JSON/CSV) mounted at `/data_seed` in backend container; consumed by `backend/scripts/seed_all.py`.
- Generated: No.
- Committed: Yes.

**`backend/test-reports/`:**
- Purpose: pytest output (HTML/JSON) when running `run_tests.sh`.
- Generated: Yes.
- Committed: No.

**`Conico-reportes/`:**
- Purpose: Project reports / generated artifacts (recently added, not yet tracked).
- Generated: Yes.
- Committed: No.

**`.planning/codebase/`:**
- Purpose: GSD codebase maps (ARCHITECTURE.md, STRUCTURE.md, …).
- Generated: Yes (this document).
- Committed: Yes.

---

*Structure analysis: 2026-04-25*
