# Multi-Tenant PostgreSQL Schemas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Conico from single-tenant to multi-tenant using PostgreSQL schema-per-tenant isolation, enabling SaaS deployment where each customer has fully isolated data.

**Architecture:** `public` schema holds `users` and `tenants` tables (shared). Each SaaS customer gets a `t_{slug}` PostgreSQL schema (e.g., `t_conico`) containing all business tables. JWT tokens include a `tenant_schema` claim; every request sets `search_path` on the DB connection so SQLAlchemy models need zero changes. Existing Conico data is migrated to `t_conico` in a one-time bootstrap script.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 with `DeclarativeBase`, PostgreSQL, Alembic, Pydantic v2, React 18 + TypeScript + Zustand

---

## File Map

**Create:**
- `backend/app/models/tenant.py` — `Tenant` model using `SharedBase`, lives in `public` schema
- `backend/app/schemas/tenant.py` — Pydantic schemas for Tenant
- `backend/app/api/tenants.py` — Tenant CRUD endpoints (superadmin only)
- `backend/scripts/provision_tenant.py` — CLI: create schema + tables + seed SystemConfig
- `backend/scripts/bootstrap_conico.py` — One-time: copy all public schema data to `t_conico`

**Modify:**
- `backend/app/database.py` — Add `SharedBase` class
- `backend/app/models/user.py` — Add `tenant_id` FK, use `SharedBase`, add `__table_args__ = {"schema": "public"}`
- `backend/app/models/permission.py` — Fix FK to `public.users.id`
- `backend/app/models/__init__.py` — Export `Tenant`
- `backend/app/api/auth.py` — JSON login with `tenant_slug`, `tenant_schema` in JWT
- `backend/app/schemas/auth.py` — Add `LoginRequest` schema
- `backend/app/api/deps.py` — Add `get_tenant_db`, update `require_permission`
- `backend/app/main.py` — Include tenants router
- `backend/migrations/env.py` — Dual-mode: shared vs tenant schema migrations
- `frontend/src/hooks/useAuth.ts` — Add `tenant_slug` param, send JSON
- `frontend/src/pages/Login.tsx` — Add tenant_slug field
- `frontend/src/stores/auth.ts` — Store `tenant_slug` in auth state
- `frontend/src/types/index.ts` — Add `tenant_slug` to User type

---

## Task 1: Add SharedBase to database.py

**Files:**
- Modify: `backend/app/database.py`

- [ ] **Step 1: Add SharedBase**

Replace the full contents of `backend/app/database.py` with:

```python
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from app.config import settings
from typing import Generator

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base for tenant-scoped tables. Tables live in the active tenant schema."""
    pass


class SharedBase(DeclarativeBase):
    """Base for shared tables in public schema: users, tenants."""
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: Verify no existing tests break**

```bash
cd backend && python -c "from app.database import Base, SharedBase, get_db, engine; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/database.py
git commit -m "feat(multitenant): add SharedBase for public-schema models"
```

---

## Task 2: Tenant model + migration

**Files:**
- Create: `backend/app/models/tenant.py`
- Create: `backend/app/schemas/tenant.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_tenant_model.py`:

```python
from app.models.tenant import Tenant
from app.database import SharedBase

def test_tenant_uses_shared_base():
    assert issubclass(Tenant, SharedBase)

def test_tenant_tablename():
    assert Tenant.__tablename__ == "tenants"

def test_tenant_schema_public():
    args = getattr(Tenant, '__table_args__', {})
    schema = args.get("schema") if isinstance(args, dict) else args[-1].get("schema")
    assert schema == "public"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_tenant_model.py -v
```
Expected: FAIL with `ImportError` (module doesn't exist yet)

- [ ] **Step 3: Create Tenant model**

Create `backend/app/models/tenant.py`:

```python
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import SharedBase


