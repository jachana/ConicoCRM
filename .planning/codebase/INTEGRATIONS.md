# External Integrations

**Analysis Date:** 2026-04-25

## APIs & External Services

**DTE / SII (Chile electronic invoicing):**
- **Lioren** (`https://api.lioren.cl/v1`) — sole provider for DTE emission and SII track-id polling. All factura (33), nota crédito (61), nota débito (56), and boleta (39/41) flow through it.
  - SDK/Client: raw `httpx` calls (no SDK) in `backend/app/services/dte_service.py`
  - Auth: `Bearer` token via `LIOREN_API_KEY` (`backend/app/services/dte_service.py:25`)
  - Endpoints used:
    - `POST {LIOREN_API_URL}/documentos` — emit DTE (`dte_service.py:198-205`)
    - `GET {LIOREN_API_URL}/documentos/{track_id}/estado` — poll SII status (`dte_service.py:207-214`)
  - Webhook in: `POST /api/dte/webhook` validates `X-Lioren-Signature` HMAC-SHA256 against `LIOREN_WEBHOOK_SECRET` (`backend/app/api/dte.py:259-294`, `dte_service.py:216-220`)
  - Webhook payload triggers `_sync_dte_estado` to update Factura/NC/ND/Boleta `dte_estado` and reverts boleta stock on rejection (`backend/app/tasks/dte.py:27-48`)
  - Status mapping: `aceptado/aceptada → aceptada`, `rechazado/rechazada → rechazada`, `procesando/en_proceso → procesando` (`tasks/dte.py:15-24`)
  - Polling fallback: Celery beat task `app.tasks.dte.poll_dte_status` runs every 300s (`celery_app.py:18-21`)

**Email (SMTP):**
- Generic SMTP, configured per deployment (Gmail used as default example in `.env.example:5`)
- Implementation: stdlib `smtplib` + `email.mime.*` in `backend/app/services/email.py`
- Auth: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` env vars (read directly via `os.getenv` in `email.py:13-17`, NOT through Pydantic settings)
- Outbound use cases: `enviar_cotizacion`, `enviar_nota_venta`, `enviar_factura`, `enviar_boleta`, `enviar_orden_compra`, `enviar_recordatorio` — all attach a WeasyPrint-generated PDF
- Transport: STARTTLS on port 587 (`email.py:60`)
- No queueing: SMTP is invoked synchronously inside request handlers; failures raise `EmailNotConfiguredError`

## Data Storage

**Databases:**
- **PostgreSQL 15-alpine** — primary OLTP store (`docker-compose.yml:3-4`, `docker-compose.prod.yml:3-4`)
  - Connection: `DATABASE_URL` (e.g. `postgresql://conico:conico@db:5432/conico`)
  - Driver: `psycopg2-binary` 2.9.9
  - Client: SQLAlchemy 2.0 ORM with `sessionmaker`, `pool_pre_ping=True` (`backend/app/database.py:5`)
  - Migrations: Alembic, 42 revisions in `backend/migrations/versions/`
  - Test fallback: SQLite (e.g. `backend/test.db`) — engine sets `PRAGMA foreign_keys=ON` on connect (`database.py:8-13`)
- **Health probes** use a dedicated short-lived engine with `NullPool` and 2s libpq `connect_timeout` to avoid pool starvation (`backend/app/api/health.py:36-52`)

**Cache / Broker:**
- **Redis 7-alpine** — Celery broker AND result backend, single URL via `REDIS_URL` (`docker-compose.yml:19-20`, `backend/app/celery_app.py:5-6`)
- Not used as an application cache — only as Celery transport.

**File Storage:**
- Local filesystem only. `uploads_data` Docker volume mounted at `/app/uploads` (`docker-compose.yml:34`)
- No S3/object storage for app uploads. Offsite copy targets backups, not user data.

**Backups:**
- `prodrigestivill/postgres-backup-local:15` — daily `pg_dump`, retention via `BACKUP_KEEP_DAYS/WEEKS/MONTHS` env vars (`docker-compose.prod.yml:45-62`)
- Offsite (optional, gated on `S3_BUCKET` env): `rclone/rclone:1.65` syncs `/backups` to S3-compatible target. Provider configurable via `S3_PROVIDER` (Backblaze B2, Wasabi, MinIO, native S3, etc.) (`docker-compose.prod.yml:69-101`)

## Authentication & Identity

**Auth Provider:**
- Custom JWT — no external IdP (`backend/app/core/security.py`)
- Algorithm: HS256 with `SECRET_KEY` (`security.py:19,24`)
- Library: `python-jose[cryptography]` 3.3.0 + `passlib[bcrypt]` for password hashing (`security.py:1-6`)
- Access token TTL: 30 min (`ACCESS_TOKEN_EXPIRE_MINUTES`, default in `config.py:8`)
- Refresh token TTL: 7 days (`REFRESH_TOKEN_EXPIRE_DAYS`, default in `config.py:9`)
- Login: `POST /api/auth/login` (OAuth2 password flow form) (`backend/app/api/auth.py:24-32`)
- Refresh: `POST /api/auth/refresh` (`backend/app/api/auth.py:35-46`)
- Frontend storage: Zustand store `useAuthStore` (`frontend/src/stores/auth.ts`); axios interceptor injects `Authorization: Bearer <token>` and auto-retries on 401 by calling `/api/auth/refresh` (`frontend/src/lib/api.ts:6-31`)

