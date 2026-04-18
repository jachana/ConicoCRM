# Conico PMS — Fase 1: Fundación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working web app with JWT auth, role-based permissions (configurable per user), user management UI, and base app layout (collapsible sidebar, dark/light theme). All subsequent phases build on this foundation.

**Architecture:** FastAPI backend with JWT (access + refresh tokens) and granular per-user permission overrides in PostgreSQL. Default permissions per role hardcoded in Python; Admin overrides stored per (user, module, action). React + TypeScript SPA with Zustand auth store, React Query for data fetching, and Tailwind for styling.

**Tech Stack:** Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, Alembic, PostgreSQL 15, pytest, httpx; React 18, TypeScript 5, Vite 5, TailwindCSS 3, React Router 6, React Query 5, Zustand 4, Axios, Vitest, React Testing Library

---

## File Structure

```
conico-pms/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, CORS, routers
│   │   ├── config.py                # Settings from env vars (pydantic-settings)
│   │   ├── database.py              # SQLAlchemy engine + get_db dependency
│   │   ├── models/
│   │   │   ├── __init__.py          # re-exports all models (needed by alembic)
│   │   │   ├── user.py              # User ORM model
│   │   │   └── permission.py        # PermissionOverride ORM model
│   │   ├── schemas/
│   │   │   ├── auth.py              # Token, RefreshRequest pydantic schemas
│   │   │   └── user.py              # UserOut, UserCreate, UserUpdate
│   │   ├── api/
│   │   │   ├── auth.py              # /auth/login, /auth/refresh, /auth/me + get_current_user dep
│   │   │   └── users.py             # /users CRUD + /users/{id}/permissions
│   │   └── core/
│   │       ├── security.py          # JWT creation/decode, password hashing
│   │       └── permissions.py       # DEFAULT_PERMISSIONS dict, has_permission(), get_user_permissions()
│   ├── scripts/
│   │   └── seed_admin.py            # Creates first admin user
│   ├── tests/
│   │   ├── conftest.py              # TestClient, DB fixtures, admin_user + admin_token fixtures
│   │   ├── test_models.py           # User model unit tests
│   │   ├── test_permissions.py      # Permission logic unit tests
│   │   ├── test_auth.py             # Auth endpoint integration tests
│   │   └── test_users.py            # Users endpoint integration tests
│   ├── migrations/                  # Alembic (auto-generated)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── alembic.ini
├── frontend/
│   ├── src/
│   │   ├── main.tsx                 # React root, QueryClientProvider
│   │   ├── App.tsx                  # RouterProvider + ThemeProvider
│   │   ├── router.tsx               # createBrowserRouter, RequireAuth guard
│   │   ├── index.css                # Tailwind directives
│   │   ├── test-setup.ts            # @testing-library/jest-dom import
│   │   ├── types/
│   │   │   └── index.ts             # User, Module, Action, Permissions types
│   │   ├── lib/
│   │   │   └── api.ts               # Axios instance with auth + token-refresh interceptors
│   │   ├── stores/
│   │   │   └── auth.ts              # Zustand persisted auth store (user, tokens, setAuth, logout)
│   │   ├── hooks/
│   │   │   └── useAuth.ts           # login(), isAuthenticated, user, logout
│   │   ├── components/
│   │   │   └── layout/
│   │   │       ├── ThemeProvider.tsx # dark/light context, reads OS preference
│   │   │       ├── Sidebar.tsx       # Collapsible nav sidebar
│   │   │       └── AppLayout.tsx     # Sidebar + <Outlet>
│   │   └── pages/
│   │       ├── Login.tsx            # Login form page
│   │       └── Users.tsx            # User list + permission toggles modal
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── Dockerfile                   # dev
│   └── Dockerfile.prod              # multi-stage build
├── nginx/
│   └── nginx.conf
├── docker-compose.yml               # local dev
├── docker-compose.prod.yml          # production
└── .env.example
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `backend/requirements.txt`
- Create: `backend/Dockerfile`
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`
- Create: `backend/app/main.py`
- Create: `backend/alembic.ini` (via alembic init)
- Create: `frontend/package.json`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p backend/app/{models,schemas,api,core}
mkdir -p backend/{tests,scripts,migrations}
mkdir -p frontend/src/{pages,components/layout,hooks,stores,lib,types}
touch backend/app/__init__.py
touch backend/app/models/__init__.py
touch backend/app/schemas/__init__.py
touch backend/app/api/__init__.py
touch backend/app/core/__init__.py
touch backend/tests/__init__.py
```

- [ ] **Step 2: Create `.env.example`**

```
DATABASE_URL=postgresql://conico:conico@db:5432/conico
SECRET_KEY=change-me-use-openssl-rand-hex-32
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
```

Also copy to `.env`:
```bash
cp .env.example .env
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
version: "3.9"
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: conico
      POSTGRES_USER: conico
      POSTGRES_PASSWORD: conico
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      - db

  frontend:
    build: ./frontend
    command: npm run dev -- --host
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"