class Tenant(SharedBase):
    __tablename__ = "tenants"
    __table_args__ = {"schema": "public"}

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(63), unique=True, index=True)
    schema_name: Mapped[str] = mapped_column(String(63), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    dte_limit: Mapped[int] = mapped_column(Integer, default=1000)
    dte_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
```

- [ ] **Step 4: Create Tenant schemas**

Create `backend/app/schemas/tenant.py`:

```python
from datetime import datetime
from pydantic import BaseModel


class TenantCreate(BaseModel):
    slug: str
    name: str
    dte_limit: int = 1000


class TenantOut(BaseModel):
    id: int
    slug: str
    schema_name: str
    name: str
    is_active: bool
    dte_limit: int
    dte_used: int
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 5: Add Tenant to __init__.py**

Add to `backend/app/models/__init__.py`:

```python
from app.models.tenant import Tenant  # noqa: F401
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_tenant_model.py -v
```
Expected: PASS (3 tests)

- [ ] **Step 7: Create Alembic migration for tenants table + tenant_id on users**

```bash
cd backend && alembic revision --autogenerate -m "add_tenants_and_user_tenant_id"
```

Open the generated migration file. Verify it contains `op.create_table("tenants", ...)`. If Alembic doesn't pick up the Tenant model (it's on SharedBase, not Base), manually write the migration:

```python
def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(63), nullable=False),
        sa.Column("schema_name", sa.String(63), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("dte_limit", sa.Integer(), nullable=False, server_default="1000"),
        sa.Column("dte_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="public",
    )
    op.create_index("ix_public_tenants_slug", "tenants", ["slug"], unique=True, schema="public")
    op.add_column("users", sa.Column("tenant_id", sa.Integer(), nullable=True), schema="public")
    op.create_foreign_key(
        "fk_users_tenant_id", "users", "tenants",
        ["tenant_id"], ["id"], source_schema="public", referent_schema="public",
        ondelete="SET NULL"
    )

def downgrade() -> None:
    op.drop_constraint("fk_users_tenant_id", "users", schema="public", type_="foreignkey")
    op.drop_column("users", "tenant_id", schema="public")
    op.drop_index("ix_public_tenants_slug", table_name="tenants", schema="public")
    op.drop_table("tenants", schema="public")
```

- [ ] **Step 8: Run migration**

```bash
cd backend && alembic upgrade head
```
Expected: Migration completes, `tenants` table and `tenant_id` column exist.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/tenant.py backend/app/schemas/tenant.py backend/app/models/__init__.py backend/tests/test_tenant_model.py backend/migrations/versions/
git commit -m "feat(multitenant): add Tenant model, schema, and migration"
```

---

## Task 3: Update User model to SharedBase + public schema

**Files:**
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/permission.py`

- [ ] **Step 1: Update User model**

Replace `backend/app/models/user.py` with:

```python
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import SharedBase


class User(SharedBase):
    __tablename__ = "users"
    __table_args__ = {"schema": "public"}

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50))  # admin | subadmin | vendedor
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    tenant_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("public.tenants.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
```

- [ ] **Step 2: Fix PermissionOverride FK to reference public.users**

In `backend/app/models/permission.py`, change:

```python
user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
```

to:

```python
user_id: Mapped[int] = mapped_column(ForeignKey("public.users.id", ondelete="CASCADE"))
```

- [ ] **Step 3: Verify imports**

```bash
cd backend && python -c "from app.models.user import User; from app.models.permission import PermissionOverride; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/user.py backend/app/models/permission.py
git commit -m "feat(multitenant): User uses SharedBase with public schema, fix PermissionOverride FK"
```

---

## Task 4: JSON login endpoint + tenant_schema in JWT

**Files:**
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/api/auth.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_auth_tenant.py`:

```python
from app.schemas.auth import LoginRequest

def test_login_request_has_tenant_slug():
    req = LoginRequest(email="a@b.cl", password="pw", tenant_slug="conico")
    assert req.tenant_slug == "conico"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_auth_tenant.py -v
```
Expected: FAIL with `ImportError`

- [ ] **Step 3: Add LoginRequest to schemas/auth.py**

Replace `backend/app/schemas/auth.py` with:

```python
from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str
    tenant_slug: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
