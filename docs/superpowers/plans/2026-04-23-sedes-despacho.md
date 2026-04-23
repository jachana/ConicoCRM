# Sedes de Despacho Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `direccion_despacho` field on NotaVenta with a FK to a new `SedeDespacho` entity (1-N from Empresa), managed as a subtable inside the Empresa edit modal.

**Architecture:** New `sedes_despacho` table with FK to `empresas`. `nota_ventas` drops `direccion_despacho` and gains `sede_despacho_id` (nullable FK). `retiro_en_conico` remains and is mutually exclusive with `sede_despacho_id`. Frontend adds a sedes subtable in the Empresa edit modal and replaces the text input in NotaVentaDetalle with a dropdown.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic (raw SQL), Pydantic v2, React + TypeScript, React Query, Tailwind

---

## File Map

**Create:**
- `backend/app/models/sede_despacho.py`
- `backend/app/schemas/sede_despacho.py`
- `backend/app/api/sedes_despacho.py`
- `backend/migrations/versions/p6q7r8s9t0u1_add_sedes_despacho.py`
- `backend/tests/test_sedes_despacho.py`

**Modify:**
- `backend/app/models/empresa.py` — add `sedes_despacho` relationship
- `backend/app/models/nota_venta.py` — add `sede_despacho_id` FK + relationship, remove `direccion_despacho`
- `backend/app/schemas/nota_venta.py` — swap `direccion_despacho` for `sede_despacho_id` + `SedeDespachoRef`
- `backend/app/api/nota_ventas.py` — update `_validate_despacho`, `_load_nv`, `crear_nv`, `actualizar_nv`
- `backend/app/main.py` — register sedes_despacho router
- `backend/app/models/__init__.py` — export `SedeDespacho`
- `backend/tests/conftest.py` — import new model
- `frontend/src/types/index.ts` — add `SedeDespacho` type, update `NotaVenta`
- `frontend/src/pages/Empresas.tsx` — add sedes subtable in edit modal
- `frontend/src/pages/NotaVentaDetalle.tsx` — replace `direccionDespacho` with sede dropdown

---

## Task 1: Alembic migration

**Files:**
- Create: `backend/migrations/versions/p6q7r8s9t0u1_add_sedes_despacho.py`

- [ ] **Step 1: Create migration file**

```python
"""add sedes_despacho table and update nota_ventas

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-04-23 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "p6q7r8s9t0u1"
down_revision: Union[str, None] = "o5p6q7r8s9t0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sedes_despacho (
            id SERIAL PRIMARY KEY,
            empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
            nombre VARCHAR(255) NOT NULL,
            direccion VARCHAR(500) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute(
        "ALTER TABLE nota_ventas ADD COLUMN IF NOT EXISTS "
        "sede_despacho_id INTEGER REFERENCES sedes_despacho(id) ON DELETE SET NULL"
    )
    op.execute("ALTER TABLE nota_ventas DROP COLUMN IF EXISTS direccion_despacho")


def downgrade() -> None:
    op.execute("ALTER TABLE nota_ventas ADD COLUMN IF NOT EXISTS direccion_despacho TEXT")
    op.execute("ALTER TABLE nota_ventas DROP COLUMN IF EXISTS sede_despacho_id")
    op.execute("DROP TABLE IF EXISTS sedes_despacho")
```

- [ ] **Step 2: Run migration against dev database**

```bash
cd backend && alembic upgrade head
```

Expected: `Running upgrade o5p6q7r8s9t0 -> p6q7r8s9t0u1, add sedes_despacho table and update nota_ventas`

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/versions/p6q7r8s9t0u1_add_sedes_despacho.py
git commit -m "feat: add sedes_despacho migration"
```

---

## Task 2: SedeDespacho model + update existing models

**Files:**
- Create: `backend/app/models/sede_despacho.py`
- Modify: `backend/app/models/empresa.py`
- Modify: `backend/app/models/nota_venta.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Create `backend/app/models/sede_despacho.py`**

```python
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class SedeDespacho(Base):
    __tablename__ = "sedes_despacho"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id", ondelete="CASCADE"))
    nombre: Mapped[str] = mapped_column(String(255))
    direccion: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    empresa: Mapped["Empresa"] = relationship("Empresa", back_populates="sedes_despacho")
```