volumes:
  pgdata:
```

- [ ] **Step 4: Create `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy==2.0.35
alembic==1.13.3
psycopg2-binary==2.9.9
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
pydantic-settings==2.5.2
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
email-validator==2.2.0
```

- [ ] **Step 5: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
```

- [ ] **Step 6: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
```

- [ ] **Step 7: Create `backend/app/database.py`**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 8: Create `backend/app/main.py`** (stub — routers added in later tasks)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Conico PMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- [ ] **Step 9: Initialize Alembic**

```bash
cd backend && alembic init migrations
```

Edit `backend/alembic.ini` — change the sqlalchemy.url line:
```ini
sqlalchemy.url = postgresql://conico:conico@localhost:5432/conico
```

Edit `backend/migrations/env.py` — replace the `target_metadata` block:
```python
from app.database import Base
from app.models import *  # noqa
target_metadata = Base.metadata
```

Also add at the top of `migrations/env.py`:
```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
```

- [ ] **Step 10: Create `frontend/package.json`**

```json
{
  "name": "conico-pms",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "@tanstack/react-query": "^5.56.2",
    "axios": "^1.7.7",
    "zustand": "^4.5.5",
    "lucide-react": "^0.441.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.11",
    "typescript": "^5.5.3",
    "vite": "^5.4.3",
    "vitest": "^2.1.1",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 11: Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
```

- [ ] **Step 12: Create frontend config files**

`frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
})
```

`frontend/tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss'
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

`frontend/postcss.config.js`:
```javascript
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

`frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`frontend/index.html`:
```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Conico PMS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/src/test-setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

`frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 13: Install frontend dependencies**

```bash
cd frontend && npm install
```
Expected: `node_modules/` created, no errors.

- [ ] **Step 14: Commit**

```bash
git init && git add .
git commit -m "feat: project scaffolding — docker, fastapi stub, react+vite setup"
```

---

## Task 2: User model + migration

**Files:**
- Create: `backend/app/models/user.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/tests/test_models.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_models.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models.user import User

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)

def test_create_user(db):
    user = User(email="test@example.com", name="Test", hashed_password="x", role="vendedor")
    db.add(user)
    db.commit()
    db.refresh(user)
    assert user.id is not None
    assert user.is_active is True
    assert user.role == "vendedor"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_models.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.user'`

- [ ] **Step 3: Create `backend/app/models/user.py`**

```python
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50))  # admin | subadmin | vendedor
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 4: Update `backend/app/models/__init__.py`**

```python
from app.models.user import User
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && pytest tests/test_models.py::test_create_user -v
```
Expected: PASS

- [ ] **Step 6: Generate and run migration**

```bash
cd backend && alembic revision --autogenerate -m "create users table"
alembic upgrade head
```
Expected: migration file in `migrations/versions/`, no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/ backend/migrations/ backend/tests/test_models.py
git commit -m "feat: user model and initial migration"
```

---

## Task 3: Permission model + logic

**Files:**
- Create: `backend/app/models/permission.py`
- Create: `backend/app/core/permissions.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/tests/test_permissions.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_permissions.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models.user import User
from app.models.permission import PermissionOverride
from app.core.permissions import has_permission

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)

@pytest.fixture
def vendedor(db):
    user = User(email="v@test.com", name="Vendedor", hashed_password="x", role="vendedor")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def test_vendedor_can_view_catalogo(db, vendedor):
    assert has_permission(db, vendedor, "catalogo", "view") is True

def test_vendedor_cannot_edit_catalogo(db, vendedor):
    assert has_permission(db, vendedor, "catalogo", "edit") is False

def test_vendedor_cannot_view_rrhh(db, vendedor):
    assert has_permission(db, vendedor, "rrhh", "view") is False

def test_override_grants_access(db, vendedor):
    db.add(PermissionOverride(user_id=vendedor.id, module="inventario", action="view", allowed=True))
    db.commit()
    assert has_permission(db, vendedor, "inventario", "view") is True

def test_override_revokes_access(db, vendedor):
    db.add(PermissionOverride(user_id=vendedor.id, module="catalogo", action="view", allowed=False))
    db.commit()
    assert has_permission(db, vendedor, "catalogo", "view") is False

def test_admin_has_all_permissions(db):
    admin = User(email="a@test.com", name="Admin", hashed_password="x", role="admin")
    db.add(admin)
    db.commit()
    db.refresh(admin)
    assert has_permission(db, admin, "rrhh", "delete") is True
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && pytest tests/test_permissions.py -v
```
Expected: FAIL with import errors

- [ ] **Step 3: Create `backend/app/models/permission.py`**

```python
from sqlalchemy import String, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class PermissionOverride(Base):
    __tablename__ = "permission_overrides"
    __table_args__ = (UniqueConstraint("user_id", "module", "action"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    module: Mapped[str] = mapped_column(String(50))
    action: Mapped[str] = mapped_column(String(20))  # view | create | edit | delete
    allowed: Mapped[bool] = mapped_column(Boolean)
```