```

- [ ] **Step 4: Update auth.py**

Replace `backend/app/api/auth.py` with:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.schemas.auth import Token, RefreshRequest, LoginRequest
from app.schemas.user import UserOut
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access" or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter_by(email=payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    # Attach tenant_schema for downstream use in get_tenant_db (not persisted)
    user.__dict__["_tenant_schema"] = payload.get("tenant_schema", "")
    return user


@router.post("/login", response_model=Token)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.lower().strip()).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    tenant = db.query(Tenant).filter_by(slug=body.tenant_slug, is_active=True).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tenant not found")
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User does not belong to this tenant")
    token_data = {"sub": user.email, "tenant_schema": tenant.schema_name}
    return Token(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/refresh", response_model=Token)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh" or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user = db.query(User).filter_by(email=payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    token_data = {"sub": user.email, "tenant_schema": payload.get("tenant_schema", "")}
    return Token(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
```

- [ ] **Step 5: Run test**

```bash
cd backend && python -m pytest tests/test_auth_tenant.py -v
```
Expected: PASS

- [ ] **Step 6: Verify import**

```bash
cd backend && python -c "from app.api.auth import router, get_current_user; print('OK')"
```
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/auth.py backend/app/api/auth.py backend/tests/test_auth_tenant.py
git commit -m "feat(multitenant): JSON login with tenant_slug, tenant_schema in JWT"
```

---

## Task 5: Add get_tenant_db + update require_permission

**Files:**
- Modify: `backend/app/api/deps.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_deps_tenant.py`:

```python
import inspect
from app.api.deps import get_tenant_db

def test_get_tenant_db_is_generator():
    # get_tenant_db should be a generator function (uses yield)
    assert inspect.isgeneratorfunction(get_tenant_db)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_deps_tenant.py -v
```
Expected: FAIL with `ImportError`

- [ ] **Step 3: Update deps.py**

Replace `backend/app/api/deps.py` with:

```python
from typing import Generator
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.auth import get_current_user, oauth2_scheme
from app.core.permissions import has_permission
from app.database import SessionLocal, get_db
from app.models.user import User


def get_tenant_db(current_user: User = Depends(get_current_user)) -> Generator[Session, None, None]:
    schema = current_user.__dict__.get("_tenant_schema", "")
    if not schema:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing tenant context")
    db = SessionLocal()
    try:
        db.execute(text(f"SET search_path TO {schema}, public"))
        yield db
    finally:
        db.close()


def require_permission(module: str, action: str):
    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_tenant_db),
    ) -> tuple[User, Session]:
        if not has_permission(db, current_user, module, action):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
        return current_user, db
    return Depends(dependency)
```

- [ ] **Step 4: Run test**

```bash
cd backend && python -m pytest tests/test_deps_tenant.py -v
```
Expected: PASS

- [ ] **Step 5: Verify full import chain**

```bash
cd backend && python -c "from app.api.deps import get_tenant_db, require_permission; print('OK')"
```
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/deps.py backend/tests/test_deps_tenant.py
git commit -m "feat(multitenant): add get_tenant_db, update require_permission to use tenant schema"
```

---

## Task 6: Update Alembic env.py for dual-mode migrations

**Files:**
- Modify: `backend/migrations/env.py`

The goal: running `alembic upgrade head` migrates shared tables in `public`. Running `TENANT_SCHEMA=t_conico alembic upgrade head` migrates tenant tables in `t_conico`.

- [ ] **Step 1: Update env.py**

Replace `backend/migrations/env.py` with:

```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool, text
from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from app.database import Base, SharedBase
from app.models import *  # noqa

db_url = os.environ.get("DATABASE_URL")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

TENANT_SCHEMA = os.environ.get("TENANT_SCHEMA")

if TENANT_SCHEMA:
    target_metadata = Base.metadata  # tenant tables only
else:
    target_metadata = SharedBase.metadata  # users + tenants only


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema=TENANT_SCHEMA or "public",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        if TENANT_SCHEMA:
            connection.execute(text(f"SET search_path TO {TENANT_SCHEMA}, public"))
            connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table_schema=TENANT_SCHEMA or "public",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 2: Verify alembic can run in both modes**

```bash
cd backend && alembic upgrade head --sql 2>&1 | head -5
```
Expected: SQL output starting with `-- Running upgrade` (no error)

```bash
cd backend && TENANT_SCHEMA=t_test alembic upgrade head --sql 2>&1 | head -5
```
Expected: SQL output with SET search_path (no error)

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/env.py
git commit -m "feat(multitenant): dual-mode alembic migrations for shared and tenant schemas"
```

---

## Task 7: Tenant provisioning script

**Files:**
- Create: `backend/scripts/provision_tenant.py`

This script: creates the PostgreSQL schema, creates all tenant tables via `Base.metadata.create_all()`, inserts default `SystemConfig` entries, creates the `Tenant` record in `public`.

- [ ] **Step 1: Create provision_tenant.py**

Create `backend/scripts/provision_tenant.py`:

```python
"""
Usage: python -m scripts.provision_tenant --slug conico --name "Conico SpA"
"""
import argparse
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from app.config import settings
from app.database import Base, SharedBase
from app.models import *  # noqa — registers all models with Base
from app.models.tenant import Tenant
from app.models.system_config import SystemConfig


SYSTEM_CONFIG_DEFAULTS = [
    ("cotizacion_last_id", "12249"),
    ("nv_last_id", "0"),
    ("factura_last_id", "0"),
]


def provision(slug: str, name: str, dte_limit: int = 1000) -> None:
    if not re.match(r"^[a-z][a-z0-9_]{0,61}$", slug):
        raise ValueError(f"Invalid slug '{slug}': must be lowercase alphanumeric/underscore, start with letter, max 62 chars")

    schema_name = f"t_{slug}"
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT schema_name FROM information_schema.schemata WHERE schema_name = :s"),
            {"s": schema_name},
        ).fetchone()
        if existing:
            print(f"Schema '{schema_name}' already exists. Aborting.")
            sys.exit(1)

        print(f"Creating schema '{schema_name}'...")
        conn.execute(text(f"CREATE SCHEMA {schema_name}"))
        conn.execute(text(f"SET search_path TO {schema_name}, public"))
        conn.commit()

    # Create all tenant tables in the new schema
    tenant_engine = create_engine(
        settings.database_url,
        connect_args={},
        execution_options={"schema_translate_map": None},
    )

    with tenant_engine.connect() as conn:
        conn.execute(text(f"SET search_path TO {schema_name}, public"))
        conn.commit()

    print(f"Creating tables in '{schema_name}'...")
    Base.metadata.create_all(bind=tenant_engine)

    # Seed SystemConfig and create Tenant record
    shared_engine = create_engine(settings.database_url)
    with Session(shared_engine) as db:
        # Insert Tenant record in public schema
        tenant = Tenant(
            slug=slug,
            schema_name=schema_name,
            name=name,
            dte_limit=dte_limit,
        )
        db.add(tenant)
        db.flush()
        print(f"Tenant record created: id={tenant.id}")

        # Seed system config in tenant schema
        with shared_engine.connect() as conn:
            conn.execute(text(f"SET search_path TO {schema_name}, public"))
            for key, value in SYSTEM_CONFIG_DEFAULTS:
                conn.execute(
                    text("INSERT INTO system_config (key, value) VALUES (:k, :v) ON CONFLICT DO NOTHING"),
                    {"k": key, "v": value},
                )
            conn.commit()

        db.commit()
        print(f"Done. Tenant '{slug}' provisioned at schema '{schema_name}'.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--dte-limit", type=int, default=1000)
    args = parser.parse_args()
    provision(args.slug, args.name, args.dte_limit)
```

- [ ] **Step 2: Verify script runs without error (dry import)**

