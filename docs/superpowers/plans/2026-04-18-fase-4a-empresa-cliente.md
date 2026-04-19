# Fase 4a — Empresa + Cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Empresa` as a new data master, extend `Cliente` with new fields and empresa association, and propagate `empresa_id` to cotizaciones.

**Architecture:** New `Empresa` model (empresa.py) with full CRUD. `Cliente` model extended with `empresa_id` FK and operational fields. Alembic migration handles all DB changes including rename of `clientes.direccion` → `clientes.direccion_despacho`. Frontend gets an Empresas page (mirrors Proveedores pattern) and updated Clientes modal with empresa dropdown + read-only inherited fields.

**Tech Stack:** FastAPI, SQLAlchemy (mapped types), Alembic, Pydantic v2, React + TypeScript, React Query, Tailwind CSS, Vitest

---

## File Map

### New Files
| File | Purpose |
|---|---|
| `backend/migrations/versions/d5e2f9b3c8a1_add_empresas_extend_clientes.py` | DB migration |
| `backend/app/models/empresa.py` | Empresa SQLAlchemy model |
| `backend/app/schemas/empresa.py` | Pydantic schemas for Empresa |
| `backend/app/api/empresas.py` | Empresa CRUD router |
| `backend/tests/test_empresas.py` | Empresa API tests |
| `frontend/src/pages/Empresas.tsx` | Empresas page (list + modal) |
| `frontend/src/pages/Empresas.test.tsx` | Empresas page tests |

### Modified Files
| File | Change |
|---|---|
| `backend/app/models/cliente.py` | Add empresa_id FK + 9 new fields; rename direccion→direccion_despacho |
| `backend/app/models/cotizacion.py` | Add empresa_id FK + empresa relationship |
| `backend/app/schemas/cliente.py` | Add new fields + EmpresaRef nested in ClienteOut |
| `backend/app/schemas/cotizacion.py` | Add empresa_id to Create/Update/Out; add EmpresaRef in Out |
| `backend/app/api/clientes.py` | Add empresa_id filter; update Excel export column name |
| `backend/app/api/cotizaciones.py` | Accept empresa_id in create/update payload |
| `backend/app/core/permissions.py` | Add "empresas" to MODULES + _DEFAULT for all roles |
| `backend/app/main.py` | Register empresas router |
| `backend/tests/conftest.py` | Import empresa model in setup_test_db |
| `backend/tests/test_clientes.py` | Add empresa-related tests |
| `frontend/src/types/index.ts` | Add Empresa, EmpresaRef; extend Cliente; add 'empresas' to Module |
| `frontend/src/router.tsx` | Add /empresas route |
| `frontend/src/components/layout/Sidebar.tsx` | Add Empresas nav item |
| `frontend/src/pages/Clientes.tsx` | Add empresa dropdown + inherited read-only fields + new form fields |
| `frontend/src/pages/Clientes.test.tsx` | Add empresa-related tests |
| `frontend/src/pages/CotizacionDetalle.tsx` | Add empresa dropdown + auto-fill from cliente |

---

## Task 1: Alembic Migration

**Files:**
- Create: `backend/migrations/versions/d5e2f9b3c8a1_add_empresas_extend_clientes.py`

- [ ] **Step 1: Create migration file**

```python
"""add empresas table, extend clientes, add empresa_id to cotizaciones

Revision ID: d5e2f9b3c8a1
Revises: c4d1e8f2a9b5
Create Date: 2026-04-18 21:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "d5e2f9b3c8a1"
down_revision: Union[str, None] = "c4d1e8f2a9b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # empresas table
    op.create_table(
        "empresas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("razon_social", sa.String(255), nullable=True),
        sa.Column("rut", sa.String(20), nullable=True),
        sa.Column("forma_pago", sa.String(100), nullable=True),
        sa.Column("prioridad", sa.String(50), nullable=True),
        sa.Column("sector", sa.String(100), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("nota_cobranza", sa.Text(), nullable=True),
        sa.Column("ubicacion", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rut"),
    )
    op.create_index("ix_empresas_rut", "empresas", ["rut"])

    # rename clientes.direccion → clientes.direccion_despacho
    op.execute("ALTER TABLE clientes RENAME COLUMN direccion TO direccion_despacho")

    # extend clientes
    op.add_column("clientes", sa.Column("empresa_id", sa.Integer(), nullable=True))
    op.add_column("clientes", sa.Column("recibe_correo", sa.Boolean(), nullable=False, server_default=sa.text("1")))
    op.add_column("clientes", sa.Column("forma_pago", sa.String(100), nullable=True))
    op.add_column("clientes", sa.Column("despacho_o_retiro", sa.String(20), nullable=True))
    op.add_column("clientes", sa.Column("comuna", sa.String(100), nullable=True))
    op.add_column("clientes", sa.Column("ultimo_contacto", sa.Date(), nullable=True))
    op.add_column("clientes", sa.Column("forma_captacion", sa.String(100), nullable=True))
    op.add_column("clientes", sa.Column("compromiso", sa.Text(), nullable=True))
    op.add_column("clientes", sa.Column("es_nuevo", sa.Boolean(), nullable=False, server_default=sa.text("0")))
    op.create_foreign_key(
        "fk_clientes_empresa_id", "clientes", "empresas", ["empresa_id"], ["id"], ondelete="SET NULL"
    )

    # add empresa_id to cotizaciones
    op.add_column("cotizaciones", sa.Column("empresa_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_cotizaciones_empresa_id", "cotizaciones", "empresas", ["empresa_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_cotizaciones_empresa_id", "cotizaciones", type_="foreignkey")
    op.drop_column("cotizaciones", "empresa_id")

    op.drop_constraint("fk_clientes_empresa_id", "clientes", type_="foreignkey")
    op.drop_column("clientes", "compromiso")
    op.drop_column("clientes", "forma_captacion")
    op.drop_column("clientes", "ultimo_contacto")
    op.drop_column("clientes", "comuna")
    op.drop_column("clientes", "despacho_o_retiro")
    op.drop_column("clientes", "forma_pago")
    op.drop_column("clientes", "recibe_correo")
    op.drop_column("clientes", "es_nuevo")
    op.drop_column("clientes", "empresa_id")
    op.execute("ALTER TABLE clientes RENAME COLUMN direccion_despacho TO direccion")

    op.drop_index("ix_empresas_rut", table_name="empresas")
    op.drop_table("empresas")
```