## Monitoring & Observability

**Error Tracking:**
- **Sentry** (backend + frontend), gated on DSN presence
  - Backend: `sentry-sdk[fastapi]` 2.58.0 with `StarletteIntegration` + `FastApiIntegration`, `send_default_pii=False` (`backend/app/core/observability.py:55-62`)
  - Backend release auto-derived from `SENTRY_RELEASE` → `GIT_SHA` / `SOURCE_VERSION` / `GIT_COMMIT` → `git rev-parse HEAD` (`observability.py:16-37`)
  - Frontend: `@sentry/react` 10.50.0, replays disabled by default (`frontend/src/sentry.ts:24-33`)
  - Both no-op when DSN is empty (W1-06 design)

**Logs:**
- Backend: `loguru` configured by `app.core.logging.configure_logging()`
- Format controlled by `LOG_FORMAT`: `json` (one JSON object per line, prod) or `pretty` (colorized, dev) (`backend/app/core/logging.py:49-72`)
- stdlib `logging` (uvicorn, uvicorn.error, uvicorn.access, fastapi, sqlalchemy) intercepted and routed through loguru via `InterceptHandler` (`logging.py:20-35,76-80`)
- Request middleware `RequestLoggerMiddleware` adds a `request_id` and emits an access log line per request (`backend/app/middleware/...`, registered in `backend/app/main.py:69`)

**Health & Readiness:**
- `GET /healthz` and `GET /readyz` — liveness/readiness, no auth, dedicated short-lived DB engine + best-effort Redis ping (`backend/app/api/health.py`)

## CI/CD & Deployment

**Hosting:**
- Self-hosted Docker Compose stack (`docker-compose.prod.yml`)
- No managed PaaS (no Vercel/Heroku/Render config files detected)

**CI Pipeline:**
- Not detected — no `.github/workflows/`, `.gitlab-ci.yml`, or CircleCI config in repo root

**Migrations on deploy:**
- Backend container runs `alembic upgrade head && uvicorn ...` on boot (`docker-compose.prod.yml:21`)

**Frontend deploy:**
- Multi-stage Docker build, served by nginx with security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) and `/api/` reverse proxy to `backend:8000` (`frontend/nginx.conf`)

## Environment Configuration

**Required env vars (backend, prod):**
- `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `SECRET_KEY` (generated via `openssl rand -hex 32`)
- `REDIS_URL`
- `CORS_ORIGINS` (comma-separated, parsed at `backend/app/main.py:60`)
- `LIOREN_API_KEY`, `LIOREN_WEBHOOK_SECRET` (`LIOREN_API_URL` defaulted)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- `SENTRY_DSN` (optional — empty disables), `SENTRY_ENV`, `SENTRY_TRACES_SAMPLE_RATE`
- `LOG_FORMAT=json`, `LOG_LEVEL=INFO`

**Required env vars (frontend, prod):**
- `VITE_API_URL` (`frontend/.env.production`)
- `VITE_SENTRY_DSN`, `VITE_SENTRY_ENV`, `VITE_SENTRY_TRACES_SAMPLE_RATE` (optional)

**Required env vars (backups, prod):**
- `BACKUP_SCHEDULE` (default `@daily`), `BACKUP_KEEP_DAYS/WEEKS/MONTHS`
- Offsite (optional): `S3_BUCKET`, `S3_PREFIX`, `S3_ENDPOINT`, `S3_REGION`, `S3_PROVIDER`, `S3_KEY`, `S3_SECRET`

**Secrets location:**
- `.env` (dev) and `.env.prod` (prod) at repo root — both git-ignored (templates `.env.example`, `.env.prod.example` are committed)
- No vault/secret-manager integration detected
- `frontend/.env.production` is committed but contains only non-secret `VITE_API_URL=`

## Webhooks & Callbacks

**Incoming:**
- `POST /api/dte/webhook` — Lioren DTE status callbacks (`backend/app/api/dte.py:259-294`)
  - Signature header: `X-Lioren-Signature` (HMAC-SHA256 of raw body using `LIOREN_WEBHOOK_SECRET`)
  - Payload contract (consumed): `{ "track_id": str, "estado": str, ... }` — full body persisted to `DteEmision.respuesta_sii`
  - Idempotency: returns `200 ok=true` and skips updates when emisión is already `aceptada` or `rechazada`

**Outgoing:**
- Lioren DTE emit (`POST /v1/documentos`) — invoked from Celery task `app.tasks.dte.emit_dte` (`backend/app/tasks/dte.py:51-80`)
- Lioren status poll (`GET /v1/documentos/{track_id}/estado`) — invoked by Celery beat `poll_dte_status` every 5 min (`backend/app/celery_app.py:18-21`)
- SMTP outbound — synchronous from request handlers (cotización, NV, factura, boleta, OC emails)

---

*Integration audit: 2026-04-25*