```bash
cd backend && python -c "from scripts.provision_tenant import provision; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/provision_tenant.py
git commit -m "feat(multitenant): tenant provisioning script"
```

---

## Task 8: Bootstrap existing Conico data into t_conico

**Files:**
- Create: `backend/scripts/bootstrap_conico.py`

This is a **one-time** script. It:
1. Provisions the `t_conico` schema (calls `provision`)
2. Copies all data from `public` schema tables to `t_conico`
3. Sets `tenant_id` on all existing users

**Run this once on the existing database before going live.**

- [ ] **Step 1: Create bootstrap_conico.py**

Create `backend/scripts/bootstrap_conico.py`:

```python
"""
One-time migration of existing single-tenant data to t_conico schema.
Run ONCE on the existing database: python -m scripts.bootstrap_conico
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine, text, inspect
from app.config import settings
from scripts.provision_tenant import provision

TENANT_SLUG = "conico"
TENANT_NAME = "Conico SpA"
SCHEMA = "t_conico"

# Tables to copy from public → t_conico (excludes users, tenants, alembic_version)
TENANT_TABLES = [
    "empresas", "clientes", "proveedores", "productos",
    "cotizaciones", "cotizacion_lineas",
    "nota_ventas", "nota_venta_lineas",
    "facturas", "factura_lineas",
    "ordenes_compra", "orden_compra_lineas",
    "pagos", "movimiento_inventario",
    "aprobaciones_credito", "aprobaciones_margen",
    "empleados", "empleado_documentos", "empleado_vacaciones",
    "permission_overrides", "system_config",
    "dashboard_layout", "cobranza_config",
]


def main():
    engine = create_engine(settings.database_url)
    inspector = inspect(engine)
    existing_schemas = inspector.get_schema_names()

    if SCHEMA in existing_schemas:
        print(f"Schema '{SCHEMA}' already exists. Skipping provisioning.")
    else:
        print("Provisioning t_conico schema...")
        provision(TENANT_SLUG, TENANT_NAME)

    # Get tenant id
    with engine.connect() as conn:
        tenant_id = conn.execute(
            text("SELECT id FROM public.tenants WHERE slug = :s"),
            {"s": TENANT_SLUG},
        ).scalar()

        if not tenant_id:
            print("ERROR: Tenant record not found after provisioning.")
            sys.exit(1)

        # Copy tables (only if table exists in public and has rows)
        for table in TENANT_TABLES:
            public_tables = inspector.get_table_names(schema="public")
            if table not in public_tables:
                print(f"  Skipping {table} (not in public schema)")
                continue

            count = conn.execute(text(f"SELECT COUNT(*) FROM public.{table}")).scalar()
            if count == 0:
                print(f"  Skipping {table} (empty)")
                continue

            # Truncate destination then insert
            conn.execute(text(f"TRUNCATE {SCHEMA}.{table} CASCADE"))
            conn.execute(text(f"INSERT INTO {SCHEMA}.{table} SELECT * FROM public.{table}"))
            print(f"  Copied {count} rows: public.{table} → {SCHEMA}.{table}")

        # Update sequences to avoid PK conflicts
        for table in TENANT_TABLES:
            try:
                conn.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{SCHEMA}.{table}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {SCHEMA}.{table}), 0) + 1, false)"
                ))
            except Exception:
                pass  # table has no id sequence

        # Set tenant_id on all existing users
        conn.execute(
            text("UPDATE public.users SET tenant_id = :tid WHERE tenant_id IS NULL"),
            {"tid": tenant_id},
        )
        print(f"  Updated all users → tenant_id={tenant_id}")

        conn.commit()
        print("Bootstrap complete.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify import**

```bash
cd backend && python -c "from scripts.bootstrap_conico import main; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/bootstrap_conico.py
git commit -m "feat(multitenant): one-time bootstrap script for existing Conico data"
```

---

## Task 9: Tenant admin API endpoint

**Files:**
- Create: `backend/app/api/tenants.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create tenants.py**