- [ ] **Step 2: Apply migration**

Run inside the backend container or locally with the venv active:
```bash
cd backend && alembic upgrade head
```
Expected: `Running upgrade c4d1e8f2a9b5 -> d5e2f9b3c8a1, add empresas table...`

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/versions/d5e2f9b3c8a1_add_empresas_extend_clientes.py
git commit -m "feat: migration add empresas, extend clientes, empresa_id in cotizaciones"
```

---

## Task 2: Backend Models

**Files:**
- Create: `backend/app/models/empresa.py`
- Modify: `backend/app/models/cliente.py`
- Modify: `backend/app/models/cotizacion.py`

- [ ] **Step 1: Create `backend/app/models/empresa.py`**

```python
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Empresa(Base):
    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rut: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    forma_pago: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prioridad: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nota_cobranza: Mapped[str | None] = mapped_column(Text, nullable=True)
    ubicacion: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    clientes: Mapped[list["Cliente"]] = relationship("Cliente", back_populates="empresa")
```

- [ ] **Step 2: Replace `backend/app/models/cliente.py`**

```python
from datetime import datetime, date, timezone
from sqlalchemy import String, Text, DateTime, Date, Boolean, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    rut: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(50), nullable=True)
    direccion_despacho: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    recibe_correo: Mapped[bool] = mapped_column(Boolean, default=True)
    forma_pago: Mapped[str | None] = mapped_column(String(100), nullable=True)
    despacho_o_retiro: Mapped[str | None] = mapped_column(String(20), nullable=True)
    comuna: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ultimo_contacto: Mapped[date | None] = mapped_column(Date, nullable=True)
    forma_captacion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    compromiso: Mapped[str | None] = mapped_column(Text, nullable=True)
    es_nuevo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    empresa: Mapped["Empresa | None"] = relationship("Empresa", back_populates="clientes")
```

- [ ] **Step 3: Add `empresa_id` to `backend/app/models/cotizacion.py`**

After line 14 (`vendedor_id: Mapped[int]...`), add:
```python
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
```

After the `vendedor` relationship, add:
```python
    empresa: Mapped["Empresa | None"] = relationship("Empresa")
```

Also add `Empresa` to the imports at the top (it will be a forward reference via string — no import needed since SQLAlchemy uses lazy resolution).

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/empresa.py backend/app/models/cliente.py backend/app/models/cotizacion.py
git commit -m "feat: Empresa model, extend Cliente model, empresa_id in Cotizacion"
```

---

## Task 3: Backend Schemas

**Files:**
- Create: `backend/app/schemas/empresa.py`
- Modify: `backend/app/schemas/cliente.py`
- Modify: `backend/app/schemas/cotizacion.py`

- [ ] **Step 1: Create `backend/app/schemas/empresa.py`**

```python
from datetime import datetime
from pydantic import BaseModel


class EmpresaBase(BaseModel):
    nombre: str
    razon_social: str | None = None
    rut: str | None = None
    forma_pago: str | None = None
    prioridad: str | None = None
    sector: str | None = None
    email: str | None = None
    nota_cobranza: str | None = None
    ubicacion: str | None = None


class EmpresaCreate(EmpresaBase):
    pass


class EmpresaUpdate(BaseModel):
    nombre: str | None = None
    razon_social: str | None = None
    rut: str | None = None
    forma_pago: str | None = None
    prioridad: str | None = None
    sector: str | None = None
    email: str | None = None
    nota_cobranza: str | None = None
    ubicacion: str | None = None


class EmpresaRef(BaseModel):
    id: int
    nombre: str
    razon_social: str | None = None
    rut: str | None = None
    model_config = {"from_attributes": True}


class EmpresaOut(EmpresaBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Replace `backend/app/schemas/cliente.py`**

```python
from datetime import datetime, date
from pydantic import BaseModel
from app.schemas.empresa import EmpresaRef


class ClienteBase(BaseModel):
    nombre: str
    rut: str | None = None
    email: str | None = None
    telefono: str | None = None
    direccion_despacho: str | None = None
    notas: str | None = None
    empresa_id: int | None = None
    recibe_correo: bool = True
    forma_pago: str | None = None
    despacho_o_retiro: str | None = None
    comuna: str | None = None
    ultimo_contacto: date | None = None
    forma_captacion: str | None = None
    compromiso: str | None = None
    es_nuevo: bool = False


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nombre: str | None = None
    rut: str | None = None
    email: str | None = None
    telefono: str | None = None
    direccion_despacho: str | None = None
    notas: str | None = None
    empresa_id: int | None = None
    recibe_correo: bool | None = None
    forma_pago: str | None = None
    despacho_o_retiro: str | None = None
    comuna: str | None = None
    ultimo_contacto: date | None = None
    forma_captacion: str | None = None
    compromiso: str | None = None
    es_nuevo: bool | None = None


class ClienteOut(ClienteBase):
    id: int
    empresa: EmpresaRef | None = None
    created_at: datetime
    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Update `backend/app/schemas/cotizacion.py`**

Add `empresa_id: int | None = None` to `CotizacionCreate` (after `correo` field):
```python
class CotizacionCreate(BaseModel):
    cliente_id: int
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    estado: str = "no_definido"
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    lineas: list[CotizacionLineaCreate] = []
```

Add `empresa_id: int | None = None` to `CotizacionUpdate` (after `vendedor_id` field):
```python
class CotizacionUpdate(BaseModel):
    cliente_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    estado: str | None = None
    nota: str | None = None
    correo: str | None = None
    vendedor_id: int | None = None
    empresa_id: int | None = None
```

