# Conico PMS — Fase 2: Datos Maestros

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD completo para Proveedores, Catálogo de Productos y Clientes, con exportación Excel y búsqueda de productos para autocompletar.

**Architecture:** Tres módulos independientes (Proveedores → Productos → Clientes), cada uno con modelo SQLAlchemy, esquema Pydantic, router FastAPI con permisos, tests pytest, y página React. Productos tiene FK nullable a Proveedor y endpoint de búsqueda para el autocompletar de cotizaciones (Fase 3). La exportación Excel se implementa en el backend con openpyxl.

**Tech Stack:** Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, openpyxl, Alembic, pytest; React 18, TypeScript 5, TailwindCSS 3, React Query 5, Axios, Vitest

---

## Estructura de archivos

```
backend/
  app/
    models/
      proveedor.py          (nuevo)
      producto.py           (nuevo)
      cliente.py            (nuevo)
      __init__.py           (modificar: agregar 3 imports nuevos)
    schemas/
      proveedor.py          (nuevo)
      producto.py           (nuevo)
      cliente.py            (nuevo)
    api/
      proveedores.py        (nuevo)
      productos.py          (nuevo)
      clientes.py           (nuevo)
    main.py                 (modificar: registrar 3 routers nuevos)
  migrations/versions/
    b2e9f4a1c7d3_add_proveedores_productos_clientes.py  (nuevo)
  tests/
    conftest.py             (modificar: agregar fixtures subadmin/vendedor + imports nuevos modelos)
    test_proveedores.py     (nuevo)
    test_productos.py       (nuevo)
    test_clientes.py        (nuevo)
  requirements.txt          (modificar: agregar openpyxl)

frontend/
  src/
    types/index.ts          (modificar: agregar Proveedor, Producto, Cliente)
    router.tsx              (modificar: agregar 3 rutas nuevas)
    pages/
      Proveedores.tsx       (nuevo)
      Proveedores.test.tsx  (nuevo)
      Productos.tsx         (nuevo)
      Productos.test.tsx    (nuevo)
      Clientes.tsx          (nuevo)
      Clientes.test.tsx     (nuevo)
```

---

## Task 1: Modelos SQLAlchemy — Proveedor, Producto, Cliente

**Files:**
- Create: `backend/app/models/proveedor.py`
- Create: `backend/app/models/producto.py`
- Create: `backend/app/models/cliente.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Escribir test de modelos que falla**

```python
# backend/tests/test_models_fase2.py
def test_crear_proveedor(db):
    from app.models.proveedor import Proveedor
    p = Proveedor(nombre="Proveedor Test", rut="76.123.456-7")
    db.add(p)
    db.commit()
    db.refresh(p)
    assert p.id is not None
    assert p.nombre == "Proveedor Test"
    assert p.created_at is not None

def test_crear_producto(db):
    from app.models.producto import Producto
    p = Producto(nombre="Producto Test", precio_costo=100.0, precio_venta=150.0)
    db.add(p)
    db.commit()
    db.refresh(p)
    assert p.id is not None
    assert float(p.precio_venta) == 150.0

def test_crear_cliente(db):
    from app.models.cliente import Cliente
    c = Cliente(nombre="Cliente Test", rut="12.345.678-9")
    db.add(c)
    db.commit()
    db.refresh(c)
    assert c.id is not None
    assert c.nombre == "Cliente Test"

def test_producto_con_proveedor(db):
    from app.models.proveedor import Proveedor
    from app.models.producto import Producto
    prov = Proveedor(nombre="Prov A")
    db.add(prov)
    db.commit()
    db.refresh(prov)
    prod = Producto(nombre="Prod A", proveedor_id=prov.id, precio_costo=10.0, precio_venta=20.0)
    db.add(prod)
    db.commit()
    db.refresh(prod)
    assert prod.proveedor_id == prov.id
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

```bash
cd backend && python -m pytest tests/test_models_fase2.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.proveedor'`

- [ ] **Step 3: Crear `backend/app/models/proveedor.py`**

```python
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Proveedor(Base):
    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    rut: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    productos: Mapped[list["Producto"]] = relationship("Producto", back_populates="proveedor")
```

- [ ] **Step 4: Crear `backend/app/models/producto.py`**

```python
from datetime import datetime, timezone
from sqlalchemy import String, Text, Numeric, Integer, ForeignKey, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Producto(Base):
    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255), index=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    precio_costo: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    precio_venta: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    stock_minimo: Mapped[int] = mapped_column(Integer, default=0)
    stock_actual: Mapped[int] = mapped_column(Integer, default=0)
    proveedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("proveedores.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    proveedor: Mapped["Proveedor | None"] = relationship("Proveedor", back_populates="productos")
```

- [ ] **Step 5: Crear `backend/app/models/cliente.py`**

```python
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    rut: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(50), nullable=True)
    direccion: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
```

- [ ] **Step 6: Actualizar `backend/app/models/__init__.py`**

```python
from app.models.user import User
from app.models.permission import PermissionOverride
from app.models.proveedor import Proveedor
from app.models.producto import Producto
from app.models.cliente import Cliente
```

- [ ] **Step 7: Actualizar `setup_test_db` en `backend/tests/conftest.py`**

Agregar las 3 importaciones nuevas dentro de la fixture `setup_test_db`:

```python
@pytest.fixture(autouse=True)
def setup_test_db():
    from app.database import Base
    import app.models.user       # noqa: F401
    import app.models.permission # noqa: F401
    import app.models.proveedor  # noqa: F401
    import app.models.producto   # noqa: F401
    import app.models.cliente    # noqa: F401
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
```

- [ ] **Step 8: Ejecutar tests de modelos**