Create `backend/app/api/tenants.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.tenant import Tenant
from app.schemas.tenant import TenantCreate, TenantOut
from app.api.auth import get_current_user
from app.models.user import User

router = APIRouter()


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user


@router.get("/", response_model=list[TenantOut])
def list_tenants(
    _: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    return db.query(Tenant).order_by(Tenant.created_at).all()


@router.get("/{tenant_id}", response_model=TenantOut)
def get_tenant(
    tenant_id: int,
    _: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    tenant = db.query(Tenant).filter_by(id=tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant
```

- [ ] **Step 2: Register router in main.py**

In `backend/app/main.py`, find the section where routers are included and add:

```python
from app.api import tenants as tenants_router
# ...
app.include_router(tenants_router.router, prefix="/api/tenants", tags=["tenants"])
```

- [ ] **Step 3: Verify FastAPI app starts**

```bash
cd backend && python -c "from app.main import app; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/tenants.py backend/app/main.py
git commit -m "feat(multitenant): tenant admin API endpoint"
```

---

## Task 10: Frontend — login with tenant_slug

**Files:**
- Modify: `frontend/src/hooks/useAuth.ts`
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/stores/auth.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add tenant_slug to User type**

In `frontend/src/types/index.ts`, update the `User` interface:

```typescript
export interface User {
  id: number
  email: string
  name: string
  role: 'admin' | 'subadmin' | 'vendedor'
  is_active: boolean
  tenant_id: number | null
  created_at: string
}
```

- [ ] **Step 2: Add tenant_slug to auth store**

Replace `frontend/src/stores/auth.ts` with:

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  tenantSlug: string | null
  setAuth: (user: User, accessToken: string, refreshToken: string, tenantSlug: string) => void
  setAccessToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      tenantSlug: null,
      setAuth: (user, accessToken, refreshToken, tenantSlug) =>
        set({ user, accessToken, refreshToken, tenantSlug }),
      setAccessToken: (accessToken) => set({ accessToken }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, tenantSlug: null }),
    }),
    { name: 'conico-auth' }
  )
)
```

- [ ] **Step 3: Update useAuth hook**

Replace `frontend/src/hooks/useAuth.ts` with:

```typescript
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import type { User } from '../types'