Add import at top of file and `EmpresaRef` nested in `CotizacionOut` and `CotizacionListOut`:
```python
from app.schemas.empresa import EmpresaRef
```

Add to `CotizacionOut` after `vendedor: VendedorMinOut | None = None`:
```python
    empresa: EmpresaRef | None = None
```

Add to `CotizacionListOut` after `vendedor: VendedorMinOut | None = None`:
```python
    empresa: EmpresaRef | None = None
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/empresa.py backend/app/schemas/cliente.py backend/app/schemas/cotizacion.py
git commit -m "feat: Empresa schemas, extend Cliente schemas, empresa_id in Cotizacion schemas"
```

---

## Task 4: Permissions + Main Registration

**Files:**
- Modify: `backend/app/core/permissions.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add `empresas` to `backend/app/core/permissions.py`**

Change `MODULES` list (line 5-8):
```python
MODULES = [
    "catalogo", "clientes", "proveedores", "empresas", "cotizaciones", "nota_venta",
    "facturas", "ordenes_compra", "inventario", "rrhh", "dashboard", "usuarios",
]
```

Add `empresas` entry to `_DEFAULT` for each role:

In `subadmin` block, add after `"proveedores"` line:
```python
        "empresas":       {"view": True,  "create": True,  "edit": True,  "delete": True},
```

In `vendedor` block, add after `"proveedores"` line:
```python
        "empresas":       {"view": True,  "create": False, "edit": False, "delete": False},
```

- [ ] **Step 2: Register empresas router in `backend/app/main.py`**

Add import after existing imports:
```python
from app.api import empresas
```

Add router after `clientes` router line:
```python
app.include_router(empresas.router, prefix="/api/empresas", tags=["empresas"])
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/permissions.py backend/app/main.py
git commit -m "feat: register empresas module in permissions and main router"
```

---

## Task 5: TDD — Empresa API

**Files:**
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_empresas.py`
- Create: `backend/app/api/empresas.py`

- [ ] **Step 1: Update `backend/tests/conftest.py` — add empresa model import**

In the `setup_test_db` fixture, add after `import app.models.cliente`:
```python
    import app.models.empresa  # noqa: F401
```

- [ ] **Step 2: Write `backend/tests/test_empresas.py`**

```python
def test_listar_empresas_sin_auth(client):
    r = client.get("/api/empresas/")
    assert r.status_code == 401


def test_crear_empresa(client, admin_token):
    r = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa A", "rut": "76.123.456-7", "razon_social": "Empresa A Ltda."},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Empresa A"
    assert data["rut"] == "76.123.456-7"
    assert data["razon_social"] == "Empresa A Ltda."
    assert "id" in data


def test_crear_empresa_rut_duplicado(client, admin_token):
    client.post("/api/empresas/", json={"nombre": "Emp A", "rut": "76.000.001-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.post("/api/empresas/", json={"nombre": "Emp B", "rut": "76.000.001-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409


def test_listar_empresas(client, admin_token):
    client.post("/api/empresas/", json={"nombre": "Emp X"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/empresas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_buscar_empresa_por_nombre(client, admin_token):
    client.post("/api/empresas/", json={"nombre": "Constructora XYZ"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/empresas/?q=constructora", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert any(e["nombre"] == "Constructora XYZ" for e in r.json())


def test_buscar_empresa_por_rut(client, admin_token):
    client.post("/api/empresas/", json={"nombre": "Emp Z", "rut": "77.777.777-7"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/empresas/?q=77.777.777", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert any(e["rut"] == "77.777.777-7" for e in r.json())


def test_obtener_empresa(client, admin_token):
    r = client.post("/api/empresas/", json={"nombre": "Emp Y"}, headers={"Authorization": f"Bearer {admin_token}"})
    eid = r.json()["id"]
    r2 = client.get(f"/api/empresas/{eid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Emp Y"


def test_obtener_empresa_inexistente(client, admin_token):
    r = client.get("/api/empresas/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


def test_actualizar_empresa(client, admin_token):
    r = client.post("/api/empresas/", json={"nombre": "Antigua"}, headers={"Authorization": f"Bearer {admin_token}"})
    eid = r.json()["id"]
    r2 = client.patch(f"/api/empresas/{eid}", json={"nombre": "Nueva", "sector": "Construcción"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Nueva"
    assert r2.json()["sector"] == "Construcción"


def test_eliminar_empresa(client, admin_token):
    r = client.post("/api/empresas/", json={"nombre": "Para Borrar"}, headers={"Authorization": f"Bearer {admin_token}"})
    eid = r.json()["id"]
    r2 = client.delete(f"/api/empresas/{eid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/empresas/{eid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404


def test_eliminar_empresa_con_clientes_falla(client, admin_token):
    emp = client.post("/api/empresas/", json={"nombre": "Emp Con Clientes"}, headers={"Authorization": f"Bearer {admin_token}"}).json()
    client.post("/api/clientes/", json={"nombre": "Cliente X", "empresa_id": emp["id"]}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.delete(f"/api/empresas/{emp['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409
    assert "clientes asociados" in r.json()["detail"]


def test_vendedor_puede_ver_empresas(client, vendedor_token):
    r = client.get("/api/empresas/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_vendedor_no_puede_crear_empresa(client, vendedor_token):
    r = client.post("/api/empresas/", json={"nombre": "Intento"}, headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403
```

- [ ] **Step 3: Run tests — expect FAIL (module not found)**

```bash
cd backend && python -m pytest tests/test_empresas.py -v
```
Expected: `FAILED` — `ModuleNotFoundError: No module named 'app.api.empresas'`

- [ ] **Step 4: Create `backend/app/api/empresas.py`**