- [ ] **Step 4: Create `backend/app/core/permissions.py`**

```python
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.permission import PermissionOverride

MODULES = [
    "catalogo", "clientes", "proveedores", "cotizaciones", "nota_venta",
    "facturas", "ordenes_compra", "inventario", "rrhh", "dashboard", "usuarios",
]
ACTIONS = ["view", "create", "edit", "delete"]

_DEFAULT: dict[str, dict[str, dict[str, bool]]] = {
    "admin": {m: {a: True for a in ACTIONS} for m in MODULES},
    "subadmin": {
        "catalogo":       {"view": True,  "create": True,  "edit": True,  "delete": True},
        "clientes":       {"view": True,  "create": True,  "edit": True,  "delete": True},
        "proveedores":    {"view": True,  "create": True,  "edit": True,  "delete": True},
        "cotizaciones":   {"view": True,  "create": True,  "edit": True,  "delete": True},
        "nota_venta":     {"view": True,  "create": True,  "edit": True,  "delete": True},
        "facturas":       {"view": True,  "create": True,  "edit": True,  "delete": True},
        "ordenes_compra": {"view": True,  "create": True,  "edit": True,  "delete": True},
        "inventario":     {"view": True,  "create": True,  "edit": True,  "delete": True},
        "dashboard":      {"view": True,  "create": False, "edit": False, "delete": False},
        "rrhh":           {"view": False, "create": False, "edit": False, "delete": False},
        "usuarios":       {"view": False, "create": False, "edit": False, "delete": False},
    },
    "vendedor": {
        "catalogo":       {"view": True,  "create": False, "edit": False, "delete": False},
        "clientes":       {"view": True,  "create": True,  "edit": True,  "delete": False},
        "proveedores":    {"view": False, "create": False, "edit": False, "delete": False},
        "cotizaciones":   {"view": True,  "create": True,  "edit": True,  "delete": False},
        "nota_venta":     {"view": True,  "create": False, "edit": False, "delete": False},
        "facturas":       {"view": True,  "create": False, "edit": False, "delete": False},
        "ordenes_compra": {"view": False, "create": False, "edit": False, "delete": False},
        "inventario":     {"view": False, "create": False, "edit": False, "delete": False},
        "dashboard":      {"view": True,  "create": False, "edit": False, "delete": False},
        "rrhh":           {"view": False, "create": False, "edit": False, "delete": False},
        "usuarios":       {"view": False, "create": False, "edit": False, "delete": False},
    },
}

def has_permission(db: Session, user: User, module: str, action: str) -> bool:
    if user.role == "admin":
        return True
    override = db.query(PermissionOverride).filter_by(
        user_id=user.id, module=module, action=action
    ).first()
    if override is not None:
        return override.allowed
    return _DEFAULT.get(user.role, {}).get(module, {}).get(action, False)

def get_user_permissions(db: Session, user: User) -> dict[str, dict[str, bool]]:
    overrides = {
        (o.module, o.action): o.allowed
        for o in db.query(PermissionOverride).filter_by(user_id=user.id).all()
    }
    result: dict[str, dict[str, bool]] = {}
    for module in MODULES:
        result[module] = {}
        for action in ACTIONS:
            key = (module, action)
            if key in overrides:
                result[module][action] = overrides[key]
            elif user.role == "admin":
                result[module][action] = True
            else:
                result[module][action] = _DEFAULT.get(user.role, {}).get(module, {}).get(action, False)
    return result
```

- [ ] **Step 5: Update `backend/app/models/__init__.py`**

```python
from app.models.user import User
from app.models.permission import PermissionOverride
```

- [ ] **Step 6: Run tests**

```bash
cd backend && pytest tests/test_permissions.py -v
```
Expected: all 6 tests PASS

- [ ] **Step 7: Generate migration**

```bash
cd backend && alembic revision --autogenerate -m "create permission_overrides table"
alembic upgrade head
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/permission.py backend/app/core/permissions.py backend/app/models/__init__.py backend/migrations/ backend/tests/test_permissions.py
git commit -m "feat: permission model and role-based access logic"
```

---

## Task 4: Auth endpoints

**Files:**
- Create: `backend/app/core/security.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/api/auth.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write test fixtures**

```python
# backend/tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app.models.user import User
from app.core.security import get_password_hash

engine = create_engine("sqlite:///./test.db", connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def admin_user():
    db = TestingSession()
    user = User(
        email="admin@conico.cl",
        name="Admin",
        hashed_password=get_password_hash("secret123"),
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user

@pytest.fixture
def admin_token(client, admin_user):
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    return resp.json()["access_token"]
```

- [ ] **Step 2: Write failing auth tests**

```python
# backend/tests/test_auth.py
def test_login_success(client, admin_user):
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"

def test_login_wrong_password(client, admin_user):
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "wrong"})
    assert resp.status_code == 401