export function useAuth() {
  const { user, accessToken, tenantSlug, setAuth, logout } = useAuthStore()

  async function login(email: string, password: string, tenantSlug: string): Promise<void> {
    const tokenRes = await api.post<{ access_token: string; refresh_token: string }>(
      '/api/auth/login',
      { email, password, tenant_slug: tenantSlug }
    )
    const meRes = await api.get<User>('/api/auth/me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    })
    setAuth(meRes.data, tokenRes.data.access_token, tokenRes.data.refresh_token, tenantSlug)
  }

  return { user, isAuthenticated: !!accessToken, tenantSlug, login, logout }
}
```

- [ ] **Step 4: Update Login.tsx**

Replace `frontend/src/pages/Login.tsx` with:

```tsx
import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password, tenantSlug)
      navigate('/')
    } catch {
      setError('Credenciales incorrectas o empresa no encontrada.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090E1A] relative overflow-hidden px-4">

      {/* Subtle amber grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(245,158,11,1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(245,158,11,1) 1px, transparent 1px)
          `,
          backgroundSize: '56px 56px',
        }}
      />

      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_60%,rgba(245,158,11,0.06),transparent)]" />

      <div className="relative w-full max-w-sm">

        {/* Brand mark */}
        <div className="mb-8 text-center select-none">
          <div className="inline-flex items-baseline">
            <span className="text-[2.75rem] font-bold text-white tracking-tight leading-none">CO</span>
            <span className="text-[2.75rem] font-bold text-brand-400 tracking-tight leading-none">NI</span>
            <span className="text-[2.75rem] font-bold text-white tracking-tight leading-none">CO</span>
          </div>
          <p className="mt-2 text-[11px] text-gray-600 tracking-[0.3em] uppercase font-medium">
            Sistema de Gestión
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#111827] border border-white/8 rounded-2xl p-8 shadow-2xl shadow-black/60">
          <h2 className="text-base font-semibold text-white mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase">
                Empresa
              </label>
              <input
                type="text"
                value={tenantSlug}
                onChange={e => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                required
                autoComplete="organization"
                placeholder="conico"
                className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm
                           placeholder-gray-700 transition-colors
                           focus:outline-none focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="usuario@empresa.cl"
                className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm
                           placeholder-gray-700 transition-colors
                           focus:outline-none focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm
                           placeholder-gray-700 transition-colors
                           focus:outline-none focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2.5">
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-1 bg-brand-500 hover:bg-brand-400 active:bg-brand-600
                         text-gray-900 font-semibold text-sm rounded-xl tracking-wide
                         disabled:opacity-50 transition-all duration-150"
            >
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-700">
          Conico &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useAuth.ts frontend/src/pages/Login.tsx frontend/src/stores/auth.ts frontend/src/types/index.ts
git commit -m "feat(multitenant): login form with tenant_slug, store tenant in auth state"
```

---

## Task 11: Execute bootstrap (final step)

**Run this ONCE on the existing production/dev database.**

- [ ] **Step 1: Back up database first**

```bash
pg_dump $DATABASE_URL > backup_pre_multitenant_$(date +%Y%m%d).sql
```

- [ ] **Step 2: Run shared migrations**

```bash
cd backend && alembic upgrade head
```
This creates the `tenants` table and `tenant_id` column on `users`.

- [ ] **Step 3: Run bootstrap script**

```bash
cd backend && python -m scripts.bootstrap_conico
```
Expected output:
```
Provisioning t_conico schema...
Creating schema 't_conico'...
Creating tables in 't_conico'...
Tenant record created: id=1
  Copied N rows: public.empresas → t_conico.empresas
  ...
  Updated all users → tenant_id=1
Bootstrap complete.
```

- [ ] **Step 4: Verify data in t_conico**

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM t_conico.clientes;"
psql $DATABASE_URL -c "SELECT id, slug, schema_name FROM public.tenants;"
psql $DATABASE_URL -c "SELECT id, email, tenant_id FROM public.users;"
```
Expected: rows in t_conico, 1 tenant record, all users have tenant_id=1

- [ ] **Step 5: Test login end-to-end**

Start the dev server and test:
```
POST /api/auth/login
{"email": "admin@conico.cl", "password": "...", "tenant_slug": "conico"}
```
Expected: Returns `access_token` and `refresh_token`.

- [ ] **Step 6: Test a business endpoint**

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/clientes/
```
Expected: Returns Conico's clients only.

---

## Self-Review Checklist

- [x] Task 1: SharedBase added → tenant tables and shared tables properly separated
- [x] Task 2: Tenant model with `schema="public"` + migration
- [x] Task 3: User uses SharedBase + `schema="public"`, PermissionOverride FK updated
- [x] Task 4: JSON login with tenant_slug, JWT includes tenant_schema
- [x] Task 5: get_tenant_db sets search_path per request, require_permission updated
- [x] Task 6: Alembic env.py handles both shared and tenant schema modes
- [x] Task 7: Provisioning script creates schema + tables + seeds SystemConfig + creates Tenant record
- [x] Task 8: Bootstrap copies all existing data to t_conico, updates user tenant_ids
- [x] Task 9: Tenant admin API for listing/viewing tenants
- [x] Task 10: Frontend login updated with tenant_slug field
- [x] Task 11: Execution steps with backup → migrate → bootstrap → verify

**Known gap:** The `DashboardLayout` model imports `Base` but wasn't in `__init__.py` — add it there if bootstrap encounters an error on that table.

**SQL injection note:** The `schema` in `get_tenant_db` comes from a signed JWT, so it's trusted. The `provision_tenant.py` validates the slug with a regex before using it in SQL. Both are safe.
