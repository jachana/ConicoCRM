# Conico PMS — Quickstart

## Desarrollo local

### Requisitos
- Docker Desktop
- Git

### 1. Clonar y configurar entorno

```bash
git clone git@github.com:jachana/ConicoCRM.git
cd ConicoCRM
cp .env.example .env   # editar con tus valores
```

### 2. Variables de entorno (`.env`)

```env
DATABASE_URL=postgresql://conico:conico@db:5432/conico
SECRET_KEY=cambia-esto-por-un-secreto-largo
CORS_ORIGINS=http://localhost:5173
```

### 3. Levantar servicios

```bash
docker compose up --build
```

Servicios disponibles:
| Servicio | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Docs API | http://localhost:8000/docs |

### 4. Crear usuario admin inicial

```bash
docker compose exec backend python scripts/seed_admin.py
```

Esto crea el usuario `admin@conico.cl` con contraseña `admin123`. **Cambiarlo después del primer login.**

### 5. Ejecutar migraciones (primera vez)

Las migraciones corren automáticamente al iniciar el backend. Si necesitas correrlas manualmente:

```bash
docker compose exec backend alembic upgrade head
```

---

## Producción (Coolify)

### 1. Variables de entorno requeridas en Coolify

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | `postgresql://conico:<password>@db:5432/conico` |
| `SECRET_KEY` | String aleatorio largo (mín. 32 chars) |
| `CORS_ORIGINS` | URL de tu dominio, ej. `https://crm.conico.cl` |
| `POSTGRES_PASSWORD` | Contraseña de la base de datos |

### Variables opcionales (email)

| Variable | Descripción |
|---|---|
| `SMTP_HOST` | Servidor SMTP |
| `SMTP_PORT` | Puerto (default: 587) |
| `SMTP_USER` | Usuario SMTP |
| `SMTP_PASSWORD` | Contraseña SMTP |
| `SMTP_FROM` | Dirección remitente |

### 2. Configurar Coolify

1. Nuevo recurso → Docker Compose
2. Repositorio: `git@github.com:jachana/ConicoCRM.git`
3. Archivo compose: `docker-compose.prod.yml`
4. Agregar variables de entorno
5. Deploy

Las migraciones se ejecutan automáticamente antes de iniciar el backend.

### 3. Primer deploy

```bash
# Crear admin inicial (una sola vez)
docker compose -f docker-compose.prod.yml exec backend python scripts/seed_admin.py
```

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | FastAPI + SQLAlchemy 2 + Alembic |
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Base de datos | PostgreSQL 15 |
| PDF | WeasyPrint |
| Auth | JWT (access + refresh tokens) |
| Deploy | Docker Compose + Nginx |