```bash
cd backend && python -m pytest tests/test_models_fase2.py -v
```
Expected: 4 tests PASS

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/proveedor.py backend/app/models/producto.py \
  backend/app/models/cliente.py backend/app/models/__init__.py \
  backend/tests/conftest.py backend/tests/test_models_fase2.py
git commit -m "feat: modelos Proveedor, Producto y Cliente"
```

---

## Task 2: Migración Alembic

**Files:**
- Create: `backend/migrations/versions/b2e9f4a1c7d3_add_proveedores_productos_clientes.py`

- [ ] **Step 1: Crear el archivo de migración**

Crear `backend/migrations/versions/b2e9f4a1c7d3_add_proveedores_productos_clientes.py`:

```python
"""add proveedores, productos y clientes tables

Revision ID: b2e9f4a1c7d3
Revises: a3f8c12e9d04
Create Date: 2026-04-17 20:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b2e9f4a1c7d3"
down_revision: Union[str, None] = "a3f8c12e9d04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "proveedores",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("rut", sa.String(20), nullable=True),
        sa.Column("contacto", sa.String(255), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("telefono", sa.String(50), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rut"),
    )
    op.create_index("ix_proveedores_rut", "proveedores", ["rut"], unique=True)

    op.create_table(
        "productos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("precio_costo", sa.Numeric(12, 2), nullable=False),
        sa.Column("precio_venta", sa.Numeric(12, 2), nullable=False),
        sa.Column("stock_minimo", sa.Integer(), nullable=False),
        sa.Column("stock_actual", sa.Integer(), nullable=False),
        sa.Column("proveedor_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["proveedor_id"], ["proveedores.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_productos_nombre", "productos", ["nombre"])

    op.create_table(
        "clientes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("rut", sa.String(20), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("telefono", sa.String(50), nullable=True),
        sa.Column("direccion", sa.String(500), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rut"),
    )
    op.create_index("ix_clientes_rut", "clientes", ["rut"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_clientes_rut", table_name="clientes")
    op.drop_table("clientes")
    op.drop_index("ix_productos_nombre", table_name="productos")
    op.drop_table("productos")
    op.drop_index("ix_proveedores_rut", table_name="proveedores")
    op.drop_table("proveedores")
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/versions/b2e9f4a1c7d3_add_proveedores_productos_clientes.py
git commit -m "feat: migración Alembic para proveedores, productos y clientes"
```

---

## Task 3: Esquemas Pydantic

**Files:**
- Create: `backend/app/schemas/proveedor.py`
- Create: `backend/app/schemas/producto.py`
- Create: `backend/app/schemas/cliente.py`

- [ ] **Step 1: Crear `backend/app/schemas/proveedor.py`**

```python
from datetime import datetime
from pydantic import BaseModel


class ProveedorBase(BaseModel):
    nombre: str
    rut: str | None = None
    contacto: str | None = None
    email: str | None = None
    telefono: str | None = None
    notas: str | None = None


class ProveedorCreate(ProveedorBase):
    pass


class ProveedorUpdate(BaseModel):
    nombre: str | None = None
    rut: str | None = None
    contacto: str | None = None
    email: str | None = None
    telefono: str | None = None
    notas: str | None = None


class ProveedorOut(ProveedorBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Crear `backend/app/schemas/producto.py`**

```python
from datetime import datetime
from pydantic import BaseModel


class ProductoBase(BaseModel):
    nombre: str
    descripcion: str | None = None
    precio_costo: float = 0.0
    precio_venta: float = 0.0
    stock_minimo: int = 0
    stock_actual: int = 0
    proveedor_id: int | None = None


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    precio_costo: float | None = None
    precio_venta: float | None = None
    stock_minimo: int | None = None
    stock_actual: int | None = None
    proveedor_id: int | None = None


class ProductoOut(ProductoBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}


class ProductoBusquedaOut(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None
    precio_venta: float
    stock_actual: int
    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Crear `backend/app/schemas/cliente.py`**

```python
from datetime import datetime
from pydantic import BaseModel


class ClienteBase(BaseModel):
    nombre: str
    rut: str | None = None
    email: str | None = None
    telefono: str | None = None
    direccion: str | None = None
    notas: str | None = None


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nombre: str | None = None
    rut: str | None = None
    email: str | None = None
    telefono: str | None = None
    direccion: str | None = None
    notas: str | None = None


class ClienteOut(ClienteBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/proveedor.py backend/app/schemas/producto.py \
  backend/app/schemas/cliente.py
git commit -m "feat: esquemas Pydantic para proveedores, productos y clientes"
```

---

## Task 4: Dependencia openpyxl + fixtures de prueba

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Agregar openpyxl a `backend/requirements.txt`**

Agregar al final del archivo:

```
openpyxl==3.1.5
```

- [ ] **Step 2: Instalar**

```bash
cd backend && pip install openpyxl==3.1.5
```
Expected: Successfully installed openpyxl-3.1.5 (o ya instalado)

- [ ] **Step 3: Agregar fixtures subadmin y vendedor a `backend/tests/conftest.py`**

Agregar al final del archivo (después de `admin_token`):

```python
@pytest.fixture
def subadmin_user(setup_test_db):
    from app.models.user import User
    from app.core.security import get_password_hash

    db = TestingSession()
    user = User(
        email="subadmin@conico.cl",
        name="SubAdmin",
        hashed_password=get_password_hash("secret123"),
        role="subadmin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


@pytest.fixture
def subadmin_token(client, subadmin_user):
    resp = client.post("/api/auth/login", data={"username": "subadmin@conico.cl", "password": "secret123"})
    return resp.json()["access_token"]


@pytest.fixture
def vendedor_user(setup_test_db):
    from app.models.user import User
    from app.core.security import get_password_hash

    db = TestingSession()
    user = User(
        email="vendedor@conico.cl",
        name="Vendedor",
        hashed_password=get_password_hash("secret123"),
        role="vendedor",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


@pytest.fixture
def vendedor_token(client, vendedor_user):
    resp = client.post("/api/auth/login", data={"username": "vendedor@conico.cl", "password": "secret123"})
    return resp.json()["access_token"]
```

- [ ] **Step 4: Verificar que los 20 tests anteriores siguen pasando**

```bash
cd backend && python -m pytest tests/ --ignore=tests/test_smoke.py -v
```
Expected: 24 passed (20 anteriores + 4 nuevos de modelos)

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/tests/conftest.py
git commit -m "feat: openpyxl y fixtures subadmin/vendedor para tests"
```

---

## Task 5: API Proveedores + tests

**Files:**
- Create: `backend/tests/test_proveedores.py`
- Create: `backend/app/api/proveedores.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Escribir `backend/tests/test_proveedores.py` (falla)**

```python
import pytest


def test_listar_sin_autenticacion(client):
    r = client.get("/api/proveedores/")
    assert r.status_code == 401


def test_listar_sin_permisos_vendedor(client, vendedor_token):
    r = client.get("/api/proveedores/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403


def test_crear_proveedor(client, admin_token):
    r = client.post(
        "/api/proveedores/",
        json={"nombre": "Proveedor A", "rut": "76.123.456-7", "contacto": "Juan"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Proveedor A"
    assert data["rut"] == "76.123.456-7"
    assert "id" in data


def test_crear_proveedor_rut_duplicado(client, admin_token):
    client.post(
        "/api/proveedores/",
        json={"nombre": "Prov A", "rut": "76.000.001-1"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r = client.post(
        "/api/proveedores/",
        json={"nombre": "Prov B", "rut": "76.000.001-1"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 409


def test_listar_proveedores(client, admin_token):
    client.post("/api/proveedores/", json={"nombre": "Prov X"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/proveedores/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_obtener_proveedor(client, admin_token):
    r = client.post("/api/proveedores/", json={"nombre": "Prov Y"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.get(f"/api/proveedores/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Prov Y"


def test_actualizar_proveedor(client, admin_token):
    r = client.post("/api/proveedores/", json={"nombre": "Antiguo"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.patch(
        f"/api/proveedores/{pid}",
        json={"nombre": "Nuevo", "telefono": "+56912345678"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Nuevo"
    assert r2.json()["telefono"] == "+56912345678"


def test_eliminar_proveedor(client, admin_token):
    r = client.post("/api/proveedores/", json={"nombre": "Para Borrar"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.delete(f"/api/proveedores/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/proveedores/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404


def test_subadmin_puede_ver_proveedores(client, subadmin_token):
    r = client.get("/api/proveedores/", headers={"Authorization": f"Bearer {subadmin_token}"})
    assert r.status_code == 200
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

```bash
cd backend && python -m pytest tests/test_proveedores.py -v
```
Expected: FAIL — `404 Not Found` (el router no existe todavía)

- [ ] **Step 3: Crear `backend/app/api/proveedores.py`**

```python
from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.permissions import has_permission
from app.database import get_db
from app.models.proveedor import Proveedor
from app.models.user import User
from app.schemas.proveedor import ProveedorCreate, ProveedorOut, ProveedorUpdate

router = APIRouter()


def _verificar_permiso(db: Session, user: User, action: str) -> None:
    if not has_permission(db, user, "proveedores", action):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


@router.get("/export/excel")
def exportar_excel(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    proveedores = db.query(Proveedor).order_by(Proveedor.nombre).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Proveedores"
    ws.append(["ID", "Nombre", "RUT", "Contacto", "Email", "Teléfono", "Notas"])
    for p in proveedores:
        ws.append([p.id, p.nombre, p.rut or "", p.contacto or "", p.email or "", p.telefono or "", p.notas or ""])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=proveedores.xlsx"},
    )


@router.get("/", response_model=list[ProveedorOut])
def listar_proveedores(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    return db.query(Proveedor).order_by(Proveedor.nombre).all()


@router.post("/", response_model=ProveedorOut, status_code=status.HTTP_201_CREATED)
def crear_proveedor(
    body: ProveedorCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "create")
    if body.rut:
        if db.query(Proveedor).filter_by(rut=body.rut).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    proveedor = Proveedor(**body.model_dump())
    db.add(proveedor)
    db.commit()
    db.refresh(proveedor)
    return proveedor


@router.get("/{proveedor_id}", response_model=ProveedorOut)
def obtener_proveedor(
    proveedor_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    p = db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    return p


@router.patch("/{proveedor_id}", response_model=ProveedorOut)
def actualizar_proveedor(
    proveedor_id: int,
    body: ProveedorUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "edit")
    p = db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{proveedor_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_proveedor(
    proveedor_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "delete")
    p = db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    db.delete(p)
    db.commit()
```

- [ ] **Step 4: Registrar router en `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, users
from app.api import proveedores

app = FastAPI(title="Conico PMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["usuarios"])
app.include_router(proveedores.router, prefix="/api/proveedores", tags=["proveedores"])
```

- [ ] **Step 5: Ejecutar tests de proveedores**

```bash
cd backend && python -m pytest tests/test_proveedores.py -v
```
Expected: 9 tests PASS

- [ ] **Step 6: Ejecutar suite completa**

```bash
cd backend && python -m pytest tests/ --ignore=tests/test_smoke.py -v
```
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/proveedores.py backend/app/main.py \
  backend/tests/test_proveedores.py
git commit -m "feat: API proveedores con CRUD, permisos y exportación Excel"
```

---

## Task 6: API Productos + tests

**Files:**
- Create: `backend/tests/test_productos.py`
- Create: `backend/app/api/productos.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Escribir `backend/tests/test_productos.py` (falla)**

```python
def test_listar_sin_autenticacion(client):
    r = client.get("/api/productos/")
    assert r.status_code == 401


def test_vendedor_puede_ver_productos(client, vendedor_token):
    r = client.get("/api/productos/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_vendedor_no_puede_crear_producto(client, vendedor_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod X", "precio_costo": 10.0, "precio_venta": 20.0},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


def test_crear_producto(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Tornillo M6", "descripcion": "Tornillo inoxidable", "precio_costo": 50.0, "precio_venta": 120.0, "stock_minimo": 10},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Tornillo M6"
    assert data["precio_venta"] == 120.0


def test_crear_producto_con_proveedor(client, admin_token):
    prov = client.post(
        "/api/proveedores/",
        json={"nombre": "Prov Z"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    prov_id = prov.json()["id"]
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod con Prov", "precio_costo": 10.0, "precio_venta": 20.0, "proveedor_id": prov_id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["proveedor_id"] == prov_id


def test_buscar_productos(client, admin_token):
    client.post("/api/productos/", json={"nombre": "Perno hexagonal"}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/productos/", json={"nombre": "Tuerca M8"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/productos/buscar?q=perno", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    resultados = r.json()
    assert len(resultados) == 1
    assert resultados[0]["nombre"] == "Perno hexagonal"


def test_actualizar_producto(client, admin_token):
    r = client.post("/api/productos/", json={"nombre": "Viejo"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.patch(
        f"/api/productos/{pid}",
        json={"nombre": "Nuevo", "precio_venta": 999.0},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Nuevo"
    assert r2.json()["precio_venta"] == 999.0


def test_eliminar_producto(client, admin_token):
    r = client.post("/api/productos/", json={"nombre": "Para Borrar"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.delete(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

```bash
cd backend && python -m pytest tests/test_productos.py -v
```
Expected: FAIL

- [ ] **Step 3: Crear `backend/app/api/productos.py`**

```python
from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.permissions import has_permission
from app.database import get_db
from app.models.producto import Producto
from app.models.user import User
from app.schemas.producto import ProductoBusquedaOut, ProductoCreate, ProductoOut, ProductoUpdate

router = APIRouter()


def _verificar_permiso(db: Session, user: User, action: str) -> None:
    if not has_permission(db, user, "catalogo", action):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


@router.get("/export/excel")
def exportar_excel(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    productos = db.query(Producto).order_by(Producto.nombre).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Catálogo"
    ws.append(["ID", "Nombre", "Descripción", "Precio Costo", "Precio Venta", "Stock Mínimo", "Stock Actual"])
    for p in productos:
        ws.append([p.id, p.nombre, p.descripcion or "", float(p.precio_costo), float(p.precio_venta), p.stock_minimo, p.stock_actual])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=catalogo.xlsx"},
    )


@router.get("/buscar", response_model=list[ProductoBusquedaOut])
def buscar_productos(
    q: str = Query("", description="Texto a buscar en nombre del producto"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    return (
        db.query(Producto)
        .filter(Producto.nombre.ilike(f"%{q}%"))
        .order_by(Producto.nombre)
        .limit(20)
        .all()
    )


@router.get("/", response_model=list[ProductoOut])
def listar_productos(
    q: str = Query("", description="Filtrar por nombre"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    query = db.query(Producto)
    if q:
        query = query.filter(Producto.nombre.ilike(f"%{q}%"))
    return query.order_by(Producto.nombre).all()


@router.post("/", response_model=ProductoOut, status_code=status.HTTP_201_CREATED)
def crear_producto(
    body: ProductoCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "create")
    producto = Producto(**body.model_dump())
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return producto


@router.get("/{producto_id}", response_model=ProductoOut)
def obtener_producto(
    producto_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    return p


@router.patch("/{producto_id}", response_model=ProductoOut)
def actualizar_producto(
    producto_id: int,
    body: ProductoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "edit")
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{producto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_producto(
    producto_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "delete")
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    db.delete(p)
    db.commit()
```

- [ ] **Step 4: Agregar router de productos a `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, users
from app.api import proveedores, productos

app = FastAPI(title="Conico PMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["usuarios"])
app.include_router(proveedores.router, prefix="/api/proveedores", tags=["proveedores"])
app.include_router(productos.router, prefix="/api/productos", tags=["catálogo"])
```

- [ ] **Step 5: Ejecutar tests**

```bash
cd backend && python -m pytest tests/test_productos.py -v
```
Expected: 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/productos.py backend/app/main.py \
  backend/tests/test_productos.py
git commit -m "feat: API catálogo de productos con CRUD, búsqueda y exportación Excel"
```

---

## Task 7: API Clientes + tests

**Files:**
- Create: `backend/tests/test_clientes.py`
- Create: `backend/app/api/clientes.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Escribir `backend/tests/test_clientes.py` (falla)**

```python
def test_listar_sin_autenticacion(client):
    r = client.get("/api/clientes/")
    assert r.status_code == 401


def test_vendedor_puede_ver_clientes(client, vendedor_token):
    r = client.get("/api/clientes/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_vendedor_puede_crear_cliente(client, vendedor_token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Cliente Vendedor", "rut": "11.111.111-1"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 201


def test_crear_cliente(client, admin_token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Empresa ABC Ltda.", "rut": "76.543.210-K", "email": "contacto@abc.cl", "telefono": "+56221234567"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Empresa ABC Ltda."
    assert data["rut"] == "76.543.210-K"


def test_crear_cliente_rut_duplicado(client, admin_token):
    client.post("/api/clientes/", json={"nombre": "A", "rut": "99.000.001-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.post("/api/clientes/", json={"nombre": "B", "rut": "99.000.001-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409


def test_listar_clientes(client, admin_token):
    client.post("/api/clientes/", json={"nombre": "Cliente X"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/clientes/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_actualizar_cliente(client, admin_token):
    r = client.post("/api/clientes/", json={"nombre": "Viejo"}, headers={"Authorization": f"Bearer {admin_token}"})
    cid = r.json()["id"]
    r2 = client.patch(
        f"/api/clientes/{cid}",
        json={"nombre": "Nuevo", "notas": "Cliente especial"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Nuevo"
    assert r2.json()["notas"] == "Cliente especial"


def test_eliminar_cliente(client, admin_token):
    r = client.post("/api/clientes/", json={"nombre": "Para Borrar"}, headers={"Authorization": f"Bearer {admin_token}"})
    cid = r.json()["id"]
    r2 = client.delete(f"/api/clientes/{cid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/clientes/{cid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404


def test_vendedor_no_puede_eliminar_cliente(client, vendedor_token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "No Borrar"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    cid = r.json()["id"]
    r2 = client.delete(f"/api/clientes/{cid}", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r2.status_code == 403
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

```bash
cd backend && python -m pytest tests/test_clientes.py -v
```
Expected: FAIL

- [ ] **Step 3: Crear `backend/app/api/clientes.py`**

```python
from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.permissions import has_permission
from app.database import get_db
from app.models.cliente import Cliente
from app.models.user import User
from app.schemas.cliente import ClienteCreate, ClienteOut, ClienteUpdate

router = APIRouter()


def _verificar_permiso(db: Session, user: User, action: str) -> None:
    if not has_permission(db, user, "clientes", action):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


@router.get("/export/excel")
def exportar_excel(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    clientes = db.query(Cliente).order_by(Cliente.nombre).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Clientes"
    ws.append(["ID", "Nombre", "RUT", "Email", "Teléfono", "Dirección", "Notas"])
    for c in clientes:
        ws.append([c.id, c.nombre, c.rut or "", c.email or "", c.telefono or "", c.direccion or "", c.notas or ""])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=clientes.xlsx"},
    )


@router.get("/", response_model=list[ClienteOut])
def listar_clientes(
    q: str = Query("", description="Filtrar por nombre o RUT"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    query = db.query(Cliente)
    if q:
        query = query.filter(
            Cliente.nombre.ilike(f"%{q}%") | Cliente.rut.ilike(f"%{q}%")
        )
    return query.order_by(Cliente.nombre).all()


@router.post("/", response_model=ClienteOut, status_code=status.HTTP_201_CREATED)
def crear_cliente(
    body: ClienteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "create")
    if body.rut:
        if db.query(Cliente).filter_by(rut=body.rut).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    cliente = Cliente(**body.model_dump())
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.get("/{cliente_id}", response_model=ClienteOut)
def obtener_cliente(
    cliente_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    return c


@router.patch("/{cliente_id}", response_model=ClienteOut)
def actualizar_cliente(
    cliente_id: int,
    body: ClienteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "edit")
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(c, field, value)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cliente(
    cliente_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "delete")
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    db.delete(c)
    db.commit()
```

- [ ] **Step 4: Actualizar `backend/app/main.py` con los 3 routers**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, users
from app.api import proveedores, productos, clientes

app = FastAPI(title="Conico PMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["usuarios"])
app.include_router(proveedores.router, prefix="/api/proveedores", tags=["proveedores"])
app.include_router(productos.router, prefix="/api/productos", tags=["catálogo"])
app.include_router(clientes.router, prefix="/api/clientes", tags=["clientes"])
```

- [ ] **Step 5: Ejecutar tests de clientes**

```bash
cd backend && python -m pytest tests/test_clientes.py -v
```
Expected: 9 tests PASS

- [ ] **Step 6: Ejecutar suite completa**

```bash
cd backend && python -m pytest tests/ --ignore=tests/test_smoke.py -v
```
Expected: all tests PASS (24 anteriores + 9 proveedores + 8 productos + 9 clientes = 50 aprox)

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/clientes.py backend/app/main.py \
  backend/tests/test_clientes.py
git commit -m "feat: API clientes con CRUD, permisos y exportación Excel"
```

---

## Task 8: Frontend — tipos y rutas

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Agregar tipos a `frontend/src/types/index.ts`**

Agregar al final del archivo (mantener los tipos existentes: User, Module, Action, Permissions):

```typescript
export interface Proveedor {
  id: number
  nombre: string
  rut: string | null
  contacto: string | null
  email: string | null
  telefono: string | null
  notas: string | null
  created_at: string
}

export interface Producto {
  id: number
  nombre: string
  descripcion: string | null
  precio_costo: number
  precio_venta: number
  stock_minimo: number
  stock_actual: number
  proveedor_id: number | null
  created_at: string
}

export interface Cliente {
  id: number
  nombre: string
  rut: string | null
  email: string | null
  telefono: string | null
  direccion: string | null
  notas: string | null
  created_at: string
}
```

- [ ] **Step 2: Actualizar `frontend/src/router.tsx`**

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Users from './pages/Users'
import Proveedores from './pages/Proveedores'
import Productos from './pages/Productos'
import Clientes from './pages/Clientes'
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
      { path: 'proveedores', element: <Proveedores /> },
      { path: 'catalogo', element: <Productos /> },
      { path: 'clientes', element: <Clientes /> },
    ],
  },
])
```

- [ ] **Step 3: Verificar TypeScript (falla porque los componentes aún no existen)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: FAIL — `Cannot find module './pages/Proveedores'`

(Esto es esperado — los archivos de páginas se crean en las tareas siguientes)

- [ ] **Step 4: Commit solo los tipos**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: tipos TypeScript para Proveedor, Producto y Cliente"
```

---

## Task 9: Página Proveedores

**Files:**
- Create: `frontend/src/pages/Proveedores.tsx`
- Create: `frontend/src/pages/Proveedores.test.tsx`

- [ ] **Step 1: Escribir `frontend/src/pages/Proveedores.test.tsx` (falla)**

```typescript
import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Proveedores from './Proveedores'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
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

it('muestra lista de proveedores', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({
    data: [{ id: 1, nombre: 'Prov Test', rut: '76.000.001-1', contacto: null, email: null, telefono: null, notas: null, created_at: '' }],
  })
  render(wrap(<Proveedores />))
  await waitFor(() => expect(screen.getByText('Prov Test')).toBeInTheDocument())
})

it('muestra botón Agregar proveedor', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({ data: [] })
  render(wrap(<Proveedores />))
  await waitFor(() => expect(screen.getByText('Agregar proveedor')).toBeInTheDocument())
})
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

```bash
cd frontend && npm test -- Proveedores.test
```
Expected: FAIL

- [ ] **Step 3: Crear `frontend/src/pages/Proveedores.tsx`**

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Proveedor } from '../types'

const CAMPOS = [
  { key: 'nombre' as const, label: 'Nombre', required: true, colSpan: 2 },
  { key: 'rut' as const, label: 'RUT', required: false, colSpan: 1 },
  { key: 'contacto' as const, label: 'Contacto', required: false, colSpan: 1 },
  { key: 'email' as const, label: 'Email', required: false, colSpan: 1 },
  { key: 'telefono' as const, label: 'Teléfono', required: false, colSpan: 1 },
  { key: 'notas' as const, label: 'Notas', required: false, colSpan: 2, textarea: true },
] as const

type CampoKey = typeof CAMPOS[number]['key']
type FormData = Record<CampoKey, string>

const EMPTY_FORM: FormData = { nombre: '', rut: '', contacto: '', email: '', telefono: '', notas: '' }

export default function Proveedores() {
  const qc = useQueryClient()
  const { data: proveedores = [], isLoading } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/api/proveedores/').then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)

  function abrirCrear() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setError(null)
    setModalOpen(true)
  }

  function abrirEditar(p: Proveedor) {
    setEditando(p)
    setForm({ nombre: p.nombre, rut: p.rut ?? '', contacto: p.contacto ?? '', email: p.email ?? '', telefono: p.telefono ?? '', notas: p.notas ?? '' })
    setError(null)
    setModalOpen(true)
  }

  function cerrarModal() {
    setModalOpen(false)
    setEditando(null)
    setError(null)
  }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || null]))
      if (editando) return api.patch(`/api/proveedores/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/proveedores/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); cerrarModal() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/proveedores/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); setEliminandoId(null) },
    onError: () => setEliminandoId(null),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Proveedores</h1>
        <div className="flex gap-2">
          <a
            href="/api/proveedores/export/excel"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Exportar Excel
          </a>
          <button
            onClick={abrirCrear}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Agregar proveedor
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">RUT</th>
              <th className="text-left px-4 py-3 font-medium">Contacto</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {proveedores.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin proveedores registrados</td>
              </tr>
            )}
            {proveedores.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.nombre}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.rut ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.contacto ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.email ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.telefono ?? '—'}</td>
                <td className="px-4 py-3">
                  {eliminandoId === p.id ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>
                      <button onClick={() => eliminar.mutate(p.id)} className="text-red-600 hover:underline font-medium">Sí</button>
                      <button onClick={() => setEliminandoId(null)} className="text-gray-500 hover:underline">No</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-3">
                      <button onClick={() => abrirEditar(p)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => setEliminandoId(p.id)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editando ? 'Editar proveedor' : 'Nuevo proveedor'}
              </h2>
            </div>
            <form
              onSubmit={e => { e.preventDefault(); guardar.mutate(form) }}
              className="px-6 py-4 grid grid-cols-2 gap-4"
            >
              {CAMPOS.map(campo => (
                <div key={campo.key} className={campo.colSpan === 2 ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {campo.label}{campo.required && ' *'}
                  </label>
                  {('textarea' in campo && campo.textarea) ? (
                    <textarea
                      value={form[campo.key]}
                      onChange={e => setForm(f => ({ ...f, [campo.key]: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={form[campo.key]}
                      onChange={e => setForm(f => ({ ...f, [campo.key]: e.target.value }))}
                      required={campo.required}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  )}
                </div>
              ))}
              {error && <p className="col-span-2 text-xs text-red-500">{error}</p>}
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={cerrarModal} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardar.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                >
                  {guardar.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar test**

```bash
cd frontend && npm test -- Proveedores.test
```
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Proveedores.tsx frontend/src/pages/Proveedores.test.tsx
git commit -m "feat: página Proveedores con tabla, modal de edición y confirmación de eliminación"
```

---

## Task 10: Página Productos

**Files:**
- Create: `frontend/src/pages/Productos.tsx`
- Create: `frontend/src/pages/Productos.test.tsx`

- [ ] **Step 1: Escribir `frontend/src/pages/Productos.test.tsx` (falla)**

```typescript
import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Productos from './Productos'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
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

it('muestra lista de productos', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({
    data: [{ id: 1, nombre: 'Tornillo M6', descripcion: null, precio_costo: 50, precio_venta: 120, stock_minimo: 10, stock_actual: 50, proveedor_id: null, created_at: '' }],
  })
  render(wrap(<Productos />))
  await waitFor(() => expect(screen.getByText('Tornillo M6')).toBeInTheDocument())
  expect(screen.getByText('$120')).toBeInTheDocument()
})

it('muestra botón Agregar producto', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({ data: [] })
  render(wrap(<Productos />))
  await waitFor(() => expect(screen.getByText('Agregar producto')).toBeInTheDocument())
})
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

```bash
cd frontend && npm test -- Productos.test
```
Expected: FAIL

- [ ] **Step 3: Crear `frontend/src/pages/Productos.tsx`**

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Producto } from '../types'

type FormData = {
  nombre: string
  descripcion: string
  precio_costo: string
  precio_venta: string
  stock_minimo: string
  stock_actual: string
  proveedor_id: string
}

const EMPTY_FORM: FormData = {
  nombre: '', descripcion: '', precio_costo: '0', precio_venta: '0',
  stock_minimo: '0', stock_actual: '0', proveedor_id: '',
}

function formatPrecio(n: number) {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

export default function Productos() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos', busqueda],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)

  function abrirCrear() {
    setEditando(null); setForm(EMPTY_FORM); setError(null); setModalOpen(true)
  }

  function abrirEditar(p: Producto) {
    setEditando(p)
    setForm({
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio_costo: String(p.precio_costo),
      precio_venta: String(p.precio_venta),
      stock_minimo: String(p.stock_minimo),
      stock_actual: String(p.stock_actual),
      proveedor_id: p.proveedor_id ? String(p.proveedor_id) : '',
    })
    setError(null); setModalOpen(true)
  }

  function cerrarModal() { setModalOpen(false); setEditando(null); setError(null) }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        precio_costo: parseFloat(data.precio_costo) || 0,
        precio_venta: parseFloat(data.precio_venta) || 0,
        stock_minimo: parseInt(data.stock_minimo) || 0,
        stock_actual: parseInt(data.stock_actual) || 0,
        proveedor_id: data.proveedor_id ? parseInt(data.proveedor_id) : null,
      }
      if (editando) return api.patch(`/api/productos/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/productos/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); cerrarModal() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/productos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); setEliminandoId(null) },
    onError: () => setEliminandoId(null),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Catálogo de productos</h1>
        <div className="flex gap-2">
          <a
            href="/api/productos/export/excel"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Exportar Excel
          </a>
          <button
            onClick={abrirCrear}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Agregar producto
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="mb-4 w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
      />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-right px-4 py-3 font-medium">Precio costo</th>
              <th className="text-right px-4 py-3 font-medium">Precio venta</th>
              <th className="text-right px-4 py-3 font-medium">Stock</th>
              <th className="text-right px-4 py-3 font-medium">Mín.</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {productos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin productos registrados</td>
              </tr>
            )}
            {productos.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-white">{p.nombre}</div>
                  {p.descripcion && <div className="text-xs text-gray-400 truncate max-w-xs">{p.descripcion}</div>}
                </td>
                <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{formatPrecio(p.precio_costo)}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{formatPrecio(p.precio_venta)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={p.stock_actual <= p.stock_minimo && p.stock_minimo > 0
                    ? 'text-red-600 dark:text-red-400 font-medium'
                    : 'text-gray-700 dark:text-gray-300'
                  }>
                    {p.stock_actual}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-400">{p.stock_minimo}</td>
                <td className="px-4 py-3">
                  {eliminandoId === p.id ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>
                      <button onClick={() => eliminar.mutate(p.id)} className="text-red-600 hover:underline font-medium">Sí</button>
                      <button onClick={() => setEliminandoId(null)} className="text-gray-500 hover:underline">No</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-3">
                      <button onClick={() => abrirEditar(p)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => setEliminandoId(p.id)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editando ? 'Editar producto' : 'Nuevo producto'}
              </h2>
            </div>
            <form onSubmit={e => { e.preventDefault(); guardar.mutate(form) }} className="px-6 py-4 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                <textarea rows={2} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {[
                { key: 'precio_costo' as const, label: 'Precio costo ($)' },
                { key: 'precio_venta' as const, label: 'Precio venta ($)' },
                { key: 'stock_minimo' as const, label: 'Stock mínimo' },
                { key: 'stock_actual' as const, label: 'Stock actual' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input type="number" min="0" step={key.startsWith('precio') ? '0.01' : '1'} value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              {error && <p className="col-span-2 text-xs text-red-500">{error}</p>}
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={cerrarModal} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancelar</button>
                <button type="submit" disabled={guardar.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                  {guardar.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar test**

```bash
cd frontend && npm test -- Productos.test
```
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Productos.tsx frontend/src/pages/Productos.test.tsx
git commit -m "feat: página Catálogo de productos con tabla, búsqueda y modal de edición"
```

---

## Task 11: Página Clientes

**Files:**
- Create: `frontend/src/pages/Clientes.tsx`
- Create: `frontend/src/pages/Clientes.test.tsx`
- Modify: `frontend/src/router.tsx` (agregar import y actualizar)

- [ ] **Step 1: Escribir `frontend/src/pages/Clientes.test.tsx` (falla)**

```typescript
import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Clientes from './Clientes'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
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

it('muestra lista de clientes', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({
    data: [{ id: 1, nombre: 'Empresa XYZ Ltda.', rut: '76.543.210-K', email: 'contacto@xyz.cl', telefono: null, direccion: null, notas: null, created_at: '' }],
  })
  render(wrap(<Clientes />))
  await waitFor(() => expect(screen.getByText('Empresa XYZ Ltda.')).toBeInTheDocument())
  expect(screen.getByText('76.543.210-K')).toBeInTheDocument()
})

it('muestra botón Agregar cliente', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({ data: [] })
  render(wrap(<Clientes />))
  await waitFor(() => expect(screen.getByText('Agregar cliente')).toBeInTheDocument())
})
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

```bash
cd frontend && npm test -- Clientes.test
```
Expected: FAIL

- [ ] **Step 3: Crear `frontend/src/pages/Clientes.tsx`**

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Cliente } from '../types'

type FormData = {
  nombre: string
  rut: string
  email: string
  telefono: string
  direccion: string
  notas: string
}

const EMPTY_FORM: FormData = { nombre: '', rut: '', email: '', telefono: '', direccion: '', notas: '' }

export default function Clientes() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ['clientes', busqueda],
    queryFn: () => api.get(`/api/clientes/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)

  function abrirCrear() {
    setEditando(null); setForm(EMPTY_FORM); setError(null); setModalOpen(true)
  }

  function abrirEditar(c: Cliente) {
    setEditando(c)
    setForm({ nombre: c.nombre, rut: c.rut ?? '', email: c.email ?? '', telefono: c.telefono ?? '', direccion: c.direccion ?? '', notas: c.notas ?? '' })
    setError(null); setModalOpen(true)
  }

  function cerrarModal() { setModalOpen(false); setEditando(null); setError(null) }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || null]))
      if (editando) return api.patch(`/api/clientes/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/clientes/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); cerrarModal() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/clientes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); setEliminandoId(null) },
    onError: () => setEliminandoId(null),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Clientes</h1>
        <div className="flex gap-2">
          <a
            href="/api/clientes/export/excel"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Exportar Excel
          </a>
          <button
            onClick={abrirCrear}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Agregar cliente
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre o RUT..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="mb-4 w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
      />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">RUT</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin clientes registrados</td>
              </tr>
            )}
            {clientes.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{c.nombre}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.rut ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.email ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.telefono ?? '—'}</td>
                <td className="px-4 py-3">
                  {eliminandoId === c.id ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>
                      <button onClick={() => eliminar.mutate(c.id)} className="text-red-600 hover:underline font-medium">Sí</button>
                      <button onClick={() => setEliminandoId(null)} className="text-gray-500 hover:underline">No</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-3">
                      <button onClick={() => abrirEditar(c)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => setEliminandoId(c.id)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editando ? 'Editar cliente' : 'Nuevo cliente'}
              </h2>
            </div>
            <form onSubmit={e => { e.preventDefault(); guardar.mutate(form) }} className="px-6 py-4 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {[
                { key: 'rut' as const, label: 'RUT', placeholder: '76.123.456-7' },
                { key: 'email' as const, label: 'Email', placeholder: 'contacto@empresa.cl' },
                { key: 'telefono' as const, label: 'Teléfono', placeholder: '+56 9 1234 5678' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input type="text" placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección</label>
                <input type="text" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
                <textarea rows={3} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {error && <p className="col-span-2 text-xs text-red-500">{error}</p>}
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={cerrarModal} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancelar</button>
                <button type="submit" disabled={guardar.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                  {guardar.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Actualizar `frontend/src/router.tsx` para incluir los 3 imports**

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Users from './pages/Users'
import Proveedores from './pages/Proveedores'
import Productos from './pages/Productos'
import Clientes from './pages/Clientes'
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
      { path: 'proveedores', element: <Proveedores /> },
      { path: 'catalogo', element: <Productos /> },
      { path: 'clientes', element: <Clientes /> },
    ],
  },
])
```

- [ ] **Step 5: Ejecutar test de Clientes**

```bash
cd frontend && npm test -- Clientes.test
```
Expected: 2 tests PASS

- [ ] **Step 6: Ejecutar suite completa de frontend**

```bash
cd frontend && npm test -- --run
```
Expected: all tests PASS (Users: 3, Proveedores: 2, Productos: 2, Clientes: 2 + login: 2 = 11 tests aprox)

- [ ] **Step 7: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit
```
Expected: sin errores

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Clientes.tsx frontend/src/pages/Clientes.test.tsx \
  frontend/src/router.tsx
git commit -m "feat: página Clientes con tabla, búsqueda por nombre/RUT y modal de edición"
```

---

## Self-review checklist completado

**Cobertura de spec:**
- ✅ Catálogo: nombre, descripción, precio costo/venta, stock mínimo, proveedor asociado (FK nullable)
- ✅ Catálogo: búsqueda por nombre (`GET /api/productos/buscar?q=` para autocomplete Fase 3)
- ✅ Catálogo: exportar Excel
- ✅ Clientes: nombre, RUT, email, teléfono, dirección, notas
- ✅ Clientes: CRUD completo; vendedor puede crear/editar pero NO eliminar
- ✅ Proveedores: nombre, RUT, contacto, email, teléfono, notas
- ✅ Proveedores: vendedor sin acceso (403)
- ✅ Excel export en los 3 módulos
- ℹ️ Historial de cotizaciones/notas/facturas por cliente: se implementa en Fase 3 cuando existan esas tablas

**Consistencia de tipos:**
- `ProveedorOut`, `ProductoOut`, `ClienteOut` — consistentes entre esquemas y tipos TypeScript
- `_verificar_permiso()` presente en los 3 routers
- Módulo `"catalogo"` (no `"productos"`) en permisos — consistente con `MODULES` de Phase 1
- Rutas frontend: `catalogo`, `proveedores`, `clientes` — coinciden con `Sidebar.tsx`