```python
from io import BytesIO

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.empresa import Empresa
from app.models.user import User
from app.schemas.empresa import EmpresaCreate, EmpresaOut, EmpresaUpdate

router = APIRouter()


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    empresas = db.query(Empresa).order_by(Empresa.nombre).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Empresas"
    ws.append(["ID", "Nombre", "Razón Social", "RUT", "Forma Pago", "Prioridad", "Sector", "Email", "Ubicación"])
    for e in empresas:
        ws.append([
            e.id, e.nombre, e.razon_social or "", e.rut or "",
            e.forma_pago or "", e.prioridad or "", e.sector or "",
            e.email or "", e.ubicacion or "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=empresas.xlsx"},
    )


@router.get("/", response_model=list[EmpresaOut])
def listar_empresas(
    q: str = Query(""),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    query = db.query(Empresa)
    if q:
        like = f"%{q}%"
        query = query.filter(Empresa.nombre.ilike(like) | Empresa.rut.ilike(like))
    return query.order_by(Empresa.nombre).all()


@router.post("/", response_model=EmpresaOut, status_code=status.HTTP_201_CREATED)
def crear_empresa(
    body: EmpresaCreate,
    perms: tuple[User, Session] = require_permission("empresas", "create"),
):
    _, db = perms
    empresa = Empresa(**body.model_dump())
    db.add(empresa)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(empresa)
    return empresa


@router.get("/{empresa_id}", response_model=EmpresaOut)
def obtener_empresa(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return e


@router.patch("/{empresa_id}", response_model=EmpresaOut)
def actualizar_empresa(
    empresa_id: int,
    body: EmpresaUpdate,
    perms: tuple[User, Session] = require_permission("empresas", "edit"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(e, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(e)
    return e


@router.delete("/{empresa_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_empresa(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "delete"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    if e.clientes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar: tiene clientes asociados",
        )
    db.delete(e)
    db.commit()
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd backend && python -m pytest tests/test_empresas.py -v
```
Expected: all tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/tests/conftest.py backend/tests/test_empresas.py backend/app/api/empresas.py
git commit -m "feat: Empresa CRUD API with tests"
```

---

## Task 6: TDD — Update Clientes API

**Files:**
- Modify: `backend/app/api/clientes.py`
- Modify: `backend/tests/test_clientes.py`

- [ ] **Step 1: Write failing tests — add to end of `backend/tests/test_clientes.py`**

```python
def test_crear_cliente_con_empresa(client, admin_token):
    emp = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa Z", "rut": "76.999.999-9"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Juan Pérez", "empresa_id": emp["id"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["empresa_id"] == emp["id"]
    assert data["empresa"]["nombre"] == "Empresa Z"
    assert data["empresa"]["rut"] == "76.999.999-9"


def test_filtrar_clientes_por_empresa(client, admin_token):
    emp = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa Filtro"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    client.post("/api/clientes/", json={"nombre": "Cliente 1", "empresa_id": emp["id"]}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/clientes/", json={"nombre": "Cliente Otro"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get(f"/api/clientes/?empresa_id={emp['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["nombre"] == "Cliente 1"


def test_cliente_out_incluye_empresa_none_si_sin_empresa(client, admin_token):
    r = client.post("/api/clientes/", json={"nombre": "Sin Empresa"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201
    assert r.json()["empresa"] is None


def test_crear_cliente_con_nuevos_campos(client, admin_token):
    r = client.post(
        "/api/clientes/",
        json={
            "nombre": "María García",
            "recibe_correo": False,
            "forma_pago": "Crédito 30 días",
            "despacho_o_retiro": "despacho",
            "comuna": "Las Condes",
            "es_nuevo": True,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["recibe_correo"] is False
    assert data["forma_pago"] == "Crédito 30 días"
    assert data["despacho_o_retiro"] == "despacho"
    assert data["comuna"] == "Las Condes"
    assert data["es_nuevo"] is True
```

- [ ] **Step 2: Run new tests — expect FAIL**

```bash
cd backend && python -m pytest tests/test_clientes.py::test_crear_cliente_con_empresa tests/test_clientes.py::test_filtrar_clientes_por_empresa -v
```
Expected: `FAILED` — likely `422 Unprocessable Entity` or wrong response shape (empresa field missing from ClienteOut)

- [ ] **Step 3: Replace `backend/app/api/clientes.py`**

```python
from io import BytesIO

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.cliente import Cliente
from app.models.user import User
from app.schemas.cliente import ClienteCreate, ClienteOut, ClienteUpdate

router = APIRouter()


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    _, db = perms
    clientes = db.query(Cliente).order_by(Cliente.nombre).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Clientes"
    ws.append(["ID", "Nombre", "RUT", "Email", "Teléfono", "Empresa", "Dirección Despacho", "Notas"])
    for c in clientes:
        ws.append([
            c.id, c.nombre, c.rut or "", c.email or "", c.telefono or "",
            c.empresa.nombre if c.empresa else "",
            c.direccion_despacho or "", c.notas or "",
        ])
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
    empresa_id: int | None = Query(None),
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    _, db = perms
    query = db.query(Cliente)
    if q:
        query = query.filter(Cliente.nombre.ilike(f"%{q}%") | Cliente.rut.ilike(f"%{q}%"))
    if empresa_id is not None:
        query = query.filter(Cliente.empresa_id == empresa_id)
    return query.order_by(Cliente.nombre).all()


@router.post("/", response_model=ClienteOut, status_code=status.HTTP_201_CREATED)
def crear_cliente(
    body: ClienteCreate,
    perms: tuple[User, Session] = require_permission("clientes", "create"),
):
    _, db = perms
    cliente = Cliente(**body.model_dump())
    db.add(cliente)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(cliente)
    return cliente


@router.get("/{cliente_id}", response_model=ClienteOut)
def obtener_cliente(
    cliente_id: int,
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    _, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    return c


@router.patch("/{cliente_id}", response_model=ClienteOut)
def actualizar_cliente(
    cliente_id: int,
    body: ClienteUpdate,
    perms: tuple[User, Session] = require_permission("clientes", "edit"),
):
    _, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(c, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(c)
    return c


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cliente(
    cliente_id: int,
    perms: tuple[User, Session] = require_permission("clientes", "delete"),
):
    _, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    db.delete(c)
    db.commit()
```

- [ ] **Step 4: Run all clientes tests — expect PASS**

```bash
cd backend && python -m pytest tests/test_clientes.py -v
```
Expected: all tests `PASSED`

- [ ] **Step 5: Run full test suite — no regressions**

```bash
cd backend && python -m pytest -v
```
Expected: all tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/clientes.py backend/tests/test_clientes.py
git commit -m "feat: update clientes API — empresa_id filter, new fields, EmpresaRef in ClienteOut"
```

---

## Task 7: Update Cotizaciones (empresa_id)

**Files:**
- Modify: `backend/app/api/cotizaciones.py`

`crear_cotizacion` manually constructs `Cotizacion(...)` — `empresa_id` must be added explicitly. `actualizar_cotizacion` uses `setattr` loop from `model_dump` so it handles `empresa_id` automatically once it's in the schema. Queries that return full cotizacion data need `joinedload(Cotizacion.empresa)`.

- [ ] **Step 1: Add `empresa_id` to `Cotizacion(...)` in `crear_cotizacion`**

In `backend/app/api/cotizaciones.py`, find the `Cotizacion(...)` constructor call (around line 164). Add `empresa_id=body.empresa_id`:

```python
    cotizacion = Cotizacion(
        numero=numero,
        cliente_id=body.cliente_id,
        vendedor_id=vendedor_id,
        contacto=body.contacto,
        fecha=body.fecha or date.today(),
        estado=body.estado,
        nota=body.nota,
        correo=body.correo,
        empresa_id=body.empresa_id,
    )
```

- [ ] **Step 2: Add `joinedload(Cotizacion.empresa)` to cotizacion queries**

In every `db.query(Cotizacion).options(joinedload(...))` call that returns `CotizacionOut` or `CotizacionListOut`, add `joinedload(Cotizacion.empresa)`. There are three locations:

1. `exportar_excel` list query — no schema return, skip
2. `listar_cotizaciones` query (around line 139) — add `.options(..., joinedload(Cotizacion.empresa))`
3. `obtener_cotizacion` query (around line 195) — add `joinedload(Cotizacion.empresa)`
4. The return query in `crear_cotizacion` (after flush) — add `joinedload(Cotizacion.empresa)`
5. The return query in `actualizar_cotizacion` (around line 221) — add `joinedload(Cotizacion.empresa)`

Also add `from sqlalchemy.orm import joinedload` — it's already imported.

Add `from app.models.empresa import Empresa` is not needed since SQLAlchemy resolves the relationship by string name. But you do need the `Cotizacion.empresa` attribute to be defined (done in Task 2).

- [ ] **Step 3: Run existing cotizaciones tests**

```bash
cd backend && python -m pytest tests/test_cotizaciones.py -v
```
Expected: all tests `PASSED` (empresa_id defaults to None, backward compatible)

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/cotizaciones.py backend/app/schemas/cotizacion.py
git commit -m "feat: add empresa_id to cotizaciones — create/update/out + joinedload"
```

---

## Task 8: Frontend Types + Router + Sidebar

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update `frontend/src/types/index.ts`**

Add `'empresas'` to the `Module` type:
```typescript
export type Module =
  | 'catalogo' | 'clientes' | 'proveedores' | 'empresas' | 'cotizaciones'
  | 'nota_venta' | 'facturas' | 'ordenes_compra' | 'inventario'
  | 'rrhh' | 'dashboard' | 'usuarios'
```

Add after the `Proveedor` interface:
```typescript
export interface EmpresaRef {
  id: number
  nombre: string
  razon_social: string | null
  rut: string | null
}

export interface Empresa {
  id: number
  nombre: string
  razon_social: string | null
  rut: string | null
  forma_pago: string | null
  prioridad: string | null
  sector: string | null
  email: string | null
  nota_cobranza: string | null
  ubicacion: string | null
  created_at: string
}
```

Replace `Cliente` interface:
```typescript
export interface Cliente {
  id: number
  nombre: string
  rut: string | null
  email: string | null
  telefono: string | null
  direccion_despacho: string | null
  notas: string | null
  empresa_id: number | null
  empresa: EmpresaRef | null
  recibe_correo: boolean
  forma_pago: string | null
  despacho_o_retiro: string | null
  comuna: string | null
  ultimo_contacto: string | null
  forma_captacion: string | null
  compromiso: string | null
  es_nuevo: boolean
  created_at: string
}
```

Also add `empresa_id: number | null` and `empresa: EmpresaRef | null` to `Cotizacion` interface after `vendedor_id`:
```typescript
  empresa_id: number | null
  empresa?: EmpresaRef | null
```

- [ ] **Step 2: Update `frontend/src/router.tsx`**

Add import:
```typescript
import Empresas from './pages/Empresas'
```

Add route inside children array, before `proveedores`:
```typescript
{ path: 'empresas', element: <Empresas /> },
```

- [ ] **Step 3: Update `frontend/src/components/layout/Sidebar.tsx`**

Add `Building2` to lucide-react imports (it represents a company/building icon):
```typescript
import {
  LayoutDashboard, FileText, Users, Package, ShoppingCart,
  Warehouse, Receipt, Truck, UserCog, Building2, ChevronLeft, ChevronRight, LogOut, Sun, Moon
} from 'lucide-react'
```

Add to `NAV` array after `clientes`:
```typescript
  { to: '/empresas',   icon: Building2,      label: 'Empresas' },
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/router.tsx frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: add Empresa types, /empresas route and sidebar nav item"
```

---

## Task 9: Frontend Empresas Page

**Files:**
- Create: `frontend/src/pages/Empresas.tsx`
- Create: `frontend/src/pages/Empresas.test.tsx`

- [ ] **Step 1: Write failing test `frontend/src/pages/Empresas.test.tsx`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Empresas from './Empresas'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const { api } = await import('../lib/api')

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue({ data: [] })
})

describe('Empresas', () => {
  it('renderiza título', async () => {
    wrap(<Empresas />)
    expect(await screen.findByText('Empresas')).toBeTruthy()
  })

  it('muestra mensaje cuando no hay empresas', async () => {
    wrap(<Empresas />)
    expect(await screen.findByText(/sin empresas/i)).toBeTruthy()
  })

  it('renderiza empresa de la lista', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{ id: 1, nombre: 'Constructora ABC', rut: '76.111.111-1', razon_social: null, forma_pago: null, prioridad: null, sector: null, email: null, nota_cobranza: null, ubicacion: null, created_at: '2026-01-01T00:00:00Z' }],
    })
    wrap(<Empresas />)
    expect(await screen.findByText('Constructora ABC')).toBeTruthy()
  })

  it('abre modal al hacer clic en Agregar', async () => {
    wrap(<Empresas />)
    await screen.findByText('Empresas')
    fireEvent.click(screen.getByText(/agregar empresa/i))
    expect(screen.getByText(/nueva empresa/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd frontend && npx vitest run src/pages/Empresas.test.tsx
```
Expected: `FAILED` — `Cannot find module './Empresas'`

- [ ] **Step 3: Create `frontend/src/pages/Empresas.tsx`**

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Empresa } from '../types'

type FormData = {
  nombre: string
  razon_social: string
  rut: string
  forma_pago: string
  prioridad: string
  sector: string
  email: string
  nota_cobranza: string
  ubicacion: string
}

const EMPTY_FORM: FormData = {
  nombre: '', razon_social: '', rut: '', forma_pago: '',
  prioridad: '', sector: '', email: '', nota_cobranza: '', ubicacion: '',
}

export default function Empresas() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')

  const { data: empresas = [], isLoading } = useQuery<Empresa[]>({
    queryKey: ['empresas', busqueda],
    queryFn: () => api.get(`/api/empresas/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Empresa | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function abrirCrear() {
    setEditando(null); setForm(EMPTY_FORM); setError(null); setModalOpen(true)
  }

  function abrirEditar(e: Empresa) {
    setEditando(e)
    setForm({
      nombre: e.nombre, razon_social: e.razon_social ?? '', rut: e.rut ?? '',
      forma_pago: e.forma_pago ?? '', prioridad: e.prioridad ?? '', sector: e.sector ?? '',
      email: e.email ?? '', nota_cobranza: e.nota_cobranza ?? '', ubicacion: e.ubicacion ?? '',
    })
    setError(null); setModalOpen(true)
  }

  function cerrarModal() { setModalOpen(false); setEditando(null); setError(null) }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || null]))
      if (editando) return api.patch(`/api/empresas/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/empresas/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresas'] }); cerrarModal() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/empresas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresas'] }); setEliminandoId(null); setDeleteError(null) },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Empresas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => api.get('/api/empresas/export/excel', { responseType: 'blob' }).then(r => {
              const url = URL.createObjectURL(r.data)
              const a = document.createElement('a'); a.href = url; a.download = 'empresas.xlsx'; a.click()
              URL.revokeObjectURL(url)
            })}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Exportar Excel
          </button>
          <button
            onClick={abrirCrear}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Agregar empresa
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
              <th className="text-left px-4 py-3 font-medium">Razón Social</th>
              <th className="text-left px-4 py-3 font-medium">RUT</th>
              <th className="text-left px-4 py-3 font-medium">Forma Pago</th>
              <th className="text-left px-4 py-3 font-medium">Prioridad</th>
              <th className="text-left px-4 py-3 font-medium">Sector</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {empresas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin empresas registradas</td>
              </tr>
            )}
            {empresas.map(e => (
              <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{e.nombre}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.razon_social ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.rut ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.forma_pago ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.prioridad ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.sector ?? '—'}</td>
                <td className="px-4 py-3">
                  {eliminandoId === e.id ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      {deleteError
                        ? <span className="text-red-500">{deleteError}</span>
                        : <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>}
                      <button onClick={() => eliminar.mutate(e.id)} disabled={eliminar.isPending} className="text-red-600 hover:underline font-medium disabled:opacity-50">Sí</button>
                      <button onClick={() => { setEliminandoId(null); setDeleteError(null) }} className="text-gray-500 hover:underline">No</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-3">
                      <button onClick={() => abrirEditar(e)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => { setEliminandoId(e.id); setDeleteError(null) }} className="text-xs text-red-500 hover:underline">Eliminar</button>
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
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editando ? 'Editar empresa' : 'Nueva empresa'}
              </h2>
            </div>
            <form onSubmit={ev => { ev.preventDefault(); guardar.mutate(form) }} className="px-6 py-4 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {(([
                { key: 'razon_social', label: 'Razón Social' },
                { key: 'rut', label: 'RUT', placeholder: '76.123.456-7' },
                { key: 'forma_pago', label: 'Forma de Pago' },
                { key: 'prioridad', label: 'Prioridad' },
                { key: 'sector', label: 'Sector' },
                { key: 'email', label: 'Email' },
              ]) as { key: keyof FormData; label: string; placeholder?: string }[]).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input type="text" placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Ubicación sede central</label>
                <input type="text" value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nota Cobranza</label>
                <textarea rows={2} value={form.nota_cobranza} onChange={e => setForm(f => ({ ...f, nota_cobranza: e.target.value }))}
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

- [ ] **Step 4: Run test — expect PASS**

```bash
cd frontend && npx vitest run src/pages/Empresas.test.tsx
```
Expected: all tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Empresas.tsx frontend/src/pages/Empresas.test.tsx
git commit -m "feat: Empresas page with CRUD modal, search, and Excel export"
```

---

## Task 10: Frontend Update Clientes

**Files:**
- Modify: `frontend/src/pages/Clientes.tsx`
- Modify: `frontend/src/pages/Clientes.test.tsx`

- [ ] **Step 1: Write failing test — add to `frontend/src/pages/Clientes.test.tsx`**

First read the existing test file to find the end, then append:

```typescript
it('muestra columna Empresa en tabla', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: [{
      id: 1, nombre: 'Juan Pérez', rut: null, email: null, telefono: null,
      direccion_despacho: null, notas: null, empresa_id: 1,
      empresa: { id: 1, nombre: 'Constructora ABC', razon_social: null, rut: null },
      recibe_correo: true, forma_pago: null, despacho_o_retiro: null, comuna: null,
      ultimo_contacto: null, forma_captacion: null, compromiso: null, es_nuevo: false, created_at: '2026-01-01T00:00:00Z',
    }],
  })
  wrap(<Clientes />)
  expect(await screen.findByText('Constructora ABC')).toBeTruthy()
})

it('muestra dropdown empresa en modal', async () => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.includes('/api/empresas/')) return Promise.resolve({ data: [{ id: 1, nombre: 'Emp X', razon_social: null, rut: null }] })
    return Promise.resolve({ data: [] })
  })
  wrap(<Clientes />)
  await screen.findByText('Clientes')
  fireEvent.click(screen.getByText(/agregar cliente/i))
  expect(await screen.findByText(/empresa/i)).toBeTruthy()
})
```

- [ ] **Step 2: Run new tests — expect FAIL**

```bash
cd frontend && npx vitest run src/pages/Clientes.test.tsx
```
Expected: `FAILED` — column and empresa dropdown not yet added

- [ ] **Step 3: Replace `frontend/src/pages/Clientes.tsx`**

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Cliente, Empresa } from '../types'

type FormData = {
  nombre: string
  rut: string
  email: string
  telefono: string
  direccion_despacho: string
  notas: string
  empresa_id: number | null
  recibe_correo: boolean
  forma_pago: string
  despacho_o_retiro: string
  comuna: string
  ultimo_contacto: string
  forma_captacion: string
  compromiso: string
  es_nuevo: boolean
}

const EMPTY_FORM: FormData = {
  nombre: '', rut: '', email: '', telefono: '', direccion_despacho: '', notas: '',
  empresa_id: null, recibe_correo: true, forma_pago: '', despacho_o_retiro: '',
  comuna: '', ultimo_contacto: '', forma_captacion: '', compromiso: '', es_nuevo: false,
}

const INPUT_CLS = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
const LABEL_CLS = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
const READONLY_CLS = "w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400"

export default function Clientes() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ['clientes', busqueda],
    queryFn: () => api.get(`/api/clientes/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ['empresas'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const empresaSeleccionada = empresas.find(e => e.id === form.empresa_id) ?? null

  function abrirCrear() {
    setEditando(null); setForm(EMPTY_FORM); setError(null); setModalOpen(true)
  }

  function abrirEditar(c: Cliente) {
    setEditando(c)
    setForm({
      nombre: c.nombre, rut: c.rut ?? '', email: c.email ?? '', telefono: c.telefono ?? '',
      direccion_despacho: c.direccion_despacho ?? '', notas: c.notas ?? '',
      empresa_id: c.empresa_id, recibe_correo: c.recibe_correo,
      forma_pago: c.forma_pago ?? '', despacho_o_retiro: c.despacho_o_retiro ?? '',
      comuna: c.comuna ?? '', ultimo_contacto: c.ultimo_contacto ?? '',
      forma_captacion: c.forma_captacion ?? '', compromiso: c.compromiso ?? '',
      es_nuevo: c.es_nuevo,
    })
    setError(null); setModalOpen(true)
  }

  function cerrarModal() { setModalOpen(false); setEditando(null); setError(null) }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
        ),
        recibe_correo: data.recibe_correo,
        es_nuevo: data.es_nuevo,
        empresa_id: data.empresa_id,
      }
      if (editando) return api.patch(`/api/clientes/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/clientes/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); cerrarModal() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/clientes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); setEliminandoId(null); setDeleteError(null) },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Clientes</h1>
        <div className="flex gap-2">
          <button
            onClick={() => api.get('/api/clientes/export/excel', { responseType: 'blob' }).then(r => {
              const url = URL.createObjectURL(r.data)
              const a = document.createElement('a'); a.href = url; a.download = 'clientes.xlsx'; a.click()
              URL.revokeObjectURL(url)
            })}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Exportar Excel
          </button>
          <button onClick={abrirCrear} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
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
              <th className="text-left px-4 py-3 font-medium">Empresa</th>
              <th className="text-left px-4 py-3 font-medium">RUT</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {clientes.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin clientes registrados</td></tr>
            )}
            {clientes.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{c.nombre}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.empresa?.nombre ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.rut ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.email ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.telefono ?? '—'}</td>
                <td className="px-4 py-3">
                  {eliminandoId === c.id ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      {deleteError
                        ? <span className="text-red-500">{deleteError}</span>
                        : <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>}
                      <button onClick={() => eliminar.mutate(c.id)} disabled={eliminar.isPending} className="text-red-600 hover:underline font-medium disabled:opacity-50">Sí</button>
                      <button onClick={() => { setEliminandoId(null); setDeleteError(null) }} className="text-gray-500 hover:underline">No</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-3">
                      <button onClick={() => abrirEditar(c)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => { setEliminandoId(c.id); setDeleteError(null) }} className="text-xs text-red-500 hover:underline">Eliminar</button>
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
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editando ? 'Editar cliente' : 'Nuevo cliente'}
              </h2>
            </div>
            <form onSubmit={ev => { ev.preventDefault(); guardar.mutate(form) }} className="px-6 py-4 grid grid-cols-2 gap-4">

              {/* Empresa */}
              <div className="col-span-2">
                <label className={LABEL_CLS}>Empresa</label>
                <select
                  value={form.empresa_id ?? ''}
                  onChange={e => setForm(f => ({ ...f, empresa_id: e.target.value ? Number(e.target.value) : null }))}
                  className={INPUT_CLS}
                >
                  <option value="">— Sin empresa —</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>

              {/* Inherited read-only fields from empresa */}
              {empresaSeleccionada && (
                <>
                  {empresaSeleccionada.rut && (
                    <div>
                      <label className={LABEL_CLS}>RUT Empresa</label>
                      <div className={READONLY_CLS}>{empresaSeleccionada.rut}</div>
                    </div>
                  )}
                  {empresaSeleccionada.razon_social && (
                    <div>
                      <label className={LABEL_CLS}>Razón Social</label>
                      <div className={READONLY_CLS}>{empresaSeleccionada.razon_social}</div>
                    </div>
                  )}
                </>
              )}

              {/* Core fields */}
              <div className="col-span-2">
                <label className={LABEL_CLS}>Nombre *</label>
                <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={INPUT_CLS} />
              </div>
              {(([
                { key: 'rut', label: 'RUT', placeholder: '76.123.456-7' },
                { key: 'email', label: 'Email', placeholder: 'contacto@empresa.cl' },
                { key: 'telefono', label: 'Teléfono', placeholder: '+56 9 1234 5678' },
                { key: 'forma_pago', label: 'Forma de Pago' },
                { key: 'comuna', label: 'Comuna' },
              ]) as { key: keyof FormData; label: string; placeholder?: string }[]).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className={LABEL_CLS}>{label}</label>
                  <input type="text" placeholder={placeholder} value={form[key] as string}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className={INPUT_CLS} />
                </div>
              ))}

              <div>
                <label className={LABEL_CLS}>Despacho o Retiro</label>
                <select value={form.despacho_o_retiro} onChange={e => setForm(f => ({ ...f, despacho_o_retiro: e.target.value }))} className={INPUT_CLS}>
                  <option value="">— Sin definir —</option>
                  <option value="despacho">Despacho</option>
                  <option value="retiro">Retiro</option>
                </select>
              </div>

              <div>
                <label className={LABEL_CLS}>Último Contacto</label>
                <input type="date" value={form.ultimo_contacto} onChange={e => setForm(f => ({ ...f, ultimo_contacto: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div>
                <label className={LABEL_CLS}>Forma Captación</label>
                <input type="text" value={form.forma_captacion} onChange={e => setForm(f => ({ ...f, forma_captacion: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="col-span-2">
                <label className={LABEL_CLS}>Dirección de Despacho</label>
                <input type="text" value={form.direccion_despacho} onChange={e => setForm(f => ({ ...f, direccion_despacho: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="col-span-2">
                <label className={LABEL_CLS}>Compromiso</label>
                <textarea rows={2} value={form.compromiso} onChange={e => setForm(f => ({ ...f, compromiso: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="col-span-2">
                <label className={LABEL_CLS}>Notas</label>
                <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="recibe_correo" checked={form.recibe_correo} onChange={e => setForm(f => ({ ...f, recibe_correo: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                <label htmlFor="recibe_correo" className="text-sm text-gray-700 dark:text-gray-300">Recibe correo</label>
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="es_nuevo" checked={form.es_nuevo} onChange={e => setForm(f => ({ ...f, es_nuevo: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                <label htmlFor="es_nuevo" className="text-sm text-gray-700 dark:text-gray-300">Es nuevo</label>
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

- [ ] **Step 4: Run Clientes tests — expect PASS**

```bash
cd frontend && npx vitest run src/pages/Clientes.test.tsx
```
Expected: all tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Clientes.tsx frontend/src/pages/Clientes.test.tsx
git commit -m "feat: update Clientes page — empresa dropdown, new fields, Empresa column in table"
```

---

## Task 11: Frontend Update CotizacionDetalle

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Add `empresaId` state and empresas query**

Add `Empresa` to the type imports at line 7:
```typescript
import type { Cotizacion, CotizacionLinea, Cliente, User, Producto, Empresa } from '../types'
```

After line 61 (`const [lineas, setLineas]...`), add:
```typescript
  const [empresaId, setEmpresaId] = useState<number | ''>('')
```

After the `usuarios` query (around line 106), add:
```typescript
  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ['empresas'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
  })
```

- [ ] **Step 2: Load `empresa_id` when cotizacion loads**

In the `useEffect` that loads cotizacion data (lines 75-95), add after `setNota(...)`:
```typescript
      setEmpresaId(cotizacion.empresa_id ?? '')
```

- [ ] **Step 3: Auto-fill empresa when cliente is selected**

Replace `handleClienteChange` function:
```typescript
  function handleClienteChange(cid: number | '') {
    setClienteId(cid)
    if (cid) {
      const c = clientes.find(cl => cl.id === cid)
      if (c) {
        if (!contacto) setContacto(c.nombre)
        if (!correo && c.email) setCorreo(c.email)
        if (c.empresa_id) setEmpresaId(c.empresa_id)
      }
    }
  }
```

- [ ] **Step 4: Include `empresa_id` in save payload**

In `handleSave`, inside the `payload` object (around line 176), add `empresa_id`:
```typescript
      const payload = {
        cliente_id: clienteId,
        vendedor_id: vendedorId || currentUser?.id,
        contacto: contacto || null,
        correo: correo || null,
        fecha,
        estado,
        nota: nota || null,
        empresa_id: empresaId || null,
      }
```

- [ ] **Step 5: Add empresa dropdown to the header form JSX**

In the JSX header section, find the cliente `<select>` and add the empresa dropdown immediately after it. Search for `setClienteId` in the JSX to locate the cliente select, then add after its closing `</div>`:

```tsx
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Empresa</label>
                <select
                  value={empresaId}
                  onChange={e => setEmpresaId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">— Sin empresa —</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
```

- [ ] **Step 6: Run existing cotizacion tests to verify no regression**

```bash
cd frontend && npx vitest run src/pages/CotizacionDetalle.test.tsx
```
Expected: all tests `PASSED`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: add empresa dropdown to CotizacionDetalle with auto-fill from cliente"
```

---

## Final Verification

- [ ] **Run full backend test suite**

```bash
cd backend && python -m pytest -v
```
Expected: all tests `PASSED`

- [ ] **Run full frontend test suite**

```bash
cd frontend && npx vitest run
```
Expected: all tests `PASSED`

- [ ] **Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: fase 4a final cleanup"
```
