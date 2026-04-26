# Technology Stack

**Analysis Date:** 2026-04-25

## Languages

**Primary:**
- Python 3.12 — backend application (`backend/`), Celery workers, Alembic migrations
- TypeScript 5.9 — frontend application (`frontend/src/`), strict mode enabled (`frontend/tsconfig.json`)

**Secondary:**
- HTML/Jinja2 templates — DTE/document PDF templates (`backend/app/templates/`)
- SQL — Alembic migrations (`backend/migrations/versions/`, 42 files)
- Bash — entrypoint and ops scripts (`backend/entrypoint.sh`, `scripts/restore.sh`)

## Runtime

**Backend:**
- Python 3.12-slim Docker base (`backend/Dockerfile`)
- ASGI server: Uvicorn 0.30.0 with `[standard]` extras (websockets, watchgod, httptools)
- Production launches with `--workers 2` (`docker-compose.prod.yml:21`)
- Dev launches with `--reload` (`docker-compose.yml:31`)

**Frontend:**
- Node 20-alpine for both dev and prod build (`frontend/Dockerfile`, `frontend/Dockerfile.prod`)
- Browser target: ES2020 (`frontend/tsconfig.json`)
- Production served via nginx:alpine (`frontend/Dockerfile.prod`, `frontend/nginx.conf`)

**Async/Background:**
- Celery 5.4.0 with Redis broker + result backend (`backend/app/celery_app.py`)
- Celery Beat with PersistentScheduler (`docker-compose.yml:59`)
- Timezone: `America/Santiago`, UTC enabled

**Package Manager:**
- Backend: `pip` with pinned `requirements.txt` (no lockfile, no `pyproject.toml`)
- Frontend: `npm` with `package-lock.json` present

## Frameworks

**Core (backend):**
- FastAPI 0.115.0 — HTTP framework, OpenAPI docs auto-generated (`backend/app/main.py`)
- SQLAlchemy 2.0.35 — ORM with `DeclarativeBase` (`backend/app/database.py`)
- Alembic 1.13.3 — DB migrations (`backend/alembic.ini`, `backend/migrations/`)
- Pydantic Settings 2.5.2 — typed env-driven config (`backend/app/config.py`)
- Celery 5.4.0 + Redis 5.2.1 — async task queue (`backend/app/celery_app.py`)

**Core (frontend):**
- React 18.3.1 + react-dom 18.3.1 (`frontend/package.json`)
- React Router 6.26.2 — client-side routing (`frontend/src/router.tsx`)
- TanStack React Query 5.56.2 — server state (`frontend/src/main.tsx:24`)
- Zustand 4.5.5 — client state (auth, preferences) (`frontend/src/stores/`)
- Axios 1.7.7 — HTTP client with bearer-token interceptor + 401 refresh (`frontend/src/lib/api.ts`)
- TailwindCSS 3.4.11 + PostCSS + Autoprefixer (`frontend/tailwind.config.ts`, `frontend/postcss.config.js`)
- Recharts 3.8.1 — dashboards (`frontend/src/components/dashboard/`)
- React Grid Layout 2.2.3 — draggable dashboard widgets
- Sonner 2.0.7 — toast notifications (`frontend/src/main.tsx:38`)
- Lucide React 0.441.0 — icon set
- cmdk 1.1.1 — command palette / global search

**Testing:**
- Backend: pytest 8.3.3 + pytest-asyncio 0.24.0 + freezegun 1.5.1 (`backend/pytest.ini`)
- Frontend: Vitest 2.1.1 + jsdom 25.0 + @testing-library/react 16.0.1 + jest-dom 6.5 (`frontend/vite.config.ts:7-11`)
- Smoke marker excluded by default: `addopts = -m "not smoke"` (`backend/pytest.ini:2`)

**Build/Dev:**
- Vite 5.4.3 — frontend dev server + build (`frontend/vite.config.ts`)
- @vitejs/plugin-react 4.3.1 — React fast refresh
- TypeScript 5.9.3 — `tsc && vite build`, `tsc --noEmit` for lint (`frontend/package.json:8-10`)

## Key Dependencies