def test_login_unknown_user(client):
    resp = client.post("/api/auth/login", data={"username": "nobody@conico.cl", "password": "x"})
    assert resp.status_code == 401

def test_get_me(client, admin_token):
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "admin@conico.cl"
    assert resp.json()["role"] == "admin"

def test_get_me_no_token(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401

def test_refresh_token(client, admin_user):
    login = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    refresh_token = login.json()["refresh_token"]
    resp = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
```

- [ ] **Step 3: Run to verify failure**

```bash
cd backend && pytest tests/test_auth.py -v
```
Expected: FAIL (route not found)

- [ ] **Step 4: Create `backend/app/core/security.py`**

```python
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({**data, "exp": expire, "type": "access"}, settings.secret_key, algorithm="HS256")

def create_refresh_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    return jwt.encode({**data, "exp": expire, "type": "refresh"}, settings.secret_key, algorithm="HS256")

def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except JWTError:
        return None
```

- [ ] **Step 5: Create `backend/app/schemas/auth.py`**

```python
from pydantic import BaseModel

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RefreshRequest(BaseModel):
    refresh_token: str
```

- [ ] **Step 6: Create `backend/app/schemas/user.py`**

```python
from datetime import datetime
from pydantic import BaseModel, EmailStr

class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str  # admin | subadmin | vendedor

class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None
```

- [ ] **Step 7: Create `backend/app/api/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.auth import Token, RefreshRequest
from app.schemas.user import UserOut
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter_by(email=payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return Token(
        access_token=create_access_token({"sub": user.email}),
        refresh_token=create_refresh_token({"sub": user.email}),
    )

@router.post("/refresh", response_model=Token)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user = db.query(User).filter_by(email=payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return Token(
        access_token=create_access_token({"sub": user.email}),
        refresh_token=create_refresh_token({"sub": user.email}),
    )

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
```

- [ ] **Step 8: Create stub `backend/app/api/users.py`** (needed for main.py import)

```python
from fastapi import APIRouter
router = APIRouter()
```

- [ ] **Step 9: Update `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, users

app = FastAPI(title="Conico PMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
```

- [ ] **Step 10: Run tests**

```bash
cd backend && pytest tests/test_auth.py -v
```
Expected: all 6 tests PASS

- [ ] **Step 11: Commit**

```bash
git add backend/app/core/security.py backend/app/schemas/ backend/app/api/ backend/app/main.py backend/tests/
git commit -m "feat: JWT auth endpoints (login, refresh, me)"
```

---

## Task 5: Users CRUD + permission management endpoints

**Files:**
- Modify: `backend/app/api/users.py`
- Create: `backend/tests/test_users.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_users.py
def test_list_users_authenticated(client, admin_token):
    resp = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

def test_list_users_unauthenticated(client):
    resp = client.get("/api/users")
    assert resp.status_code == 401

def test_create_user(client, admin_token):
    resp = client.post("/api/users", json={
        "email": "new@conico.cl", "name": "New", "password": "pass123", "role": "vendedor"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 201
    assert resp.json()["email"] == "new@conico.cl"
    assert resp.json()["role"] == "vendedor"

def test_create_duplicate_user(client, admin_token, admin_user):
    resp = client.post("/api/users", json={
        "email": "admin@conico.cl", "name": "Dup", "password": "x", "role": "vendedor"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 409

def test_update_user(client, admin_token, admin_user):
    resp = client.patch(f"/api/users/{admin_user.id}", json={"name": "Updated"},
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"

def test_get_permissions(client, admin_token, admin_user):
    resp = client.get(f"/api/users/{admin_user.id}/permissions",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "catalogo" in data
    assert set(data["catalogo"].keys()) == {"view", "create", "edit", "delete"}

def test_set_permissions(client, admin_token):
    uid = client.post("/api/users", json={
        "email": "v@conico.cl", "name": "V", "password": "x", "role": "vendedor"
    }, headers={"Authorization": f"Bearer {admin_token}"}).json()["id"]
    resp = client.put(f"/api/users/{uid}/permissions",
                      json={"inventario": {"view": True, "create": False, "edit": False, "delete": False}},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["inventario"]["view"] is True
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && pytest tests/test_users.py -v
```
Expected: FAIL (empty router)

- [ ] **Step 3: Replace `backend/app/api/users.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.permission import PermissionOverride
from app.schemas.user import UserOut, UserCreate, UserUpdate
from app.core.security import get_password_hash
from app.core.permissions import get_user_permissions, MODULES, ACTIONS
from app.api.auth import get_current_user

router = APIRouter()

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user

@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(User).all()

@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(User).filter_by(email=body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=body.email, name=body.name,
        hashed_password=get_password_hash(body.password), role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.hashed_password = get_password_hash(body.password)
    db.commit()
    db.refresh(user)
    return user

@router.get("/{user_id}/permissions")
def get_permissions(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return get_user_permissions(db, user)

@router.put("/{user_id}/permissions")
def set_permissions(
    user_id: int,
    body: dict[str, dict[str, bool]],
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for module, actions in body.items():
        if module not in MODULES:
            continue
        for action, allowed in actions.items():
            if action not in ACTIONS:
                continue
            override = db.query(PermissionOverride).filter_by(
                user_id=user_id, module=module, action=action
            ).first()
            if override:
                override.allowed = allowed
            else:
                db.add(PermissionOverride(user_id=user_id, module=module, action=action, allowed=allowed))
    db.commit()
    return get_user_permissions(db, user)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_users.py -v
```
Expected: all 7 tests PASS

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend && pytest -v
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/users.py backend/tests/test_users.py
git commit -m "feat: users CRUD and configurable permission overrides endpoints"
```

---

## Task 6: Admin seed script

**Files:**
- Create: `backend/scripts/seed_admin.py`

- [ ] **Step 1: Create `backend/scripts/seed_admin.py`**

```python
"""Creates the first admin user. Run once after initial deploy."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash

def seed():
    db = SessionLocal()
    if db.query(User).filter_by(role="admin").first():
        print("Admin already exists — skipping.")
        db.close()
        return
    user = User(
        email="admin@conico.cl",
        name="Administrador",
        hashed_password=get_password_hash("changeme123"),
        role="admin",
    )
    db.add(user)
    db.commit()
    print(f"Created: {user.email} / changeme123 — CHANGE PASSWORD IMMEDIATELY")
    db.close()

if __name__ == "__main__":
    seed()
```

- [ ] **Step 2: Verify it runs**

```bash
cd backend && python scripts/seed_admin.py
```
Expected: `Created: admin@conico.cl / changeme123 — CHANGE PASSWORD IMMEDIATELY`

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/seed_admin.py
git commit -m "feat: seed script for initial admin user"
```

---

## Task 7: Frontend types, auth store, API client

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/stores/auth.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/stores/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './auth'

const fakeUser = { id: 1, email: 'a@b.cl', name: 'A', role: 'admin' as const, is_active: true, created_at: '' }

describe('auth store', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
    localStorage.clear()
  })

  it('starts unauthenticated', () => {
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('setAuth stores user and tokens', () => {
    useAuthStore.getState().setAuth(fakeUser, 'access123', 'refresh456')
    expect(useAuthStore.getState().accessToken).toBe('access123')
    expect(useAuthStore.getState().user?.email).toBe('a@b.cl')
  })

  it('logout clears all state', () => {
    useAuthStore.getState().setAuth(fakeUser, 'access123', 'refresh456')
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npm test -- auth.test
```
Expected: FAIL

- [ ] **Step 3: Create `frontend/src/types/index.ts`**

```typescript
export interface User {
  id: number
  email: string
  name: string
  role: 'admin' | 'subadmin' | 'vendedor'
  is_active: boolean
  created_at: string
}

export type Module =
  | 'catalogo' | 'clientes' | 'proveedores' | 'cotizaciones'
  | 'nota_venta' | 'facturas' | 'ordenes_compra' | 'inventario'
  | 'rrhh' | 'dashboard' | 'usuarios'

export type Action = 'view' | 'create' | 'edit' | 'delete'

export type Permissions = Record<Module, Record<Action, boolean>>
```

- [ ] **Step 4: Create `frontend/src/stores/auth.ts`**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  setAccessToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => set({ user, accessToken, refreshToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'conico-auth' }
  )
)
```

- [ ] **Step 5: Run test**

```bash
cd frontend && npm test -- auth.test
```
Expected: all 3 tests PASS

- [ ] **Step 6: Create `frontend/src/lib/api.ts`**

```typescript
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

export const api = axios.create({ baseURL: '' })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const { refreshToken, setAccessToken, logout } = useAuthStore.getState()
      if (!refreshToken) { logout(); return Promise.reject(error) }
      try {
        const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken })
        setAccessToken(res.data.access_token)
        original.headers.Authorization = `Bearer ${res.data.access_token}`
        return api(original)
      } catch {
        logout()
        return Promise.reject(error)
      }
    }
    return Promise.reject(error)
  }
)
```

- [ ] **Step 7: Create `frontend/src/hooks/useAuth.ts`**

```typescript
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import type { User } from '../types'

export function useAuth() {
  const { user, accessToken, setAuth, logout } = useAuthStore()

  async function login(email: string, password: string): Promise<void> {
    const form = new FormData()
    form.append('username', email)
    form.append('password', password)
    const tokenRes = await api.post<{ access_token: string; refresh_token: string }>('/api/auth/login', form)
    const meRes = await api.get<User>('/api/auth/me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    })
    setAuth(meRes.data, tokenRes.data.access_token, tokenRes.data.refresh_token)
  }

  return { user, isAuthenticated: !!accessToken, login, logout }
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/ frontend/src/stores/ frontend/src/lib/ frontend/src/hooks/
git commit -m "feat: auth store, API client with token refresh interceptor, useAuth hook"
```

---

## Task 8: Login page + router

**Files:**
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/router.tsx`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/pages/Login.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Login from './Login'
import * as authHook from '../hooks/useAuth'

vi.mock('../hooks/useAuth')

const mockUseAuth = (loginFn: ReturnType<typeof vi.fn>) =>
  vi.mocked(authHook.useAuth).mockReturnValue({
    user: null, isAuthenticated: false, login: loginFn, logout: vi.fn(),
  })

describe('Login page', () => {
  it('renders email and password fields', () => {
    mockUseAuth(vi.fn())
    render(<MemoryRouter><Login /></MemoryRouter>)
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/contraseña/i)).toBeInTheDocument()
  })

  it('calls login with credentials on submit', async () => {
    const mockLogin = vi.fn().mockResolvedValue(undefined)
    mockUseAuth(mockLogin)
    render(<MemoryRouter><Login /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.cl' } })
    fireEvent.change(screen.getByPlaceholderText(/contraseña/i), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('a@b.cl', 'pass'))
  })

  it('shows error message on failed login', async () => {
    const mockLogin = vi.fn().mockRejectedValue(new Error('Invalid'))
    mockUseAuth(mockLogin)
    render(<MemoryRouter><Login /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.cl' } })
    fireEvent.change(screen.getByPlaceholderText(/contraseña/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }))
    await waitFor(() => expect(screen.getByText(/credenciales incorrectas/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npm test -- Login.test
```
Expected: FAIL

- [ ] **Step 3: Create `frontend/src/pages/Login.tsx`**

```typescript
import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('Credenciales incorrectas. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Conico PMS</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Ingresa a tu cuenta</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium
                       rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `frontend/src/router.tsx`**

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import { useAuthStore } from './stores/auth'
import AppLayout from './components/layout/AppLayout'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth><AppLayout /></RequireAuth>,
    children: [
      { index: true, element: <div className="p-6 text-gray-700 dark:text-gray-300">Dashboard — próximamente</div> },
    ],
  },
])
```

- [ ] **Step 5: Create `frontend/src/App.tsx`**

```typescript
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { ThemeProvider } from './components/layout/ThemeProvider'

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
```

- [ ] **Step 6: Create `frontend/src/main.tsx`**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
```

- [ ] **Step 7: Run tests**

```bash
cd frontend && npm test -- Login.test
```
Expected: all 3 tests PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Login.tsx frontend/src/router.tsx frontend/src/App.tsx frontend/src/main.tsx
git commit -m "feat: login page, router with auth guard"
```

---

## Task 9: App layout — ThemeProvider + collapsible Sidebar

**Files:**
- Create: `frontend/src/components/layout/ThemeProvider.tsx`
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/components/layout/Sidebar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Sidebar from './Sidebar'
import { ThemeProvider } from './ThemeProvider'

const mockUser = { id: 1, email: 'a@b.cl', name: 'Admin', role: 'admin' as const, is_active: true, created_at: '' }

vi.mock('../../stores/auth', () => ({
  useAuthStore: (fn?: (s: any) => any) =>
    fn ? fn({ user: mockUser, logout: vi.fn() }) : { user: mockUser, logout: vi.fn() },
}))

function wrap(ui: React.ReactNode) {
  return <ThemeProvider><MemoryRouter>{ui}</MemoryRouter></ThemeProvider>
}

describe('Sidebar', () => {
  it('shows nav item labels when expanded', () => {
    render(wrap(<Sidebar collapsed={false} onToggle={vi.fn()} />))
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Cotizaciones')).toBeInTheDocument()
  })

  it('hides labels when collapsed', () => {
    render(wrap(<Sidebar collapsed={true} onToggle={vi.fn()} />))
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('calls onToggle on collapse button click', () => {
    const onToggle = vi.fn()
    render(wrap(<Sidebar collapsed={false} onToggle={onToggle} />))
    fireEvent.click(screen.getByLabelText('toggle-sidebar'))
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npm test -- Sidebar.test
```
Expected: FAIL

- [ ] **Step 3: Create `frontend/src/components/layout/ThemeProvider.tsx`**

```typescript
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
```

- [ ] **Step 4: Create `frontend/src/components/layout/Sidebar.tsx`**

```typescript
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users, Package, ShoppingCart,
  Warehouse, Receipt, Truck, UserCog, ChevronLeft, ChevronRight, LogOut, Sun, Moon
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useTheme } from './ThemeProvider'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const NAV = [
  { to: '/',              icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/cotizaciones',  icon: FileText,        label: 'Cotizaciones' },
  { to: '/clientes',      icon: Users,           label: 'Clientes' },
  { to: '/catalogo',      icon: Package,         label: 'Catálogo' },
  { to: '/notas-venta',   icon: ShoppingCart,    label: 'Notas de Venta' },
  { to: '/facturas',      icon: Receipt,         label: 'Facturas' },
  { to: '/inventario',    icon: Warehouse,       label: 'Inventario' },
  { to: '/ordenes-compra',icon: ShoppingCart,    label: 'Órdenes de Compra' },
  { to: '/proveedores',   icon: Truck,           label: 'Proveedores' },
  { to: '/rrhh',          icon: UserCog,         label: 'RRHH' },
  { to: '/usuarios',      icon: Users,           label: 'Usuarios' },
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const logout = useAuthStore(s => s.logout)
  const user = useAuthStore(s => s.user)
  const { theme, toggle: toggleTheme } = useTheme()

  return (
    <aside className={`flex flex-col bg-gray-900 text-gray-300 transition-all duration-200 flex-shrink-0 ${collapsed ? 'w-14' : 'w-56'}`}>
      <div className="flex items-center justify-between px-3 py-4 border-b border-gray-700">
        {!collapsed && <span className="font-bold text-white text-sm truncate">Conico PMS</span>}
        <button
          aria-label="toggle-sidebar"
          onClick={onToggle}
          className="p-1 rounded hover:bg-gray-700 transition-colors ml-auto flex-shrink-0"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 mx-1 rounded-lg text-sm transition-colors
               ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 hover:text-white'}`
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-gray-700 p-2 space-y-1">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm hover:bg-gray-800 hover:text-white transition-colors"
          title={collapsed ? (theme === 'dark' ? 'Modo claro' : 'Modo oscuro') : undefined}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>}
        </button>
        {!collapsed && user && (
          <div className="px-3 py-1 text-xs text-gray-500 truncate">{user.name}</div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm hover:bg-red-900 hover:text-red-300 transition-colors"
          title={collapsed ? 'Salir' : undefined}
        >
          <LogOut size={18} />
          {!collapsed && <span>Salir</span>}
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 5: Create `frontend/src/components/layout/AppLayout.tsx`**

```typescript
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 6: Run tests**

```bash
cd frontend && npm test -- Sidebar.test
```
Expected: all 3 tests PASS

- [ ] **Step 7: Run full frontend test suite**

```bash
cd frontend && npm test
```
Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: collapsible sidebar, dark/light theme provider, app layout"
```

---

## Task 10: Users management page with permission editor

**Files:**
- Create: `frontend/src/pages/Users.tsx`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/pages/Users.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import Users from './Users'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }))
vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: any) => fn ? fn({ user: { role: 'admin' } }) : { user: { role: 'admin' } },
}))

function wrap(ui: React.ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Routes><Route path="/" element={ui} /></Routes></MemoryRouter>
    </QueryClientProvider>
  )
}

it('renders list of users', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({
    data: [{ id: 1, email: 'a@b.cl', name: 'Admin', role: 'admin', is_active: true, created_at: '' }],
  })
  render(wrap(<Users />))
  await waitFor(() => expect(screen.getByText('a@b.cl')).toBeInTheDocument())
  expect(screen.getByText('Admin')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npm test -- Users.test
```
Expected: FAIL

- [ ] **Step 3: Create `frontend/src/pages/Users.tsx`**

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { User, Permissions, Module, Action } from '../types'

const MODULES: Module[] = [
  'catalogo','clientes','proveedores','cotizaciones','nota_venta',
  'facturas','ordenes_compra','inventario','rrhh','dashboard','usuarios',
]
const ACTIONS: Action[] = ['view','create','edit','delete']

const MODULE_LABELS: Record<Module, string> = {
  catalogo: 'Catálogo', clientes: 'Clientes', proveedores: 'Proveedores',
  cotizaciones: 'Cotizaciones', nota_venta: 'Nota de Venta', facturas: 'Facturas',
  ordenes_compra: 'Órdenes de Compra', inventario: 'Inventario',
  rrhh: 'RRHH', dashboard: 'Dashboard', usuarios: 'Usuarios',
}

export default function Users() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users').then(r => r.data),
  })
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<Permissions | null>(null)

  const savePermissions = useMutation({
    mutationFn: (payload: Permissions) =>
      api.put(`/api/users/${selectedUser!.id}/permissions`, payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setSelectedUser(null)
      setPermissions(null)
    },
  })

  async function openPermissions(user: User) {
    setSelectedUser(user)
    const res = await api.get<Permissions>(`/api/users/${user.id}/permissions`)
    setPermissions(res.data)
  }

  function toggle(module: Module, action: Action) {
    if (!permissions) return
    setPermissions({ ...permissions, [module]: { ...permissions[module], [action]: !permissions[module][action] } })
  }

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Usuarios</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              {['Nombre','Email','Rol','Estado',''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{u.name}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block w-2 h-2 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                </td>
                <td className="px-4 py-3">
                  {u.role !== 'admin' && (
                    <button onClick={() => openPermissions(u)} className="text-xs text-blue-600 hover:underline">
                      Permisos
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && permissions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Permisos: {selectedUser.name}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Rol base: {selectedUser.role}</p>
            </div>
            <div className="overflow-auto flex-1 px-6 py-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 dark:text-gray-400">
                    <th className="text-left py-2 pr-6 font-medium">Módulo</th>
                    {ACTIONS.map(a => (
                      <th key={a} className="text-center py-2 px-3 font-medium capitalize">{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {MODULES.map(module => (
                    <tr key={module} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="py-2 pr-6 text-gray-700 dark:text-gray-300 font-medium">
                        {MODULE_LABELS[module]}
                      </td>
                      {ACTIONS.map(action => (
                        <td key={action} className="text-center py-2 px-3">
                          <input
                            type="checkbox"
                            checked={permissions[module]?.[action] ?? false}
                            onChange={() => toggle(module, action)}
                            className="w-4 h-4 cursor-pointer accent-blue-600"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
              <button
                onClick={() => { setSelectedUser(null); setPermissions(null) }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => savePermissions.mutate(permissions)}
                disabled={savePermissions.isPending}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {savePermissions.isPending ? 'Guardando...' : 'Guardar permisos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add `usuarios` route to `frontend/src/router.tsx`**

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Users from './pages/Users'
import { useAuthStore } from './stores/auth'
import AppLayout from './components/layout/AppLayout'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth><AppLayout /></RequireAuth>,
    children: [
      { index: true, element: <div className="p-6 text-gray-700 dark:text-gray-300">Dashboard — próximamente</div> },
      { path: 'usuarios', element: <Users /> },
    ],
  },
])
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm test -- Users.test
```
Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
cd frontend && npm test
```
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Users.tsx frontend/src/router.tsx
git commit -m "feat: users management page with permission toggle modal"
```

---

## Task 11: Production Docker + Nginx

**Files:**
- Create: `nginx/nginx.conf`
- Create: `docker-compose.prod.yml`
- Create: `frontend/Dockerfile.prod`
- Create: `frontend/.env.production`

- [ ] **Step 1: Create `nginx/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Create `frontend/Dockerfile.prod`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 3: Create `frontend/.env.production`**

```
VITE_API_URL=
```
(empty — nginx handles /api/ proxying in production)

- [ ] **Step 4: Create `docker-compose.prod.yml`**

```yaml
version: "3.9"
services:
  db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-conico}
      POSTGRES_USER: ${POSTGRES_USER:-conico}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    restart: unless-stopped
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
    env_file: .env
    depends_on:
      - db

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    restart: unless-stopped
    volumes:
      - frontend_build:/usr/share/nginx/html

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
      - frontend_build:/usr/share/nginx/html
    depends_on:
      - backend
      - frontend

volumes:
  pgdata:
  frontend_build:
```

- [ ] **Step 5: Test production build locally**

```bash
docker compose -f docker-compose.prod.yml build
```
Expected: all images build without errors

- [ ] **Step 6: Commit**

```bash
git add nginx/ docker-compose.prod.yml frontend/Dockerfile.prod frontend/.env.production
git commit -m "feat: production docker setup with nginx reverse proxy"
```

---

## Task 12: End-to-end smoke test

- [ ] **Step 1: Start full dev stack**

```bash
docker compose up --build -d
```
Expected: all 3 containers running (db, backend, frontend)

- [ ] **Step 2: Run migrations + seed**

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed_admin.py
```
Expected: migration applied, admin user created

- [ ] **Step 3: Verify backend health**

```bash
curl http://localhost:8000/docs
```
Expected: FastAPI swagger UI loads (HTTP 200)

- [ ] **Step 4: Test login flow**

```bash
curl -s -X POST http://localhost:8000/api/auth/login \
  -F "username=admin@conico.cl" -F "password=changeme123" | python -m json.tool
```
Expected: JSON with `access_token`, `refresh_token`, `token_type`

- [ ] **Step 5: Open frontend**

Open `http://localhost:5173` in browser.
Expected: Login page renders with dark/light mode following OS preference.

- [ ] **Step 6: Login and navigate**

Login with `admin@conico.cl` / `changeme123`.
Expected: redirected to dashboard placeholder. Sidebar visible and collapsible. Navigate to `/usuarios` — user list shows admin. Click "Permisos" button not visible for admin (correct).

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "chore: fase 1 complete — auth, users, permissions, base UI"
```

---

## Next phases

| Plan | Módulos |
|---|---|
| `2026-04-17-fase-2-datos-maestros.md` | Catálogo, Clientes, Proveedores — tablas con CRUD completo |
| `2026-04-17-fase-3-flujo-ventas.md` | Cotizaciones → Nota de Venta → Factura, PDF, email |
| `2026-04-17-fase-4-operaciones.md` | Inventario, Órdenes de Compra |
| `2026-04-17-fase-5-rrhh-dashboard.md` | RRHH, métricas y reportes exportables |
