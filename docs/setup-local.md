# Local Development Setup Guide

> **Estado:** documento canónico. Última revisión: 2026-05-06.
>
> Esta es la guía única para levantar Conico CRM en desarrollo local. Si encuentras un comando que no funciona, no lo trabajees alrededor — actualiza este doc para que el siguiente dev no caiga en la misma trampa.

Objetivo: stack completo (Postgres + Redis + Backend FastAPI + Celery + Vite frontend) corriendo en menos de 30 minutos sin intervención manual de nadie más.

---

## Tabla de contenidos

- [Prerrequisitos](#prerrequisitos)
- [1. Clonar y configurar `.env`](#1-clonar-y-configurar-env)
- [2. Levantar el stack con Docker Compose](#2-levantar-el-stack-con-docker-compose)
- [3. Migraciones Alembic](#3-migraciones-alembic)
- [4. Cargar datos de seed / fixtures](#4-cargar-datos-de-seed--fixtures)
- [5. Ejecutar test suites](#5-ejecutar-test-suites)
- [6. Workflow día-a-día](#6-workflow-día-a-día)
- [7. Troubleshooting común](#7-troubleshooting-común)
- [Apéndice: desarrollo sin Docker (avanzado)](#apéndice-desarrollo-sin-docker-avanzado)

---

## Prerrequisitos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| **Docker** | 20.10+ | Path principal — todo el stack vive en contenedores. Docker Desktop 4.x en Windows/Mac es lo que usa el equipo. |
| **Docker Compose** | v2 (plugin) | Incluido con Docker Desktop. CLI: `docker compose` (no `docker-compose`). |
| **Git** | 2.30+ | Para clonar y para los hooks de pre-commit. |
| **Node.js** | 20.x | Solo necesario si vas a correr el frontend fuera de Docker o ejecutar `npm test` localmente (Dockerfile usa `node:20-alpine`). |
| **Python** | 3.12 | Solo necesario si vas a correr backend/tests fuera de Docker (Dockerfile usa `python:3.12-slim`). |

> **Windows / ARM (M1/M2/M3):** Docker Desktop maneja la virtualización; las imágenes base son multi-arch (`postgres:15-alpine`, `redis:7-alpine`, `python:3.12-slim`, `node:20-alpine`). No hace falta configuración especial.

---

## 1. Clonar y configurar `.env`

```bash
git clone <repo-url> ConicoCRM
cd ConicoCRM
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

`.env` (raíz) — cargado por el backend y por Celery vía `env_file: .env` en `docker-compose.yml`. El template `.env.example` trae los mínimos para arrancar:

```ini
DATABASE_URL=postgresql://conico:conico@db:5432/conico
SECRET_KEY=change-me-use-openssl-rand-hex-32
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
```

**Acción inmediata:** reemplazar `SECRET_KEY` con un valor real:

```bash
# Linux/Mac
python -c "import secrets; print(secrets.token_hex(32))"
# Windows PowerShell
python -c "import secrets; print(secrets.token_hex(32))"
```

> **No hace falta tocar `DATABASE_URL`** — el host `db` resuelve dentro de la red de Compose al servicio Postgres. Solo cámbialo si vas a correr backend fuera de Docker (ver [apéndice](#apéndice-desarrollo-sin-docker-avanzado)).

`frontend/.env.local` — cargado por Vite. Para dev con stack Compose dejar `VITE_API_URL` vacío: el `vite.config.ts` ya tiene `server.proxy['/api'] = 'http://localhost:8000'`, y el frontend hace requests relativas a `/api/...`. Solo defínelo si apuntas a un backend remoto.

> **Variables completas:** la referencia exhaustiva con tipos, defaults y de dónde se leen está en [`docs/environment-variables.md`](./environment-variables.md). Este doc cubre solo lo mínimo para arrancar.

---

## 2. Levantar el stack con Docker Compose

```bash
docker compose up -d --build
```

Servicios y puertos host (definidos en `docker-compose.yml`):

| Servicio | Puerto host | Puerto interno | Healthcheck |
|---|---|---|---|
| `db` (Postgres 15) | `15432` | 5432 | `pg_isready -U conico -d conico` |
| `redis` (Redis 7) | `16379` | 6379 | `redis-cli ping` |
| `backend` (FastAPI + uvicorn `--reload`) | `18000` | 8000 | — (depende de `db` + `redis` healthy) |
| `frontend` (Vite dev server) | `15173` | 5173 | — |
| `celery_worker` | — | — | depende de `db` + `redis` |
| `celery_beat` | — | — | depende de `db` + `redis` |

> **Puertos no son los estándar** (15432 en vez de 5432, 18000 en vez de 8000, etc.) para no chocar con Postgres/Redis/dev servers que ya tengas corriendo en el host.

### Verificar que todo está sano

```bash
# Estado de servicios
docker compose ps

# Logs en vivo del backend (Ctrl-C para salir, no detiene el contenedor)
docker compose logs -f backend

# Healthcheck del backend
curl http://localhost:18000/api/health
# → {"status": "ok", ...}

# Frontend
open http://localhost:15173        # Mac
start http://localhost:15173       # Windows
xdg-open http://localhost:15173    # Linux
```

Si `docker compose ps` muestra el backend en estado `restarting`, mira `docker compose logs backend` — casi siempre es `.env` mal configurado o migración fallando ([§7](#7-troubleshooting-común)).

---

## 3. Migraciones Alembic

**En dev con Docker Compose: ya están aplicadas.** El `backend/entrypoint.sh` corre `alembic upgrade heads` automáticamente cada vez que arranca el contenedor backend, antes de levantar uvicorn.

Comandos útiles (todos van adentro del contenedor):

```bash
# Ver el head actual
docker compose exec backend alembic current

# Ver la lista completa de revisiones
docker compose exec backend alembic history

# Aplicar migraciones manualmente (raro — el entrypoint ya lo hace)
docker compose exec backend alembic upgrade heads

# Crear una nueva migración después de modificar modelos
docker compose exec backend alembic revision --autogenerate -m "describe change"

# Bajar una revisión (cuidado en dev compartido)
docker compose exec backend alembic downgrade -1
```

> **Nota crítica:** usamos `upgrade heads` (plural), no `upgrade head`. Si en algún momento apareció un branch en el árbol de migraciones, `heads` los aplica todos. Antes de commitear una migración nueva siempre corre `alembic heads` y verifica que haya **un solo head** (regla del CLAUDE.md raíz). Si hay dos, hay que crear una merge revision (`alembic merge -m "merge X+Y" <rev1> <rev2>`).

### `alembic.ini` y URL de la DB

`backend/alembic.ini:89` tiene `sqlalchemy.url = postgresql://conico:conico@localhost:15432/conico` — apunta al puerto **host** (15432). Esto sirve para correr alembic *fuera* de Docker desde tu máquina. Adentro del contenedor `env.py` toma la URL desde `DATABASE_URL`, que apunta a `db:5432` (red interna).

---

## 4. Cargar datos de seed / fixtures

Hay dos seeds independientes:

### a) Seed de admin (mínimo para login)

`backend/scripts/seed_admin.py` crea un único usuario admin con credenciales por defecto. Esto **ya lo corre `entrypoint.sh`** en dev al arrancar el contenedor (best-effort: si falla, no rompe el boot).

Credenciales por defecto:

```
email:    admin@conico.cl
password: changeme123
```

> **Cambiar la contraseña inmediatamente** después del primer login (Configuración → Usuarios). Estas credenciales son solo para desbloquear el primer acceso en dev/staging fresh.

Para forzar (idempotente — si ya existe un admin, no hace nada):

```bash
docker compose exec backend python scripts/seed_admin.py
```

### b) Seed completo desde Excels (`data_seed/`)

`backend/scripts/seed_all.py` puebla la base con datos realistas: clientes, empresas, productos, cotizaciones, NV, facturas, OC, pagos, NC/ND, guías de despacho, boletas, empleados, etc. Lee los archivos Excel del directorio `data_seed/` (montado como `/data_seed` en el contenedor backend vía `docker-compose.yml`).

Archivos esperados en `data_seed/` (ver repo — ya commiteados):

- `Clientes_Cartera_de_Clientes_*.xlsx`
- `Empresas_Empresas_*.xlsx`
- `Productos_Lista_de_precios_*.xlsx`
- `Stock_Conico_INVENTARIO_*.xlsx`
- `Cotizaciones_*.xlsx`

Para correrlo:

```bash
docker compose exec backend python scripts/seed_all.py
```

> El entrypoint también dispara `seed_all.py` (línea 32 de `entrypoint.sh`), pero está envuelto en `|| echo "Seed warning: non-fatal errors"` — errores parciales (un Excel que ya está cargado, un campo cambiado de schema) no rompen el arranque. Si necesitas un seed limpio, primero `docker compose down -v` (elimina volúmenes incluyendo `pgdata`), después `up`.

### Reset completo de datos en dev

```bash
docker compose down -v        # ⚠️  borra el volumen pgdata
docker compose up -d --build  # arranca limpio: migra + seed automático
```

---

## 5. Ejecutar test suites

### Backend (pytest)

```bash
# Todo el suite (excluye smoke por default — ver pytest.ini)
docker compose exec backend pytest

# Un archivo específico
docker compose exec backend pytest tests/test_auth.py

# Un test específico, verbose
docker compose exec backend pytest tests/test_auth.py::test_login_ok -v

# Con cobertura básica (no está en requirements; instalar ad-hoc)
docker compose exec backend pip install pytest-cov
docker compose exec backend pytest --cov=app --cov-report=term-missing
```

> **Smoke tests:** `backend/pytest.ini` define `addopts = -m "not smoke"`, lo que excluye tests marcados `@pytest.mark.smoke`. Esos tests requieren el stack Docker corriendo y golpean endpoints reales. Para correrlos: `pytest -m smoke`.

Los tests usan **fakeredis** y **SQLite in-memory** vía `tests/conftest.py` — no tocan la base Postgres real ni Redis del Compose, por lo que son rápidos y deterministas.

### Frontend (vitest)

```bash
# Adentro del contenedor frontend
docker compose exec frontend npm test

# O fuera de Docker (necesita Node 20 local + npm install previo)
cd frontend
npm install
npm test
```

Otras tareas del frontend (definidas en `frontend/package.json:6-13`):

```bash
npm run dev          # Vite dev server (igual que el contenedor)
npm run build        # tsc + vite build (verifica tipos antes de bundlear)
npm run lint         # tsc --noEmit (typecheck puro)
npm run storybook    # Storybook en :6006
```

### Antes de commit/push

Regla del repo (`CLAUDE.md` raíz): **siempre** correr ambos suites antes de commitear:

```bash
docker compose exec backend pytest && docker compose exec frontend npm test -- --run
```

> `npm test -- --run` corre vitest en modo no-watch (single shot). Sin `--run`, vitest se queda en watch mode y el comando nunca termina.

---

## 6. Workflow día-a-día

Una vez que el stack está arriba, el ciclo típico:

```bash
# Ver logs cuando algo falla
docker compose logs -f backend
docker compose logs -f celery_worker

# Reiniciar solo el backend tras cambiar requirements.txt
docker compose up -d --build backend

# Hot-reload: el backend ya corre con `uvicorn --reload` y monta ./backend
# como volumen — los cambios en .py se aplican solos. Igual con Vite y ./frontend.

# Shell dentro del backend (psql, ipython, etc.)
docker compose exec backend bash
docker compose exec db psql -U conico -d conico

# Apagar todo (preserva el volumen pgdata)
docker compose down

# Apagar y borrar la DB (reset completo)
docker compose down -v
```

---

## 7. Troubleshooting común

### `port is already allocated` al hacer `up`
Algo ya escucha en uno de los puertos host (15432, 16379, 18000, 15173). Buscar y matar:

```bash
# Linux/Mac
lsof -i :15432
# Windows
netstat -ano | findstr :15432
```

O cambiar el puerto en `docker-compose.yml` (lado izquierdo del `:`), pero recordá actualizar `alembic.ini`, `vite.config.ts` proxy, y cualquier hardcode local.

### Backend en `restarting` loop
```bash
docker compose logs backend --tail=50
```
Causas frecuentes:
- `SECRET_KEY` vacío en `.env` → pydantic falla al cargar `Settings`.
- DB todavía no healthy (race condition al primer boot tras `down -v`) → esperar 10-20s y `docker compose restart backend`.
- Migración rota → `docker compose exec backend alembic current` y revisar.

### `alembic_version` con dos heads
```bash
docker compose exec backend alembic heads
# si muestra dos:
docker compose exec backend alembic merge -m "merge heads" <rev1> <rev2>
docker compose exec backend alembic upgrade heads
```

### Frontend no llega al backend (CORS / 404 en `/api/*`)
- En dev con el stack completo, el backend debe estar en `:18000` (no en `:8000`).
- `vite.config.ts` proxea `/api` → `http://localhost:8000`, pero ese `8000` es el puerto **interno** que solo es válido si Vite corre dentro del network de Compose (que es el caso por default). Si corres `npm run dev` *fuera* de Docker, ajustar el proxy a `http://localhost:18000`.
- El backend lee `cors_origins` de `.env` (default `http://localhost:15173`). Si cambiaste el puerto del frontend, agregalo ahí (separado por coma para múltiples).

### `weasyprint` o PDF generation falla
La imagen backend instala `libpango`, `libcairo`, `libgdk-pixbuf` (ver `backend/Dockerfile:2-4`). Si corres backend fuera de Docker en Windows/Mac, instalar Pango/Cairo a mano es doloroso — usar Docker es la salida fácil.

### Tests pasan local pero fallan en CI
- ¿Estás corriendo `pytest -m smoke` en CI sin servicios up? Removelo o levanta el stack con `docker compose up -d` antes.
- Encoding: scripts y archivos siempre con `encoding='utf-8'` explícito (regla del repo). Default Windows es cp1252 y rompe con caracteres en español.

### `npm install` muy lento en Docker
El Dockerfile del frontend monta `node_modules` como volumen anónimo (`/app/node_modules` en `docker-compose.yml:74`) para no overrideado por el bind mount de `./frontend`. Cuando agregas dependencias:

```bash
docker compose exec frontend npm install <package>
docker compose restart frontend
```

Si el lockfile cambia y el contenedor quedó stale: `docker compose up -d --build frontend`.

---

## Apéndice: desarrollo sin Docker (avanzado)

Útil para debugging con el debugger del IDE pegado al proceso, o cuando Docker Desktop está pesado.

### Backend nativo

Requiere Python 3.12 + Postgres + Redis corriendo en el host (puede ser solo el `db` y `redis` de Compose):

```bash
# Levantar solo db + redis del Compose
docker compose up -d db redis

# Backend nativo
cd backend
python -m venv .venv
source .venv/bin/activate          # Linux/Mac
.venv\Scripts\Activate.ps1         # Windows PowerShell
pip install -r requirements.txt

# Override DATABASE_URL para apuntar al puerto host (15432)
export DATABASE_URL=postgresql://conico:conico@localhost:15432/conico
export REDIS_URL=redis://localhost:16379/0
export SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")

alembic upgrade heads
python scripts/seed_admin.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> Importante: no copies todo el `.env` tal cual — `DATABASE_URL` allí asume el host `db` de la red de Docker (no resuelve fuera).

### Celery nativo

```bash
# En otra terminal con el venv activo
celery -A app.celery_app worker --loglevel=info
celery -A app.celery_app beat --loglevel=info
```

### Frontend nativo

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

### Tests nativos

```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npm test -- --run
```