- [ ] **Step 2: Add relationship to `backend/app/models/empresa.py`**

Add this import at the top of the file (after existing imports):
```python
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.sede_despacho import SedeDespacho
```

Add this at the end of the `Empresa` class, after the `clientes` relationship:
```python
    sedes_despacho: Mapped[list["SedeDespacho"]] = relationship(
        "SedeDespacho", back_populates="empresa", cascade="all, delete-orphan"
    )
```

- [ ] **Step 3: Update `backend/app/models/nota_venta.py`**

Replace line 27:
```python
    direccion_despacho: Mapped[str | None] = mapped_column(Text, nullable=True)
```
With:
```python
    sede_despacho_id: Mapped[int | None] = mapped_column(
        ForeignKey("sedes_despacho.id", ondelete="SET NULL"), nullable=True
    )
```

Add this relationship after the `factura` relationship (after line 59):
```python
    sede_despacho: Mapped["SedeDespacho | None"] = relationship("SedeDespacho")
```

Remove `Text` from the SQLAlchemy imports on line 3 if it's no longer used (check first).

- [ ] **Step 4: Export from `backend/app/models/__init__.py`**

Add after the last import (line 23):
```python
from app.models.sede_despacho import SedeDespacho  # noqa: F401
```

- [ ] **Step 5: Register in `backend/tests/conftest.py`**

Add after line 47 (`import app.models.banco_receptor`):
```python
    import app.models.sede_despacho  # noqa: F401
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/sede_despacho.py backend/app/models/empresa.py \
        backend/app/models/nota_venta.py backend/app/models/__init__.py \
        backend/tests/conftest.py
git commit -m "feat: add SedeDespacho model, update Empresa and NotaVenta"
```

---

## Task 3: SedeDespacho schemas

**Files:**
- Create: `backend/app/schemas/sede_despacho.py`

- [ ] **Step 1: Create `backend/app/schemas/sede_despacho.py`**

```python
from datetime import datetime
from pydantic import BaseModel


class SedeDespachoCreate(BaseModel):
    empresa_id: int
    nombre: str
    direccion: str


class SedeDespachoUpdate(BaseModel):
    nombre: str | None = None
    direccion: str | None = None


class SedeDespachoRef(BaseModel):
    id: int
    nombre: str
    direccion: str
    model_config = {"from_attributes": True}


class SedeDespachoOut(BaseModel):
    id: int
    empresa_id: int
    nombre: str
    direccion: str
    created_at: datetime
    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/sede_despacho.py
git commit -m "feat: add SedeDespacho schemas"
```

---

## Task 4: Write failing tests for SedeDespacho CRUD

**Files:**
- Create: `backend/tests/test_sedes_despacho.py`

- [ ] **Step 1: Create `backend/tests/test_sedes_despacho.py`**

```python
import pytest


@pytest.fixture
def empresa_id(client, admin_token):
    resp = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa Test Sede"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_create_sede(client, admin_token, empresa_id):
    resp = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Sede Principal", "direccion": "Av. Principal 123"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["nombre"] == "Sede Principal"
    assert data["direccion"] == "Av. Principal 123"
    assert data["empresa_id"] == empresa_id
    assert "id" in data


def test_list_sedes_by_empresa(client, admin_token, empresa_id):
    for i in range(2):
        client.post(
            "/api/sedes-despacho/",
            json={"empresa_id": empresa_id, "nombre": f"Sede {i}", "direccion": f"Calle {i}"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    resp = client.get(
        f"/api/sedes-despacho/?empresa_id={empresa_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_update_sede(client, admin_token, empresa_id):
    create = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Vieja", "direccion": "Av 1"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    sede_id = create.json()["id"]
    resp = client.put(
        f"/api/sedes-despacho/{sede_id}",
        json={"nombre": "Nueva", "direccion": "Av 2"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["nombre"] == "Nueva"
    assert resp.json()["direccion"] == "Av 2"


def test_delete_sede(client, admin_token, empresa_id):
    create = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Para Borrar", "direccion": "X"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    sede_id = create.json()["id"]
    resp = client.delete(
        f"/api/sedes-despacho/{sede_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204
    # verify gone
    list_resp = client.get(
        f"/api/sedes-despacho/?empresa_id={empresa_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert all(s["id"] != sede_id for s in list_resp.json())


def test_delete_sede_404(client, admin_token):
    resp = client.delete(
        "/api/sedes-despacho/99999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_cascade_delete_empresa_removes_sedes(client, admin_token, empresa_id):
    client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Sede", "direccion": "Dirección"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    client.delete(
        f"/api/empresas/{empresa_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # empresa is gone; sedes_despacho query would return 0 (or 404 if empresa check is added)
    # just verify no DB crash and the list returns empty for a non-existent empresa_id
    resp = client.get(
        f"/api/sedes-despacho/?empresa_id={empresa_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []
```

