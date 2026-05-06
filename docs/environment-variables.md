# Environment Variables Reference

> **Estado:** documento canónico. Última revisión: 2026-05-06.
>
> Esta es la única referencia central de variables de entorno para Conico CRM. Cuando agregues una variable nueva al código (`backend/app/config.py`, `os.environ.get(...)`, `import.meta.env.VITE_*`, o `docker-compose.prod.yml`), **agrégala también acá**. Si no está documentada, no existe para operaciones.

---

## Tabla de contenidos

- [Convenciones](#convenciones)
- [¿Dónde se cargan?](#dónde-se-cargan)
- [Backend — Core](#backend--core) (`DATABASE_URL`, `SECRET_KEY`, `REDIS_URL`, …)
- [Backend — Auth & Tokens](#backend--auth--tokens)
- [Backend — Email / SMTP](#backend--email--smtp)
- [Backend — DTE / Lioren](#backend--dte--lioren)
- [Backend — Sentry & logging](#backend--sentry--logging)
- [Backend — Telemetry & cache](#backend--telemetry--cache)
- [Backend — Audit log](#backend--audit-log)
- [Frontend — Vite](#frontend--vite)
- [Celery (worker + beat)](#celery-worker--beat)
- [Postgres / Docker](#postgres--docker)
- [Backups (`backups` service)](#backups-backups-service)
- [Backups offsite (`backups-offsite` / rclone)](#backups-offsite-backups-offsite--rclone)
- [Tooling — scripts y agentes](#tooling--scripts-y-agentes)
- [Generación de secretos](#generación-de-secretos)

---

## Convenciones

- **`[REQUIRED]`** — la variable debe estar definida; el servicio no arranca sin ella, o lo hace en modo degradado documentado.
- **`[OPTIONAL]`** — se puede omitir; el código tiene un default razonable.
- **Tipo**: `string`, `int`, `bool` (`true`/`false`), `float`, `url`, `enum(...)`.
- **Default**: el valor literal usado cuando la var está ausente. `""` (vacío) significa "no configurado, deshabilita la feature".
- **Source**: archivo y línea donde se lee la var (autoridad).

> Las variables de pydantic en `backend/app/config.py` aceptan **case-insensitive snake_case**: `DATABASE_URL` y `database_url` son equivalentes en `.env`. El proyecto usa MAYÚSCULAS en archivos `.env*`.

---

## ¿Dónde se cargan?

| Archivo | Cargado por | Ámbito |
|---|---|---|
| `.env` | `pydantic-settings` via `Settings(env_file=".env", ...)` (`backend/app/config.py:5`) | Dev local backend + Celery (`docker-compose.yml` monta como `env_file`) |
| `.env.example` | Plantilla mínima dev — copiar a `.env` | Solo referencia |
| `.env.prod` | `docker-compose.prod.yml` (`env_file: .env.prod`) | Producción backend + frontend build |
| `.env.prod.example` | Plantilla producción con backups, Sentry, S3 | Solo referencia |
| `frontend/.env.example` / `frontend/.env.production` | Vite (cargadas por nombre de modo: `dev` / `production`) | Frontend build |
| `scripts/.trello.env` | `scripts/trello_sync.py`, `scripts/auto_loop.py` | Tooling (no se carga al runtime de la app) |

**Reglas:**
- Backend lee primero `os.environ` y luego `.env` (pydantic-settings). Si una var está definida en ambos, **gana `os.environ`**.
- Frontend Vite **solo expone vars con prefijo `VITE_`** al cliente. Cualquier otra es invisible al bundle.
- Docker Compose **interpolación**: `${VAR:-default}` → toma del shell del host, no del `.env` interno del contenedor.

---

## Backend — Core

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `DATABASE_URL` | `url` | **REQUIRED** | — | URL SQLAlchemy. Postgres en prod, SQLite en tests (`sqlite:///./test.db`). | `backend/app/config.py:7`, `backend/migrations/env.py:29` |
| `SECRET_KEY` | `string` | **REQUIRED** | — | Clave de firma JWT. Mínimo 32 chars random. Ver [Generación de secretos](#generación-de-secretos). | `backend/app/config.py:8` |
| `REDIS_URL` | `url` | OPTIONAL | `redis://localhost:6379/0` | Broker + result backend de Celery, también caché Redis para reportes. | `backend/app/config.py:16`, `backend/app/celery_app.py:8-9` |
| `CORS_ORIGINS` | `string` | OPTIONAL | `http://localhost:15173` | CSV de orígenes permitidos. En prod incluir el dominio público (sin trailing slash). | `backend/app/config.py:15` |

**Ejemplo (`.env`)**

```env
DATABASE_URL=postgresql://conico:conico@db:5432/conico
SECRET_KEY=ce8b1c2... # 64 hex chars
REDIS_URL=redis://redis:6379/0
CORS_ORIGINS=https://crm.conico.cl,https://staging.conico.cl
```

---

## Backend — Auth & Tokens

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `int` | OPTIONAL | `30` | TTL del JWT de acceso. | `backend/app/config.py:9` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `int` | OPTIONAL | `7` | TTL del refresh token. | `backend/app/config.py:10` |
| `TOTP_ISSUER` | `string` | OPTIONAL | `Conico` | Emisor mostrado en apps TOTP (Google Authenticator, etc.). | `backend/app/config.py:38` |
| `TWOFA_TICKET_EXPIRE_SECONDS` | `int` | OPTIONAL | `300` | TTL del ticket 2FA intermedio entre password OK y código TOTP. | `backend/app/config.py:39` |
| `PASSWORD_RESET_EXPIRE_MINUTES` | `int` | OPTIONAL | `30` | TTL del token de password reset enviado por email. | `backend/app/config.py:40` |
| `PASSWORD_RESET_URL_BASE` | `url` | OPTIONAL | `http://localhost:15173/reset-password` | Base del link enviado por email. **Cambiar en prod al dominio público.** | `backend/app/config.py:41` |

---

## Backend — Email / SMTP

> Si `SMTP_HOST` está vacío, todo el envío se degrada a no-op con log de warning (no rompe el flujo). Útil en dev.

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `SMTP_HOST` | `string` | OPTIONAL | `""` | Servidor SMTP. Vacío = email deshabilitado. | `backend/app/config.py:11`, `backend/app/services/email.py:13` |
| `SMTP_PORT` | `int` | OPTIONAL | `587` | Puerto SMTP. STARTTLS asumido en 587. | `backend/app/config.py:12` |
| `SMTP_USER` | `string` | OPTIONAL | `""` | Usuario SMTP. | `backend/app/config.py:13` |
| `SMTP_PASSWORD` | `string` | OPTIONAL | `""` | Password / app-password. **Tratar como secreto.** | `backend/app/config.py:14` |
| `SMTP_FROM` | `string` | OPTIONAL | `${SMTP_USER}` | Remitente visible en el email. Si no se setea, usa `SMTP_USER`. | `backend/app/services/email.py:17` |

**Ejemplo (Gmail con app-password)**

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notificaciones@conico.cl
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
SMTP_FROM=Conico CRM <notificaciones@conico.cl>
```

---

## Backend — DTE / Lioren

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `LIOREN_API_URL` | `url` | OPTIONAL | `https://api.lioren.cl/v1` | Endpoint base del proveedor SII. Cambiar a sandbox cuando aplique. | `backend/app/config.py:17` |
| `LIOREN_API_KEY` | `string` | OPTIONAL† | `""` | API key de Lioren. **Required si emites DTE.** | `backend/app/config.py:18` |
| `LIOREN_WEBHOOK_SECRET` | `string` | OPTIONAL† | `""` | Secret HMAC para validar webhooks de Lioren. **Required si recibes webhooks de estado DTE.** | `backend/app/config.py:19` |

† Optional para arrancar la app, pero **funcionalmente required** para el flujo DTE. La emisión falla con error claro si falta `LIOREN_API_KEY`.

---

## Backend — Sentry & logging

> `init_sentry()` es no-op si `SENTRY_DSN` está vacío (logea un warning). El proyecto soporta release detection automático: si `SENTRY_RELEASE` no está, intenta `GIT_SHA` → `SOURCE_VERSION` → `GIT_COMMIT` → `git rev-parse HEAD`.
>
> Detalles de routing-aware sampling y dashboards: ver `docs/observability.md`.

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `SENTRY_DSN` | `string` | OPTIONAL | `""` | DSN Sentry. Vacío = Sentry off. | `backend/app/config.py:22` |
| `SENTRY_ENV` | `enum(production, staging, dev)` | OPTIONAL | `production` | Tag de environment. | `backend/app/config.py:23` |
| `SENTRY_TRACES_SAMPLE_RATE` | `float` | OPTIONAL | `0.0` | **⚠ Stale.** No se pasa al SDK; el sampling real lo dicta `traces_sampler` en `observability.py`. Mantener por compat — pendiente de eliminar. | `backend/app/config.py:24`, `docs/observability.md` |
| `SENTRY_RELEASE` | `string` | OPTIONAL | `""` | Override del release. Vacío = autodetect. | `backend/app/config.py:25` |
| `SENTRY_TRACES_PROFILE` | `bool` | OPTIONAL | `false` | `true` enciende Sentry profiling (sample rate 1.0). | `backend/app/config.py:26` |
| `GIT_SHA` / `SOURCE_VERSION` / `GIT_COMMIT` | `string` | OPTIONAL | — | Fallbacks para release detection. Setearlos en CI/CD. | `backend/app/core/observability.py:27` |
| `LOG_FORMAT` | `enum(json, pretty)` | OPTIONAL | `pretty` | `json` para prod (Loki/CloudWatch), `pretty` para dev. | `backend/app/config.py:27` |
| `LOG_LEVEL` | `enum(DEBUG, INFO, WARNING, ERROR)` | OPTIONAL | `INFO` | Nivel mínimo. | `backend/app/config.py:28` |

---

## Backend — Telemetry & cache

> Cache TTLs son tunables por cluster sin redeployar: bumpealos hot vía `os.environ` y reinicia worker.

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `DB_METRICS_ENABLED` | `bool` | OPTIONAL | `false` | Activa logging estructurado de queries lentas. | `backend/app/config.py:31` |
| `SLOW_QUERY_MS` | `int` | OPTIONAL | `200` | Umbral en ms para que una query cuente como "lenta". | `backend/app/config.py:32` |
| `CACHE_TTL_VENTAS` | `int (seg)` | OPTIONAL | `120` | TTL Redis cache reportes de ventas. | `backend/app/core/cache.py:15` |
| `CACHE_TTL_COBRANZA` | `int (seg)` | OPTIONAL | `120` | TTL cache cobranza. | `backend/app/core/cache.py:16` |
| `CACHE_TTL_INVENTARIO` | `int (seg)` | OPTIONAL | `60` | TTL cache inventario. | `backend/app/core/cache.py:17` |
| `CACHE_TTL_COMPRAS` | `int (seg)` | OPTIONAL | `120` | TTL cache compras. | `backend/app/core/cache.py:18` |
| `CACHE_TTL_MARGENES` | `int (seg)` | OPTIONAL | `300` | TTL cache margenes (cálculo más caro). | `backend/app/core/cache.py:19` |
| `CACHE_TTL_DTE` | `int (seg)` | OPTIONAL | `300` | TTL cache estados DTE. | `backend/app/core/cache.py:20` |
| `CACHE_TTL_POR_MARCA` | `int (seg)` | OPTIONAL | `300` | TTL cache reporte por marca. | `backend/app/core/cache.py:21` |
| `CACHE_TTL_KPIS` | `int (seg)` | OPTIONAL | `60` | TTL KPIs dashboard (alta refresh-rate). | `backend/app/core/cache.py:22` |
| `CACHE_TTL_DEFAULT` | `int (seg)` | OPTIONAL | `120` | Fallback para cualquier `domain` no listado arriba. | `backend/app/core/cache.py:23` |

---

## Backend — Audit log

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `AUDIT_LOG_RETENTION_DAYS` | `int` | OPTIONAL | `180` | Días de retención online. La tarea Celery `archive_old_audit_logs` (lunes 02:00) mueve registros más viejos a la tabla de archivo. | `backend/app/config.py:35`, `backend/app/celery_app.py:48` |

---

## Frontend — Vite

> Vite **solo bundlea** vars con prefijo `VITE_`. Otras pasan al build pero quedan invisibles al cliente.

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `VITE_API_URL` | `url` | OPTIONAL | (vacío → proxy `/api` del dev server) | Base del backend. Vacío en dev (Vite proxea); en prod debe ser absoluto (`https://api.conico.cl` o relativo `/`). | `frontend/.env.example:5`, `frontend/src/vite-env.d.ts:4` |
| `VITE_SENTRY_DSN` | `string` | OPTIONAL | `""` | DSN Sentry frontend. Vacío = Sentry off. | `frontend/src/sentry.ts:14` |
| `VITE_SENTRY_ENV` | `string` | OPTIONAL | `import.meta.env.MODE` | Tag de environment para Sentry. | `frontend/src/sentry.ts:27` |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | `float` | OPTIONAL | `0` | Sample rate de tracing (0–1). | `frontend/src/sentry.ts:30` |
| `VITE_TELEMETRY_SAMPLE_RATE` | `float` | OPTIONAL | `1.0` | Sample rate del beacon de Web Vitals al backend. `0` desactiva. | `frontend/src/lib/webVitals.ts:4` |

---

## Celery (worker + beat)

Celery hereda variables del backend vía `env_file: .env` en `docker-compose.yml`. **No tiene vars exclusivas** — `REDIS_URL` actúa de broker y backend; `DATABASE_URL` se usa para tareas que tocan la DB.

Tareas y su schedule (referencia, no env-configurables actualmente — ver `backend/app/celery_app.py:19-52`):

| Task | Schedule | Función |
|---|---|---|
| `poll-dte-status` | cada 300s | Sondear estados de DTE en Lioren |
| `generar-tareas-automaticas` | cada hora | Evaluador de `ReglaTarea` |
| `enviar-recordatorios` | diario 08:00 | Recordatorios de cobranza |
| `enviar-alertas-caf` | diario 08:30 | Alertas de CAF próximas a vencer |
| `aggregate-perf-hourly` | cada hora :05 | Rollup hourly de telemetría perf |
| `aggregate-cost-hourly` | cada hora :10 | Rollup hourly de costos Lioren |
| `cleanup-old-rollups` | domingos 03:00 | Limpieza de rollups antiguos |
| `archive-audit-logs` | lunes 02:00 | Archivado audit log (`AUDIT_LOG_RETENTION_DAYS`) |

---

## Postgres / Docker

Solo aplica a `docker-compose.prod.yml`. En dev (`docker-compose.yml`) los valores están hardcodeados (`conico/conico/conico`).

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `POSTGRES_DB` | `string` | OPTIONAL | `conico` | Nombre de la base. Debe coincidir con el path en `DATABASE_URL`. | `docker-compose.prod.yml:12` |
| `POSTGRES_USER` | `string` | OPTIONAL | `conico` | Usuario de la base. | `docker-compose.prod.yml:13` |
| `POSTGRES_PASSWORD` | `string` | **REQUIRED** | — | Password en prod. **Sin default — el contenedor no arranca si no la setean.** | `docker-compose.prod.yml:14` |

---

## Backups (`backups` service)

Servicio `prodrigestivill/postgres-backup-local:15`. Ver `docs/runbooks/backup-restore.md`.

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `BACKUP_SCHEDULE` | `string (cron)` | OPTIONAL | `@daily` | Schedule del cron interno. Acepta `@daily`, `@hourly` o cron-style (`0 3 * * *`). | `docker-compose.prod.yml:54` |
| `BACKUP_KEEP_DAYS` | `int` | OPTIONAL | `7` | Diarios a retener. | `docker-compose.prod.yml:55` |
| `BACKUP_KEEP_WEEKS` | `int` | OPTIONAL | `4` | Semanales a retener. | `docker-compose.prod.yml:56` |
| `BACKUP_KEEP_MONTHS` | `int` | OPTIONAL | `6` | Mensuales a retener. | `docker-compose.prod.yml:57` |

---

## Backups offsite (`backups-offsite` / rclone)

Servicio `rclone/rclone:1.65`. **Si `S3_BUCKET` está vacío, el contenedor sale 0 inmediatamente (skip graceful).** Soporta S3 nativo, Backblaze B2, Wasabi, MinIO, GCS, Azure Blob (cambiar `S3_PROVIDER` y opcionalmente `RCLONE_CONFIG_REMOTE_TYPE`).

| Variable | Tipo | Required | Default | Descripción | Source |
|---|---|---|---|---|---|
| `S3_BUCKET` | `string` | OPTIONAL | `""` | Bucket destino. Vacío = offsite deshabilitado. | `docker-compose.prod.yml:77,95` |
| `S3_PREFIX` | `string` | OPTIONAL | `conico-prod` | Prefijo (carpeta) dentro del bucket. | `docker-compose.prod.yml:81,96` |
| `S3_ENDPOINT` | `url` | OPTIONAL | `""` | Endpoint custom (B2, Wasabi, MinIO). Vacío = AWS S3 default. | `docker-compose.prod.yml:92` |
| `S3_REGION` | `string` | OPTIONAL | `us-east-1` | Región AWS o equivalente. | `docker-compose.prod.yml:93` |
| `S3_PROVIDER` | `enum(AWS, Backblaze, Wasabi, Minio, Other, ...)` | OPTIONAL | `Other` | Provider rclone. Ver [valores válidos rclone S3](https://rclone.org/s3/). | `docker-compose.prod.yml:89` |
| `S3_KEY` | `string` | OPTIONAL | `""` | Access key. **Tratar como secreto.** | `docker-compose.prod.yml:90` |
| `S3_SECRET` | `string` | OPTIONAL | `""` | Secret key. **Tratar como secreto.** | `docker-compose.prod.yml:91` |

---

## Tooling — scripts y agentes

> No se cargan al runtime de la app. Aplicables solo a operadores de la consola (sync Trello, autonomous loop, deploy).

| Variable | Required | Descripción | Source |
|---|---|---|---|
| `TRELLO_API_KEY` | **REQUIRED** (para usar `trello_sync.py`) | API key Trello. Obtener en https://trello.com/app-key. | `scripts/.trello.env`, `scripts/trello_sync.py` |
| `TRELLO_TOKEN` | **REQUIRED** (idem) | Token OAuth Trello, debe tener permisos read/write sobre el board. | `scripts/.trello.env`, `scripts/trello_sync.py` |
| `TRELLO_BOARD_ID` | **REQUIRED** (idem) | ID del board de Conico (`69f0015d87f756962fb74da8`). | `scripts/.trello.env` |
| `OPENROUTER_API_KEY` | OPTIONAL | API key OpenRouter (triage en `auto_loop.py` con `--provider openrouter`). | `scripts/.trello.env` |
| `STRAICO_API_KEY` | OPTIONAL | API key Straico (triage default). | `scripts/.trello.env` |
| `COOLIFY_READONLY_KEY` | OPTIONAL | Token read-only de Coolify para inspección de despliegues. | `scripts/.trello.env`, `.env.prod` |
| `DATA_SEED_DIR` | OPTIONAL (default `/data_seed`) | Path al directorio de seeds dentro del contenedor backend. | `backend/scripts/seed_all.py:30` |

`scripts/.trello.env` está gitignored — **nunca commitear**.

---

## Generación de secretos

```bash
# SECRET_KEY (JWT) — 64 hex chars
openssl rand -hex 32

# Password DB postgres prod
openssl rand -base64 24 | tr -d '/+='

# Webhook secret HMAC (Lioren)
openssl rand -hex 32

# Token TOTP no requiere generación — el seed se crea por usuario en runtime.
```

> Después de rotar `SECRET_KEY` **todos los JWT existentes se invalidan** (los usuarios deben reloguearse). Coordinarlo con una ventana de mantenimiento o avisar.

---

## Cómo agregar una nueva variable

1. **Backend (pydantic):** agregar campo tipado en `backend/app/config.py`. Si se quiere acceso vía `os.environ` directo (CACHE_TTL_*, GIT_SHA), también funciona pero es la excepción.
2. **Frontend:** agregarla en `frontend/.env.example`, declarar el tipo en `frontend/src/vite-env.d.ts`, y leerla con `import.meta.env.VITE_FOO`.
3. **Compose:** si la lee un servicio fuera del backend (rclone, postgres-backup-local), agregar al bloque `environment:` de `docker-compose.prod.yml` con default seguro: `${MI_VAR:-default}`.
4. **Plantillas:** agregar a `.env.example` (dev) y/o `.env.prod.example` (prod) con un comentario.
5. **Documentar acá**: tipo, required/optional, default, descripción, fuente. **Sin esto, la PR no entra.**

---

## Referencias relacionadas

- [`docs/architecture.md`](architecture.md) — visión general de la arquitectura.
- [`docs/observability.md`](observability.md) — Sentry sampling rules, dashboards, tagging.
- [`docs/runbooks/backup-restore.md`](runbooks/backup-restore.md) — procedimientos de restore.
- [`.planning/codebase/STACK.md`](../.planning/codebase/STACK.md) — stack y plataformas.
- [`.planning/codebase/INTEGRATIONS.md`](../.planning/codebase/INTEGRATIONS.md) — integraciones externas.
- [`QUICKSTART.md`](../QUICKSTART.md) — onboarding dev local.