**Critical (backend):**
- `psycopg2-binary` 2.9.9 — Postgres driver
- `python-jose[cryptography]` 3.3.0 — JWT signing/verification (`backend/app/core/security.py`)
- `passlib[bcrypt]` 1.7.4 + `bcrypt` 4.0.1 — password hashing
- `python-multipart` 0.0.9 — file uploads (XML/CSV/XLSX)
- `httpx` 0.27.2 — outbound HTTP to Lioren DTE provider (`backend/app/services/dte_service.py`)
- `email-validator` 2.2.0 — Pydantic email field validation
- `weasyprint` 62.3 + `pydyf` 0.11.0 — PDF rendering from Jinja2 HTML (`backend/app/services/pdf.py`)
- `jinja2` 3.1.4 — HTML templates for cotización/NV/factura/boleta/OC
- `openpyxl` 3.1.5 — Excel ingest/export (precios, productos, reportes) (`backend/app/services/lista_precios_parser.py`)

**Critical (frontend):**
- `@sentry/react` 10.50.0 — frontend error tracking (`frontend/src/sentry.ts`)
- `axios` — JWT bearer + automatic refresh-token retry on 401 (`frontend/src/lib/api.ts:14-31`)

**Infrastructure:**
- `redis` 5.2.1 — Celery broker/backend client
- `sentry-sdk[fastapi]` 2.58.0 — Starlette + FastAPI integrations (`backend/app/core/observability.py`)
- `loguru` 0.7.3 — structured logging, JSON in prod (`backend/app/core/logging.py`)

**System (Debian) packages baked into backend image:**
- `libpango-1.0-0`, `libpangoft2-1.0-0`, `libcairo2`, `libgdk-pixbuf-2.0-0` — required by WeasyPrint (`backend/Dockerfile:2-4`)

## Configuration

**Environment:**
- `.env` at repo root, loaded by `pydantic-settings` (`backend/app/config.py:4`)
- Templates: `.env.example` (dev), `.env.prod.example` (prod)
- Frontend env: `VITE_*` vars (`frontend/.env.example`, `frontend/.env.production`)

**Key configs required (backend `Settings`, `backend/app/config.py`):**
- `DATABASE_URL` — Postgres URL (sqlite fallback for tests)
- `SECRET_KEY` — JWT signing
- `ACCESS_TOKEN_EXPIRE_MINUTES` (default 30), `REFRESH_TOKEN_EXPIRE_DAYS` (default 7)
- `REDIS_URL` (default `redis://localhost:6379/0`)
- `CORS_ORIGINS` (default `http://localhost:15173`)
- `LIOREN_API_URL` (default `https://api.lioren.cl/v1`), `LIOREN_API_KEY`, `LIOREN_WEBHOOK_SECRET`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM`
- `SENTRY_DSN`, `SENTRY_ENV`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_RELEASE`
- `LOG_FORMAT` (`json`|`pretty`), `LOG_LEVEL`

**Key configs required (frontend, `frontend/.env.example`):**
- `VITE_API_URL` — backend base URL
- `VITE_SENTRY_DSN`, `VITE_SENTRY_ENV`, `VITE_SENTRY_TRACES_SAMPLE_RATE`

**Build:**
- Backend: `backend/Dockerfile` (single-stage, system libs for WeasyPrint)
- Frontend dev: `frontend/Dockerfile` (Node 20 + npm install + `vite`)
- Frontend prod: `frontend/Dockerfile.prod` (multi-stage Node-build → nginx serve)
- Compose: `docker-compose.yml` (dev), `docker-compose.prod.yml` (prod, includes backups + offsite rclone)

## Platform Requirements

**Development:**
- Docker + Docker Compose v2 (`docker-compose.yml` services: db, redis, backend, celery_worker, celery_beat, frontend)
- Exposed ports on host: db `15432`, redis `16379`, backend `18000`, frontend `15173`
- Native dev possible (Vite proxies `/api` → `http://localhost:8000` in `frontend/vite.config.ts:6`)

**Production:**
- `docker-compose.prod.yml` orchestrates: postgres, backend (with `alembic upgrade head` on boot), nginx-served frontend, daily pg_dump (`prodrigestivill/postgres-backup-local:15`), optional rclone offsite (`rclone/rclone:1.65`)
- Uvicorn 2-worker process model (no gunicorn/multi-process manager)
- nginx in front of frontend with security headers and `/api/` proxy to `backend:8000` (`frontend/nginx.conf`)

---

*Stack analysis: 2026-04-25*