- [ ] **Step 2: Run tests — expect all to FAIL**

```bash
cd backend && python -m pytest tests/test_sedes_despacho.py -v
```

Expected: `ImportError` or `404` errors — router not registered yet.

---

## Task 5: SedeDespacho router + register in main.py

**Files:**
- Create: `backend/app/api/sedes_despacho.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create `backend/app/api/sedes_despacho.py`**

```python
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import require_permission
from app.models.sede_despacho import SedeDespacho
from app.models.nota_venta import NotaVenta
from app.models.user import User
from app.schemas.sede_despacho import SedeDespachoCreate, SedeDespachoOut, SedeDespachoUpdate

router = APIRouter()


@router.get("/", response_model=list[SedeDespachoOut])
def listar_sedes(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    return db.query(SedeDespacho).filter(SedeDespacho.empresa_id == empresa_id).all()


@router.post("/", response_model=SedeDespachoOut, status_code=201)
def crear_sede(
    body: SedeDespachoCreate,
    perms: tuple[User, Session] = require_permission("empresas", "edit"),
):
    _, db = perms
    sede = SedeDespacho(**body.model_dump())
    db.add(sede)
    db.commit()
    db.refresh(sede)
    return sede


@router.put("/{sede_id}", response_model=SedeDespachoOut)
def actualizar_sede(
    sede_id: int,
    body: SedeDespachoUpdate,
    perms: tuple[User, Session] = require_permission("empresas", "edit"),
):
    _, db = perms
    sede = db.get(SedeDespacho, sede_id)
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(sede, k, v)
    db.commit()
    db.refresh(sede)
    return sede


@router.delete("/{sede_id}", status_code=204)
def eliminar_sede(
    sede_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "delete"),
):
    _, db = perms
    sede = db.get(SedeDespacho, sede_id)
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    if db.query(NotaVenta).filter(NotaVenta.sede_despacho_id == sede_id).first():
        raise HTTPException(
            status_code=409,
            detail="Sede referenciada por una o más notas de venta",
        )
    db.delete(sede)
    db.commit()
```

- [ ] **Step 2: Register router in `backend/app/main.py`**

Add import after line 26 (`from app.api import bancos_receptores`):
```python
from app.api import sedes_despacho
```

Add router registration after line 61 (`app.include_router(bancos_receptores...)`):
```python
app.include_router(sedes_despacho.router, prefix="/api/sedes-despacho", tags=["empresas"])
```

- [ ] **Step 3: Run tests — expect all to PASS**

```bash
cd backend && python -m pytest tests/test_sedes_despacho.py -v
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/sedes_despacho.py backend/app/main.py
git commit -m "feat: add SedeDespacho router and register in main"
```

---

## Task 6: Update NotaVenta schemas

**Files:**
- Modify: `backend/app/schemas/nota_venta.py`

- [ ] **Step 1: Update `backend/app/schemas/nota_venta.py`**

Add import at the top (after line 4, `from app.schemas.empresa import EmpresaRef`):
```python
from app.schemas.sede_despacho import SedeDespachoRef
```

In `NotaVentaCreate` (lines 26-37): replace `direccion_despacho: str | None = None` with:
```python
    sede_despacho_id: int | None = None
