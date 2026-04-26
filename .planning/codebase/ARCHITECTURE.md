<!-- refreshed: 2026-04-25 -->
# Architecture

**Analysis Date:** 2026-04-25

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                       Frontend (React SPA)                            │
│  Vite + React 18 + TypeScript + TanStack Query + Zustand + Tailwind   │
├───────────────────┬───────────────────┬──────────────────────────────┤
│  Pages (routes)   │  Components       │  Stores / Hooks              │
│ `frontend/src/    │ `frontend/src/    │ `frontend/src/stores/`       │
│  pages/*.tsx`     │  components/`     │ `frontend/src/hooks/`        │
└─────────┬─────────┴─────────┬─────────┴──────────────┬───────────────┘
          │                   │                        │
          │ axios (`frontend/src/lib/api.ts`) — JWT bearer; 401 → /refresh
          ▼                   ▼                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                Backend HTTP API (FastAPI / Uvicorn)                   │
│        Entrypoint: `backend/app/main.py` (`Conico PMS` app)           │
│  Middleware (LIFO): CORS → AuditContext → RequestLogger              │
├──────────────────────────────────────────────────────────────────────┤
│  Routers (`backend/app/api/*.py`) — one module per domain entity      │
│  Each route uses `Depends(require_permission(module, action))`        │
├──────────────────────────────────────────────────────────────────────┤
│  Schemas (Pydantic)         │  Services (domain logic)                │
│  `backend/app/schemas/`     │  `backend/app/services/`                │
│                             │   - `dte_service.py` (Lioren SII)       │
│                             │   - `pdf.py` (WeasyPrint + Jinja2)      │
│                             │   - `email.py` (SMTP)                   │
│                             │   - `xml_dte.py` (parse SII XML)        │
│                             │   - `boleta_stock.py`                   │
│                             │   - `auditoria.py` (SA event listeners) │
├──────────────────────────────────────────────────────────────────────┤
│  ORM Models (SQLAlchemy 2.0 declarative) `backend/app/models/`        │
│  Permissions (`backend/app/core/permissions.py`)                      │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PostgreSQL 15  (`db` service, port 15432)                            │
│  Engine: `backend/app/database.py` (`SessionLocal`, `Base`)           │
│  Migrations: Alembic — `backend/migrations/versions/*.py`             │
└──────────────────────────────────────────────────────────────────────┘
                             ▲
                             │ shared SessionLocal
                             │
┌──────────────────────────────────────────────────────────────────────┐
│  Celery worker + beat   (broker/backend = Redis at 16379)             │
│  App: `backend/app/celery_app.py`                                     │
│  Tasks: `backend/app/tasks/dte.py`  (poll Lioren every 5 min)         │
│         `backend/app/tasks/tareas.py` (auto-tareas hourly)            │
└──────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  External: Lioren API (DTE/SII), SMTP, Sentry                         │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| FastAPI app | Wire routers, middleware, observability | `backend/app/main.py` |
| Settings | Pydantic `BaseSettings` reading `.env` | `backend/app/config.py` |
| SQLAlchemy engine / `Base` / `get_db` | DB session lifecycle (FastAPI dep) | `backend/app/database.py` |
| Auth router | `/api/auth/login`, `/refresh`, `/me` (JWT HS256) | `backend/app/api/auth.py` |
| `require_permission` | Per-route RBAC dependency, returns `(user, db)` | `backend/app/api/deps.py` |
| Permission engine | Role defaults + per-user overrides | `backend/app/core/permissions.py` |
| Audit listeners | SA `before_flush` writing `AuditLog` rows | `backend/app/services/auditoria.py` |
| Audit context middleware | Stamp `user_id`, IP, UA into `ContextVar` for listeners | `backend/app/middleware/audit_context.py` |
| Request logger middleware | One JSON line per request (`request_id`, latency) | `backend/app/core/request_logger.py` |
| Sentry init | Optional — gated by `SENTRY_DSN` | `backend/app/core/observability.py` |
| Celery app | Broker/backend on Redis; beat schedule | `backend/app/celery_app.py` |
| DTE service | Build payloads + POST to Lioren | `backend/app/services/dte_service.py` |
| DTE poll task | Reconcile Lioren `aceptado/rechazado` → `dte_estado` | `backend/app/tasks/dte.py` |
| PDF generator | Jinja2 + WeasyPrint, templates in `backend/app/templates/` | `backend/app/services/pdf.py` |
| Frontend bootstrap | React root, QueryClient, ErrorBoundary, Sentry | `frontend/src/main.tsx` |
| Router | `react-router-dom` v6 with `RequireAuth` guard | `frontend/src/router.tsx` |
| App shell | Sidebar + Outlet + GlobalSearch + mobile nav | `frontend/src/components/layout/AppLayout.tsx` |
| Auth store | Zustand persisted store (access + refresh tokens) | `frontend/src/stores/auth.ts` |
| HTTP client | axios singleton with 401-retry-via-refresh | `frontend/src/lib/api.ts` |

## Pattern Overview

**Overall:** Layered modular monolith (FastAPI + React SPA) with an asynchronous worker tier (Celery) for SII/DTE reconciliation and scheduled tasks.

**Key Characteristics:**
- One router module per domain entity (cotizaciones, facturas, boletas, NV, NC, ND, productos, clientes, empresas, OC, RRHH, inventario, dashboard, cobranza, reportes, tareas, dte, auditoria, search, …).
- Symmetric module triplets: `app/api/<entity>.py` ↔ `app/schemas/<entity>.py` ↔ `app/models/<entity>.py`.
- Cross-cutting concerns implemented as middleware + ORM event listeners (audit), not sprinkled in routes.
- SPA consumes a single REST surface under `/api/*`; auth is JWT bearer with refresh rotation.
- Global state on the client lives in Zustand (`auth`, `preferences`); server state lives in TanStack Query (cache, background refetch, toast on error).

## Layers

**Presentation (frontend):**
- Purpose: SPA UI (pages, components, dashboard widgets, global search).
- Location: `frontend/src/`
- Contains: `pages/` (route-level screens), `components/` (shared UI), `hooks/`, `stores/`, `lib/api.ts`, `api/*.ts` (typed wrappers).
- Depends on: backend `/api/*`.
- Used by: end users via browser.

**HTTP layer (FastAPI routers):**
- Purpose: HTTP surface, request validation, permission checks, response shaping.
- Location: `backend/app/api/`
- Contains: One router module per entity, each `include_router`'d in `backend/app/main.py`.
- Depends on: schemas, services, models, `deps.require_permission`.
- Used by: frontend (axios) and Celery webhook receivers (DTE callbacks).

**Schema layer (Pydantic):**
- Purpose: I/O contracts (`*Create`, `*Update`, `*Out`, `*ListOut`).
- Location: `backend/app/schemas/`
- Depends on: nothing (pure DTOs).
- Used by: API routers; never by services or models directly.

**Service layer (domain logic):**
- Purpose: Multi-entity workflows, external integrations, side effects (PDF, email, DTE, stock movements).
- Location: `backend/app/services/`
- Depends on: models, external SDKs (`httpx`, `weasyprint`, `smtplib`).
- Used by: routers and Celery tasks.

**Model layer (SQLAlchemy 2.0 ORM):**
- Purpose: Persistence schema, relationships, computed properties (`margen_total`, `is_locked`).
- Location: `backend/app/models/`
- Depends on: `Base` from `backend/app/database.py`.
- Used by: routers, services, tasks, listeners.

**Background layer (Celery):**
- Purpose: Async/periodic jobs (DTE poll, auto-tarea generation).
- Location: `backend/app/tasks/`
- Depends on: `celery_app`, `SessionLocal`, services.

## Data Flow

### Primary Request Path (e.g. POST /api/facturas)

1. Browser sends request via `frontend/src/lib/api.ts:6` (axios injects `Authorization: Bearer <accessToken>` from `useAuthStore`).
2. Starlette stack: `RequestLoggerMiddleware` (`backend/app/core/request_logger.py:1`) assigns `request_id`, then `AuditContextMiddleware` (`backend/app/middleware/audit_context.py:69`) resolves `user_id`/IP/UA into a `ContextVar` for mutating methods.
3. Router handler in `backend/app/api/facturas.py` runs `Depends(require_permission("facturas", "create"))` (`backend/app/api/deps.py:10`), which calls `get_current_user` (`backend/app/api/auth.py:14`) and `has_permission` (`backend/app/core/permissions.py:48`).
4. Pydantic validates body against `FacturaCreate` (`backend/app/schemas/factura.py:27`).
5. Handler invokes service helpers (`_calcular_lineas`, `_recalcular_totales`, `_asignar_numero_factura`) and persists via `Session`.
6. On `db.flush()`, the SA `before_flush` listener registered by `register_audit_listeners()` (`backend/app/services/auditoria.py`) inspects `session.new/dirty/deleted` and adds `AuditLog` rows, reading user context from `ContextVar`.
7. Response serialized via `FacturaOut` (Pydantic `model_config = {"from_attributes": True}`).
8. TanStack Query caches result; `QueryCache.onError` toasts `error.response.data.detail` (`frontend/src/main.tsx:26`).

### DTE Emission Flow (Lioren / SII)

1. User triggers emission from a factura/boleta/NC/ND detail page → `POST /api/dte/...`.
2. Route enqueues Celery task or calls `DteService` synchronously (`backend/app/services/dte_service.py:18`); a `DteEmision` row links the task to the source doc.
3. Beat runs `app.tasks.dte.poll_dte_status` every 300 s (`backend/app/celery_app.py:17`); the task reads `DteEmision`, calls Lioren, maps `aceptado/rechazado/procesando` and writes back into `factura.dte_estado` / `boleta.dte_estado` (`backend/app/tasks/dte.py:15-49`).
4. If a boleta is rejected, `revertir_stock_boleta` (`backend/app/services/boleta_stock.py:27`) compensates inventory by inserting `MovimientoInventario` entries.

### Authentication Flow

1. Frontend posts form-encoded credentials to `POST /api/auth/login` (`backend/app/api/auth.py:24`); receives `{access_token, refresh_token}`.
2. Tokens persisted to `localStorage` (key `conico-auth`) by Zustand `persist` middleware (`frontend/src/stores/auth.ts:14`).
3. axios response interceptor (`frontend/src/lib/api.ts:12`) catches 401, calls `/api/auth/refresh`, replays original request once.
4. JWT HS256 signed with `settings.secret_key` (`backend/app/core/security.py:17`).

**State Management:**
- Server state → TanStack Query (cache + refetch policy `retry: 1`).
- Auth tokens + user → Zustand persisted store.
- UI prefs → `usePreferencesStore` (`frontend/src/stores/preferences.ts`).
- Audit context per-request → Python `ContextVar` (not thread-locals).

## Key Abstractions

**Domain entity module triplet:**
- Purpose: Each business entity owns three parallel files.
- Examples: `backend/app/models/factura.py`, `backend/app/schemas/factura.py`, `backend/app/api/facturas.py`.
- Pattern: model defines persistence + relationships, schema defines wire contracts, router exposes CRUD + entity-specific actions (emit DTE, send email, generate PDF, change estado).

**`require_permission(module, action)` dependency:**
- Purpose: RBAC gate at every mutating route; returns `(User, Session)` tuple.
- File: `backend/app/api/deps.py:10`
- Pattern: closure factory returning a `Depends(...)`. Callers destructure: `current_user, db = Depends(require_permission("facturas", "create"))`.

**Audit listener registry:**
- Purpose: Declarative list of auditable model classnames; listener matches by `type(instance).__name__`.
- File: `backend/app/services/auditoria.py`
- Pattern: `_AUDITABLE_MODEL_NAMES` set; sensitive fields filtered out of diffs via `SENSITIVE_FIELDS`.

**`SystemConfig` k/v table:**
- Purpose: Sequential numbering (`factura_last_id`, `boleta_last_id`, …) and emisor-fiscal data; queried `with_for_update()` to avoid number collisions.
- File: `backend/app/models/system_config.py`, used in `backend/app/api/facturas.py:75`.

**Document chain:**
- Purpose: Cotización → Nota de Venta → Factura/Boleta → Nota Crédito/Débito with `is_locked` propagation.
- Pattern: each downstream FK uses `ON DELETE SET NULL`; `is_locked` properties prevent edits once a document advances.

**TanStack Query + axios pair:**
- Purpose: Consistent server-state access from React.
- Pattern: components call `useQuery({ queryKey, queryFn: () => api.get(...) })`; mutations via `useMutation`; global `QueryCache.onError` shows toasts (`frontend/src/main.tsx:24`).

## Entry Points

**Backend HTTP:**
- Location: `backend/app/main.py`
- Triggers: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` (see `docker-compose.yml:31`).
- Responsibilities: configure logging + Sentry, register routers, install middleware in correct LIFO order, register audit listeners.

**Backend workers:**
- Location: `backend/app/celery_app.py`
- Triggers: `celery -A app.celery_app worker` (worker) and `celery -A app.celery_app beat` (scheduler) — `docker-compose.yml:47-66`.
- Responsibilities: execute `app.tasks.dte.*` and `app.tasks.tareas.*`; periodic schedule defined inline.

**Frontend:**
- Location: `frontend/src/main.tsx`
- Triggers: Vite dev (`npm run dev`) or static build served by nginx (`frontend/nginx.conf`, `frontend/Dockerfile.prod`).
- Responsibilities: init Sentry, mount `<App />` inside `QueryClientProvider`, `ErrorBoundary`, `Toaster`.

**Frontend route tree:**
- Location: `frontend/src/router.tsx`
- Pattern: single `createBrowserRouter` with `RequireAuth` HOC; all authenticated routes nested under `/` with `AppLayout` shell.

**DB migrations:**
- Location: `backend/migrations/versions/`
- Triggers: `alembic upgrade head` invoked by `backend/entrypoint.sh`.
- Config: `backend/alembic.ini` → `script_location = %(here)s/migrations`.

## Architectural Constraints

- **Sync ORM in async framework:** Routes are declared `def` (not `async def`) so that the synchronous `SessionLocal` works with FastAPI's threadpool. New routes that use `db: Session = Depends(get_db)` MUST stay sync to avoid blocking the event loop.
- **Middleware order (LIFO):** Add CORS first, `AuditContextMiddleware` second, `RequestLoggerMiddleware` last (see comment block in `backend/app/main.py:54-69`). Inverting them breaks `request_id` coverage of CORS-rejected responses.
- **Audit context propagation:** Audit user resolution uses Python `ContextVar`, not thread-locals; this works because FastAPI runs sync routes in a threadpool that copies context. Do NOT spawn raw threads inside a request without `copy_context()`.
- **Numbering safety:** `factura_last_id`, `boleta_last_id` etc. live in `SystemConfig` and MUST be locked with `with_for_update()` before increment (`backend/app/api/facturas.py:75`). Skipping the lock causes duplicate document numbers under concurrency.
- **Stock side-effects on boleta only:** Stock decrements on boleta emit / factura emit, NEVER on NV creation (see project memory `project_inventario_decisions`). Refactor pending W1-08.
- **JWT decode in two places:** `decode_token` is called from `get_current_user` (`backend/app/api/auth.py:14`), `AuditContextMiddleware._resolve_user_id`, and `RequestLoggerMiddleware._extract_user_id`. The middleware versions are decode-only (no DB roundtrip on read paths).
- **Global state:** The audit listener registration via `register_audit_listeners()` is module-import level + called at app start; do NOT call from per-request paths.

## Anti-Patterns

### Mixing Pydantic schemas into the model layer

**What happens:** Importing `app.schemas.*` from `app.models.*` (or business logic computed from request DTOs leaking into model files).
**Why it's wrong:** Creates an import cycle (schemas reference models for `from_attributes=True` round-tripping). Models must remain pure persistence.
**Do this instead:** Keep DTO conversion inside routers/services. See `backend/app/api/facturas.py:91` (`_calcular_lineas`) — it accepts `FacturaLineaCreate` and returns ORM `FacturaLinea` instances, never the reverse.

### Skipping `require_permission` on mutating routes

**What happens:** Adding a `@router.post(...)` that uses `db: Session = Depends(get_db)` without an RBAC dependency.
**Why it's wrong:** Audit context middleware is best-effort — it does not enforce auth — and `get_current_user` alone gives any logged-in user write access.
**Do this instead:** Always declare `current_user, db = Depends(require_permission("<module>", "<action>"))` on POST/PATCH/PUT/DELETE. Pattern shown across all routers in `backend/app/api/`.

### Calling Lioren synchronously from request handlers

**What happens:** A user-facing route awaits an external HTTP roundtrip to Lioren.
**Why it's wrong:** Latency + flakiness — the SII can be slow or unreachable; the request times out.
**Do this instead:** Persist `DteEmision`, return immediately, let `app.tasks.dte.poll_dte_status` reconcile. Reference: `backend/app/tasks/dte.py:51` (`_process_emit`).

### Bypassing the audit middleware via raw SQL or `bulk_*`

**What happens:** Using `Session.execute(text(...))`, `bulk_insert_mappings`, or `bulk_update_mappings` to mutate auditable tables.
**Why it's wrong:** `before_flush` only fires for ORM-tracked instances (`session.new/dirty/deleted`). Bulk ops silently skip audit logging.
**Do this instead:** Use ORM `add`/attribute assignment for any auditable model. Reserve raw SQL for read-only analytics.

### Storing server data in Zustand

**What happens:** Caching `/api/facturas` responses inside a Zustand store.
**Why it's wrong:** Duplicates TanStack Query's cache, fights its invalidation model.
**Do this instead:** Use `useQuery` for server state; reserve Zustand for tokens (`frontend/src/stores/auth.ts`) and UI prefs (`frontend/src/stores/preferences.ts`).

## Error Handling

**Strategy:** Backend raises `HTTPException(status_code, detail=...)` and lets FastAPI serialize. Frontend axios resolves all errors → TanStack Query → global `QueryCache.onError` shows a `sonner` toast extracted from `error.response.data.detail`.

**Patterns:**
- 404 lookups via small helpers like `_load_factura` (`backend/app/api/facturas.py:124`) that raise `HTTPException(404, "Factura no encontrada")`.
- Cross-entity validation returns 422 with structured detail (`backend/app/api/facturas.py:144`).
- React error boundary at root (`frontend/src/components/ErrorBoundary.tsx`) catches render errors; `RouteError` (`frontend/src/pages/RouteError.tsx`) handles router errors.
- Sentry captures unhandled exceptions on both tiers (`backend/app/core/observability.py`, `frontend/src/sentry.ts`); both are no-op when DSN is empty.

## Cross-Cutting Concerns

**Logging:** `loguru` with structured JSON option (`log_format=json|pretty`); per-request line emitted by `RequestLoggerMiddleware` carrying `request_id, user_id, route, method, status, latency_ms`.
**Validation:** Pydantic v2 schemas at the HTTP boundary; SQLAlchemy `Mapped[...]` typing at the DB boundary; no validation in services.
**Authentication:** JWT HS256 (`python-jose`) with separate `access` and `refresh` token types; refresh rotation handled client-side by axios interceptor.
**Authorization:** RBAC via `app.core.permissions.has_permission` — defaults per role (`admin`, `subadmin`, `vendedor`) plus per-user `PermissionOverride` rows.
**Auditing:** Global SA event listener registered once at startup; writes `AuditLog` rows in the same transaction as the audited change; sensitive fields stripped.
**Observability:** Sentry (optional), structured logs, healthcheck endpoints under `/` (no auth, no prefix — `backend/app/main.py:73`).

---

*Architecture analysis: 2026-04-25*