```

In `NotaVentaUpdate` (lines 40-50): replace `direccion_despacho: str | None = None` with:
```python
    sede_despacho_id: int | None = None
```

In `NotaVentaOut` (lines 79-106): replace:
```python
    direccion_despacho: str | None = None
    retiro_en_conico: bool = False
```
With:
```python
    sede_despacho_id: int | None = None
    sede_despacho: SedeDespachoRef | None = None
    retiro_en_conico: bool = False
```

In `NotaVentaListOut` (lines 109-133): replace:
```python
    direccion_despacho: str | None = None
    retiro_en_conico: bool = False
```
With:
```python
    sede_despacho_id: int | None = None
    retiro_en_conico: bool = False
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/nota_venta.py
git commit -m "feat: update NotaVenta schemas for sede_despacho_id"
```

---

## Task 7: Write failing tests for NV+sede integration

**Files:**
- Modify: `backend/tests/test_sedes_despacho.py`

- [ ] **Step 1: Add NV integration tests to `backend/tests/test_sedes_despacho.py`**

Append to the existing test file:

```python
@pytest.fixture
def cliente_id(client, admin_token):
    resp = client.post(
        "/api/clientes/",
        json={"nombre": "Cliente NV Test"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_nv_with_sede_despacho(client, admin_token, empresa_id, cliente_id):
    sede = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Sede A", "direccion": "Calle 1"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    resp = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cliente_id,
            "empresa_id": empresa_id,
            "sede_despacho_id": sede["id"],
            "retiro_en_conico": False,
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sede_despacho_id"] == sede["id"]
    assert data["sede_despacho"]["nombre"] == "Sede A"


def test_nv_retiro_en_conico_no_sede(client, admin_token, cliente_id):
    resp = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cliente_id,
            "retiro_en_conico": True,
            "sede_despacho_id": None,
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["retiro_en_conico"] is True
    assert resp.json()["sede_despacho_id"] is None


def test_nv_mutual_exclusivity_error(client, admin_token, empresa_id, cliente_id):
    sede = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Sede B", "direccion": "Calle 2"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    resp = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cliente_id,
            "retiro_en_conico": True,
            "sede_despacho_id": sede["id"],
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


def test_nv_both_empty_is_valid(client, admin_token, cliente_id):
    resp = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cliente_id,
            "retiro_en_conico": False,
            "sede_despacho_id": None,
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201


def test_delete_sede_blocked_by_nv(client, admin_token, empresa_id, cliente_id):
    sede = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Sede Referenciada", "direccion": "Av X"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    client.post(
        "/api/nota_ventas/",
        json={"cliente_id": cliente_id, "sede_despacho_id": sede["id"], "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = client.delete(
        f"/api/sedes-despacho/{sede['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 409
```

- [ ] **Step 2: Run new tests — expect FAIL**

```bash
cd backend && python -m pytest tests/test_sedes_despacho.py::test_nv_with_sede_despacho \
  tests/test_sedes_despacho.py::test_nv_mutual_exclusivity_error -v
```

Expected: FAIL — NV router still references `direccion_despacho`.

---

## Task 8: Update NotaVenta router

**Files:**
- Modify: `backend/app/api/nota_ventas.py`

- [ ] **Step 1: Add SedeDespacho import**

Add to the imports in `nota_ventas.py` (after `from app.models.nota_venta import NotaVenta, NotaVentaLinea`):
```python
from app.models.sede_despacho import SedeDespacho
```

Add to the schemas import block (after `NotaVentaUpdate`):
```python
from app.schemas.sede_despacho import SedeDespachoRef  # noqa: F401 — used in NotaVentaOut
```

- [ ] **Step 2: Replace `_validate_despacho`**

Replace lines 149-154:
```python
def _validate_despacho(retiro: bool, direccion: str | None) -> None:
    if not retiro and not (direccion and direccion.strip()):
        raise HTTPException(
            status_code=422,
            detail="Debe indicar dirección de despacho o marcar retiro en Conico.",
        )
```

With:
```python
def _validate_despacho(retiro: bool, sede_id: int | None) -> None:
    if retiro and sede_id is not None:
        raise HTTPException(
            status_code=422,
            detail="No puede seleccionar una sede y retiro en Conico al mismo tiempo.",
        )
```

- [ ] **Step 3: Update `_load_nv` to eager-load sede_despacho**

In `_load_nv` (around line 192), add `joinedload(NotaVenta.sede_despacho)` to the options list:
```python
def _load_nv(db: Session, nv_id: int) -> NotaVenta:
    nv = db.query(NotaVenta).options(
        joinedload(NotaVenta.cliente),
        joinedload(NotaVenta.vendedor),
        joinedload(NotaVenta.empresa),
        joinedload(NotaVenta.cotizacion),
        joinedload(NotaVenta.lineas),
        joinedload(NotaVenta.sede_despacho),
    ).filter(NotaVenta.id == nv_id).first()
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    return nv
```

- [ ] **Step 4: Update `crear_nv`**

In the `NotaVenta(...)` constructor call (around line 282), replace:
```python
        direccion_despacho=body.direccion_despacho,
        retiro_en_conico=body.retiro_en_conico,
```
With:
```python
        sede_despacho_id=body.sede_despacho_id,
        retiro_en_conico=body.retiro_en_conico,
```

Add `_validate_despacho` call just before the `NotaVenta(...)` constructor (before `nv = NotaVenta(...)`):
```python
    _validate_despacho(body.retiro_en_conico, body.sede_despacho_id)
```

- [ ] **Step 5: Update `actualizar_nv`**

Replace lines 398-400:
```python
    nuevo_retiro = body.retiro_en_conico if body.retiro_en_conico is not None else nv.retiro_en_conico
    nueva_dir = body.direccion_despacho if body.direccion_despacho is not None else nv.direccion_despacho
    _validate_despacho(nuevo_retiro, nueva_dir)
```
With:
```python
    nuevo_retiro = body.retiro_en_conico if body.retiro_en_conico is not None else nv.retiro_en_conico
    nueva_sede_id = body.sede_despacho_id if body.sede_despacho_id is not None else nv.sede_despacho_id
    _validate_despacho(nuevo_retiro, nueva_sede_id)
```

- [ ] **Step 6: Run all NV+sede tests — expect PASS**

```bash
cd backend && python -m pytest tests/test_sedes_despacho.py -v
```

Expected: All tests PASS.

- [ ] **Step 7: Run full test suite to check for regressions**

```bash
cd backend && python -m pytest -v
```

Expected: All previously passing tests still PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/nota_ventas.py
git commit -m "feat: update NotaVenta router for sede_despacho_id"
```

---

## Task 9: Frontend types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add `SedeDespacho` interface and update `NotaVenta`**

Add the following interface before the `Empresa` interface (around line 30):
```typescript
export interface SedeDespacho {
  id: number
  empresa_id: number
  nombre: string
  direccion: string
  created_at: string
}

export interface SedeDespachoRef {
  id: number
  nombre: string
  direccion: string
}
```

In the `NotaVenta` interface (around line 207), replace:
```typescript
  direccion_despacho: string | null
  retiro_en_conico: boolean
```
With:
```typescript
  sede_despacho_id: number | null
  sede_despacho?: SedeDespachoRef | null
  retiro_en_conico: boolean
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add SedeDespacho types, update NotaVenta type"
```

---

## Task 10: Empresas.tsx — sedes subtable in edit modal

**Files:**
- Modify: `frontend/src/pages/Empresas.tsx`

- [ ] **Step 1: Add sedes state and hooks**

Add to the imports at line 5 (after existing type imports):
```typescript
import type { Empresa, EmpresaListItem, DeudaBulkItem, SedeDespacho } from '../types'
```

Add these module-level type/constant declarations before the `export default function Empresas()` line:
```typescript
type SedeForm = { nombre: string; direccion: string }
const EMPTY_SEDE: SedeForm = { nombre: '', direccion: '' }
```

Add these state declarations after the `eliminar` mutation (after line 177):
  const [sedes, setSedes] = useState<SedeDespacho[]>([])
  const [sedeForm, setSedeForm] = useState<SedeForm>(EMPTY_SEDE)
  const [sedeEditId, setSedeEditId] = useState<number | null>(null)
  const [sedeAdding, setSedeAdding] = useState(false)
  const [sedeError, setSedeError] = useState<string | null>(null)
  const [sedeSaving, setSedeSaving] = useState(false)
  const [sedeEliminandoId, setSedeEliminandoId] = useState<number | null>(null)

  useEffect(() => {
    if (editando) {
      api.get(`/api/sedes-despacho/?empresa_id=${editando.id}`)
        .then(r => setSedes(r.data))
        .catch(() => setSedes([]))
    } else {
      setSedes([])
    }
  }, [editando])

  async function guardarSede() {
    if (!editando) return
    setSedeSaving(true)
    setSedeError(null)
    try {
      if (sedeEditId !== null) {
        const r = await api.put(`/api/sedes-despacho/${sedeEditId}`, sedeForm)
        setSedes(prev => prev.map(s => s.id === sedeEditId ? r.data : s))
      } else {
        const r = await api.post('/api/sedes-despacho/', { ...sedeForm, empresa_id: editando.id })
        setSedes(prev => [...prev, r.data])
      }
      setSedeAdding(false)
      setSedeEditId(null)
      setSedeForm(EMPTY_SEDE)
    } catch (e: any) {
      setSedeError(e?.response?.data?.detail ?? 'Error al guardar sede')
    } finally {
      setSedeSaving(false)
    }
  }

  async function eliminarSede(id: number) {
    try {
      await api.delete(`/api/sedes-despacho/${id}`)
      setSedes(prev => prev.filter(s => s.id !== id))
      setSedeEliminandoId(null)
    } catch (e: any) {
      setSedeError(e?.response?.data?.detail ?? 'Error al eliminar sede')
    }
  }
```

- [ ] **Step 2: Reset sedes state on modal close**

In the `cerrarModal` function (line 146), update to also reset sede state:
```typescript
  function cerrarModal() {
    setModalOpen(false)
    setEditando(null)
    setError(null)
    setSedes([])
    setSedeAdding(false)
    setSedeEditId(null)
    setSedeForm(EMPTY_SEDE)
    setSedeError(null)
    setSedeEliminandoId(null)
  }
```

- [ ] **Step 3: Add sedes subtable JSX inside the modal**

In the modal form (`<form ... className="px-6 py-4 grid grid-cols-2 gap-4">`), add the following section after the "Nota Cobranza" `<div>` (after line 385, before `{error && ...}`):

```tsx
              {/* Sedes de despacho */}
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Sedes de despacho</label>
                  {editando && !sedeAdding && sedeEditId === null && (
                    <button
                      type="button"
                      onClick={() => { setSedeAdding(true); setSedeForm(EMPTY_SEDE) }}
                      className="text-xs text-blue-600 hover:underline"
                    >+ Agregar sede</button>
                  )}
                </div>
                {!editando && (
                  <p className="text-xs text-gray-400">Guarda la empresa primero para agregar sedes.</p>
                )}
                {editando && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    {sedes.length === 0 && !sedeAdding && (
                      <p className="text-xs text-gray-400 px-3 py-2">Sin sedes registradas</p>
                    )}
                    {sedes.map(s => (
                      <div key={s.id} className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        {sedeEditId === s.id ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={sedeForm.nombre}
                              onChange={e => setSedeForm(f => ({ ...f, nombre: e.target.value }))}
                              placeholder="Nombre"
                              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                            <input
                              type="text"
                              value={sedeForm.direccion}
                              onChange={e => setSedeForm(f => ({ ...f, direccion: e.target.value }))}
                              placeholder="Dirección"
                              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                            {sedeError && <p className="text-xs text-red-500">{sedeError}</p>}
                            <div className="flex gap-2">
                              <button type="button" onClick={guardarSede} disabled={sedeSaving || !sedeForm.nombre || !sedeForm.direccion}
                                className="text-xs text-blue-600 hover:underline disabled:opacity-50">Guardar</button>
                              <button type="button" onClick={() => { setSedeEditId(null); setSedeForm(EMPTY_SEDE); setSedeError(null) }}
                                className="text-xs text-gray-500 hover:underline">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{s.nombre}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{s.direccion}</span>
                            </div>
                            {sedeEliminandoId === s.id ? (
                              <span className="flex gap-2 text-xs">
                                <button type="button" onClick={() => eliminarSede(s.id)} className="text-red-600 hover:underline">Sí</button>
                                <button type="button" onClick={() => setSedeEliminandoId(null)} className="text-gray-500 hover:underline">No</button>
                              </span>
                            ) : (
                              <span className="flex gap-2">
                                <button type="button" onClick={() => { setSedeEditId(s.id); setSedeForm({ nombre: s.nombre, direccion: s.direccion }); setSedeError(null) }}
                                  className="text-xs text-blue-600 hover:underline">Editar</button>
                                <button type="button" onClick={() => setSedeEliminandoId(s.id)}
                                  className="text-xs text-red-500 hover:underline">Eliminar</button>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {sedeAdding && (
                      <div className="px-3 py-2 space-y-1 border-t border-gray-100 dark:border-gray-800">
                        <input
                          type="text"
                          value={sedeForm.nombre}
                          onChange={e => setSedeForm(f => ({ ...f, nombre: e.target.value }))}
                          placeholder="Nombre de la sede"
                          className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                        <input
                          type="text"
                          value={sedeForm.direccion}
                          onChange={e => setSedeForm(f => ({ ...f, direccion: e.target.value }))}
                          placeholder="Dirección completa"
                          className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                        {sedeError && <p className="text-xs text-red-500">{sedeError}</p>}
                        <div className="flex gap-2">
                          <button type="button" onClick={guardarSede} disabled={sedeSaving || !sedeForm.nombre || !sedeForm.direccion}
                            className="text-xs text-blue-600 hover:underline disabled:opacity-50">Guardar</button>
                          <button type="button" onClick={() => { setSedeAdding(false); setSedeForm(EMPTY_SEDE); setSedeError(null) }}
                            className="text-xs text-gray-500 hover:underline">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Empresas.tsx
git commit -m "feat: add sedes de despacho subtable in Empresa edit modal"
```

---

## Task 11: NotaVentaDetalle.tsx — replace direccion_despacho with sede selector

**Files:**
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

- [ ] **Step 1: Add `SedeDespacho` import**

At the top of the file, update the types import to include `SedeDespacho`:
```typescript
import type { ..., SedeDespacho } from '../types'
```
(Add `SedeDespacho` to the existing named import from `'../types'`.)

- [ ] **Step 2: Replace `direccionDespacho` state with `sedeDespachoId` + sedes list**

Find and replace:
```typescript
  const [retiroEnConico, setRetiroEnConico] = useState(false)
  const [direccionDespacho, setDireccionDespacho] = useState('')
```
With:
```typescript
  const [retiroEnConico, setRetiroEnConico] = useState(false)
  const [sedeDespachoId, setSedeDespachoId] = useState<number | null>(null)
  const [sedes, setSedes] = useState<SedeDespacho[]>([])
```

- [ ] **Step 3: Add useEffect to fetch sedes when empresaId changes**

Add after the existing `useEffect` blocks (before `const currentSnapshot`). This effect ONLY fetches — it does NOT clear `sedeDespachoId`, to avoid a race condition when loading an existing NV (the NV load effect sets `sedeDespachoId` and the empresa effect runs simultaneously):
```typescript
  useEffect(() => {
    if (empresaId) {
      api.get(`/api/sedes-despacho/?empresa_id=${empresaId}`)
        .then(r => setSedes(r.data))
        .catch(() => setSedes([]))
    } else {
      setSedes([])
    }
  }, [empresaId])
```

- [ ] **Step 4: Update `currentSnapshot` to use `sedeDespachoId`**

Replace `retiroEnConico, direccionDespacho,` in the `currentSnapshot` useMemo (around line 138-148):
```typescript
  const currentSnapshot = useMemo(() => JSON.stringify({
    clienteId, vendedorId, contacto, correo, fecha, nota, empresaId,
    retiroEnConico, sedeDespachoId,
    lineas: lineas.map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  }), [clienteId, vendedorId, contacto, correo, fecha, nota, empresaId, retiroEnConico, sedeDespachoId, lineas])
```

- [ ] **Step 5: Update load handlers**

Find both occurrences of the load block (around lines 179-183 and 395-399) and replace:
```typescript
      setRetiroEnConico(nv.retiro_en_conico ?? false)
      setDireccionDespacho(nv.direccion_despacho ?? '')
```
With:
```typescript
      setRetiroEnConico(nv.retiro_en_conico ?? false)
      setSedeDespachoId(nv.sede_despacho_id ?? null)
```

Also update the initial state loader block (around line 85-90) that uses `nv` directly:
```typescript
    retiroEnConico: nv.retiro_en_conico ?? false,
    sedeDespachoId: nv.sede_despacho_id ?? null,
```
(Remove `direccionDespacho: nv.direccion_despacho ?? '',`)

- [ ] **Step 6: Update save payload**

Find the save payload (around line 344-346):
```typescript
        retiro_en_conico: retiroEnConico,
        direccion_despacho: retiroEnConico ? null : (direccionDespacho.trim() || null),
```
Replace with:
```typescript
        retiro_en_conico: retiroEnConico,
        sede_despacho_id: retiroEnConico ? null : sedeDespachoId,
```

- [ ] **Step 7: Clear sedeDespachoId when user manually changes empresa**

In the empresa `<select>` onChange (around line 589), replace:
```tsx
onChange={e => setEmpresaId(e.target.value ? Number(e.target.value) : '')}
```
With:
```tsx
onChange={e => {
  setEmpresaId(e.target.value ? Number(e.target.value) : '')
  setSedeDespachoId(null)
}}
```

Also in `handleClienteChange` (around line 226), where `setEmpresaId(c.empresa_id)` is called:
```typescript
        if (c.empresa_id && !empresaId) {
          setEmpresaId(c.empresa_id)
          setSedeDespachoId(null)
        }
```

- [ ] **Step 8: Replace despacho JSX section**

Find and replace the entire despacho section (lines 654-684):
```tsx
          {/* Despacho */}
          <div className="sm:col-span-2 lg:col-span-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={retiroEnConico}
                disabled={isLocked}
                onChange={e => {
                  setRetiroEnConico(e.target.checked)
                  if (e.target.checked) setSedeDespachoId(null)
                }}
                className="rounded border-gray-300 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <span className={`text-sm font-medium ${df('retiroEnConico', retiroEnConico) ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
                Retiro en Conico
              </span>
            </label>
            {!retiroEnConico && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Sede de despacho
                </label>
                <select
                  value={sedeDespachoId ?? ''}
                  disabled={isLocked}
                  onChange={e => setSedeDespachoId(e.target.value ? Number(e.target.value) : null)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${df('sedeDespachoId', sedeDespachoId) ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-700'}`}
                >
                  <option value="">
                    {sedes.length === 0 ? 'Sin sedes registradas' : '— Seleccionar sede —'}
                  </option>
                  {sedes.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre} — {s.direccion}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/NotaVentaDetalle.tsx
git commit -m "feat: replace direccion_despacho with sede_despacho_id dropdown in NV form"
```

---

## Task 12: Manual smoke test

- [ ] **Step 1: Start dev server and verify Empresas flow**
  1. Open the Empresas page
  2. Click "Editar" on an existing empresa — confirm "Sedes de despacho" subtable appears at bottom of form
  3. Click "+ Agregar sede", fill nombre + dirección, click "Guardar" — confirm sede appears in list
  4. Edit the sede — confirm values update
  5. Delete the sede — confirm it disappears
  6. Create a new empresa — confirm "Guarda la empresa primero" message appears in sedes section

- [ ] **Step 2: Verify NotaVenta flow**
  1. Open or create a NV with an empresa that has at least 1 sede
  2. Confirm the "Dirección de despacho" text input is gone, replaced by a "Sede de despacho" dropdown
  3. Confirm dropdown shows the empresa's sedes
  4. Select a sede and save — confirm it persists
  5. Check "Retiro en Conico" — confirm dropdown disappears
  6. Select both retiro + sede simultaneously (via dev tools if needed) — confirm 422 from API

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -p
git commit -m "fix: smoke test corrections for sedes de despacho"
```
