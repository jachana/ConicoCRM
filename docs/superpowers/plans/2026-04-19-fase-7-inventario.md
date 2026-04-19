# Fase 7 — Inventario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `movimientos_inventario` table that tracks every stock change (OC reception, NV creation/edit/cancel/delete, and manual adjustments), expose a `/api/inventario` router, and build the frontend Inventario page with two tabs, a sidebar badge, and stock-critical indicators in Catálogo.

**Architecture:** Centralized `MovimientoInventario` model; `stock_actual` on `Producto` stays as a cached value updated in the same DB commit as each movement row. OC and NV endpoints are instrumented inline — no separate service layer. Frontend uses React Query for data fetching, same patterns as existing pages.

**Tech Stack:** Python/FastAPI/SQLAlchemy/Alembic (backend), React/TypeScript/React Query/Tailwind/Lucide (frontend), pytest (tests).

---

## File Map

**Create:**
- `backend/app/models/movimiento_inventario.py`
- `backend/app/schemas/movimiento_inventario.py`
- `backend/app/api/inventario.py`
- `backend/migrations/versions/a1b2c3d4e5f6_add_movimientos_inventario.py`
- `backend/tests/test_inventario.py`
- `frontend/src/pages/Inventario.tsx`

**Modify:**
- `backend/app/models/__init__.py` — import MovimientoInventario
- `backend/app/main.py` — register inventario router
- `backend/app/api/ordenes_compra.py` — hook reception to create movimiento
- `backend/app/api/nota_ventas.py` — hook create/replace-lines/cancel/delete to create movimientos
- `backend/app/api/productos.py` — add GET /{id}/movimientos endpoint
- `backend/tests/conftest.py` — import movimiento_inventario in setup_test_db
- `frontend/src/types/index.ts` — add MovimientoInventario interface
- `frontend/src/router.tsx` — add /inventario route
- `frontend/src/components/layout/Sidebar.tsx` — badge for stock bajo
- `frontend/src/pages/Productos.tsx` — red indicator for stock critico

---

## Task 1: Backend model + migration

**Files:**
- Create: `backend/app/models/movimiento_inventario.py`
- Create: `backend/migrations/versions/a1b2c3d4e5f6_add_movimientos_inventario.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Write model**

`backend/app/models/movimiento_inventario.py`:
```python
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"

    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id", ondelete="RESTRICT"))
    tipo: Mapped[str] = mapped_column(String(20))        # entrada | salida | ajuste
    cantidad: Mapped[int] = mapped_column(Integer)        # siempre > 0
    signo: Mapped[int] = mapped_column(Integer)           # +1 o -1
    referencia_tipo: Mapped[str | None] = mapped_column(String(30), nullable=True)
    referencia_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    motivo: Mapped[str | None] = mapped_column(String(30), nullable=True)
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    producto: Mapped["Producto"] = relationship("Producto")
    usuario: Mapped["User | None"] = relationship("User")
```

- [ ] **Step 2: Register model in `backend/app/models/__init__.py`**

Add at end of file:
```python
from app.models.movimiento_inventario import MovimientoInventario  # noqa: F401
```

- [ ] **Step 3: Register model in `backend/tests/conftest.py`**

In the `setup_test_db` fixture, add after `import app.models.orden_compra  # noqa: F401`:
```python
    import app.models.movimiento_inventario  # noqa: F401
```

- [ ] **Step 4: Write the failing test**

`backend/tests/test_inventario.py`:
```python
def test_modelo_importable():
    from app.models.movimiento_inventario import MovimientoInventario
    assert MovimientoInventario.__tablename__ == "movimientos_inventario"
```

- [ ] **Step 5: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_inventario.py::test_modelo_importable -v
```
Expected: FAIL (ImportError or attribute error)

- [ ] **Step 6: Run test again — should pass now**

```bash
cd backend && python -m pytest tests/test_inventario.py::test_modelo_importable -v
```
Expected: PASS

- [ ] **Step 7: Write migration**

`backend/migrations/versions/a1b2c3d4e5f6_add_movimientos_inventario.py`:
```python
"""add movimientos_inventario table

Revision ID: a1b2c3d4e5f6
Revises: f6a3b0c1d2e5
Create Date: 2026-04-19 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f6a3b0c1d2e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "movimientos_inventario",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("signo", sa.Integer(), nullable=False),
        sa.Column("referencia_tipo", sa.String(30), nullable=True),
        sa.Column("referencia_id", sa.Integer(), nullable=True),
        sa.Column("motivo", sa.String(30), nullable=True),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["usuario_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_movimientos_inventario_producto_id", "movimientos_inventario", ["producto_id"])
    op.create_index("ix_movimientos_inventario_created_at", "movimientos_inventario", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_movimientos_inventario_created_at", table_name="movimientos_inventario")
    op.drop_index("ix_movimientos_inventario_producto_id", table_name="movimientos_inventario")
    op.drop_table("movimientos_inventario")
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/movimiento_inventario.py backend/app/models/__init__.py backend/migrations/versions/a1b2c3d4e5f6_add_movimientos_inventario.py backend/tests/conftest.py backend/tests/test_inventario.py
git commit -m "feat: add MovimientoInventario model and migration"
```

---

## Task 2: Backend schemas + inventario router

**Files:**
- Create: `backend/app/schemas/movimiento_inventario.py`
- Create: `backend/app/api/inventario.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests for endpoints**

Add to `backend/tests/test_inventario.py`:
```python
def test_listar_movimientos_sin_auth(client):
    r = client.get("/api/inventario/movimientos")
    assert r.status_code == 401


def test_listar_movimientos_vacio(client, admin_token):
    r = client.get("/api/inventario/movimientos", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_stock_bajo_vacio(client, admin_token):
    r = client.get("/api/inventario/stock-bajo", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json() == []


def _crear_producto(client, token, nombre="Prod", stock_actual=10, stock_minimo=5):
    r = client.post(
        "/api/productos/",
        json={"nombre": nombre, "precio_costo": 0, "precio_venta": 0,
              "stock_minimo": stock_minimo, "stock_actual": stock_actual},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_ajuste_suma_stock(client, admin_token):
    pid = _crear_producto(client, admin_token, stock_actual=10)
    r = client.post(
        "/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 5, "signo": 1, "motivo": "conteo_fisico"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["tipo"] == "ajuste"
    assert data["cantidad"] == 5
    assert data["signo"] == 1
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 15


def test_ajuste_resta_stock(client, admin_token):
    pid = _crear_producto(client, admin_token, stock_actual=10)
    r = client.post(
        "/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 3, "signo": -1, "motivo": "merma"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 7


def test_ajuste_motivo_invalido(client, admin_token):
    pid = _crear_producto(client, admin_token)
    r = client.post(
        "/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 1, "signo": 1, "motivo": "inventado"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_ajuste_vendedor_sin_permisos(client, vendedor_token):
    r = client.post(
        "/api/inventario/ajustes",
        json={"producto_id": 1, "cantidad": 1, "signo": 1, "motivo": "conteo_fisico"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


def test_stock_bajo_detecta_criticos(client, admin_token):
    _crear_producto(client, admin_token, nombre="Critico", stock_actual=2, stock_minimo=10)
    _crear_producto(client, admin_token, nombre="OK", stock_actual=20, stock_minimo=5)
    r = client.get("/api/inventario/stock-bajo", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert "Critico" in nombres
    assert "OK" not in nombres


def test_listar_movimientos_paginado(client, admin_token):
    pid = _crear_producto(client, admin_token)
    client.post("/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 1, "signo": 1, "motivo": "conteo_fisico"},
        headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/inventario/movimientos?page=1&page_size=50",
        headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


def test_listar_movimientos_filtro_tipo(client, admin_token):
    pid = _crear_producto(client, admin_token)
    client.post("/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 1, "signo": 1, "motivo": "otro"},
        headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/inventario/movimientos?tipo=ajuste",
        headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["tipo"] == "ajuste"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_inventario.py -v -k "not modelo"
```
Expected: all FAIL (router not registered)

- [ ] **Step 3: Write schemas**

`backend/app/schemas/movimiento_inventario.py`:
```python
from datetime import datetime
from pydantic import BaseModel, field_validator

MOTIVOS_VALIDOS = {"conteo_fisico", "merma", "correccion", "otro"}


class AjusteCreate(BaseModel):
    producto_id: int
    cantidad: int
    signo: int  # +1 o -1
    motivo: str
    nota: str | None = None

    @field_validator("cantidad")
    @classmethod
    def cantidad_positiva(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("cantidad debe ser > 0")
        return v

    @field_validator("signo")
    @classmethod
    def signo_valido(cls, v: int) -> int:
        if v not in (1, -1):
            raise ValueError("signo debe ser 1 o -1")
        return v

    @field_validator("motivo")
    @classmethod
    def motivo_valido(cls, v: str) -> str:
        if v not in MOTIVOS_VALIDOS:
            raise ValueError(f"motivo debe ser uno de: {', '.join(MOTIVOS_VALIDOS)}")
        return v


class ProductoMinOut(BaseModel):
    id: int
    nombre: str
    sku: str | None = None
    model_config = {"from_attributes": True}


class UsuarioMinOut(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class MovimientoOut(BaseModel):
    id: int
    producto_id: int
    tipo: str
    cantidad: int
    signo: int
    referencia_tipo: str | None = None
    referencia_id: int | None = None
    motivo: str | None = None
    nota: str | None = None
    usuario_id: int | None = None
    created_at: datetime
    producto: ProductoMinOut | None = None
    usuario: UsuarioMinOut | None = None
    model_config = {"from_attributes": True}


class MovimientoListOut(BaseModel):
    items: list[MovimientoOut]
    total: int
```

- [ ] **Step 4: Write inventario router**

`backend/app/api/inventario.py`:
```python
from datetime import date
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.models.movimiento_inventario import MovimientoInventario
from app.models.producto import Producto
from app.models.user import User
from app.schemas.movimiento_inventario import AjusteCreate, MovimientoListOut, MovimientoOut

router = APIRouter()


def _load_movimiento(db: Session, mov_id: int) -> MovimientoInventario:
    return (
        db.query(MovimientoInventario)
        .options(joinedload(MovimientoInventario.producto), joinedload(MovimientoInventario.usuario))
        .filter(MovimientoInventario.id == mov_id)
        .first()
    )


@router.get("/movimientos", response_model=MovimientoListOut)
def listar_movimientos(
    producto_id: int | None = Query(None),
    tipo: str | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    perms: tuple[User, Session] = require_permission("inventario", "view"),
):
    _, db = perms
    q = db.query(MovimientoInventario).options(
        joinedload(MovimientoInventario.producto),
        joinedload(MovimientoInventario.usuario),
    )
    if producto_id:
        q = q.filter(MovimientoInventario.producto_id == producto_id)
    if tipo:
        q = q.filter(MovimientoInventario.tipo == tipo)
    if fecha_desde:
        q = q.filter(MovimientoInventario.created_at >= fecha_desde)
    if fecha_hasta:
        q = q.filter(MovimientoInventario.created_at <= fecha_hasta)
    total = q.count()
    items = q.order_by(MovimientoInventario.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return MovimientoListOut(items=items, total=total)


@router.post("/ajustes", response_model=MovimientoOut, status_code=status.HTTP_201_CREATED)
def crear_ajuste(
    body: AjusteCreate,
    perms: tuple[User, Session] = require_permission("inventario", "create"),
):
    current_user, db = perms
    producto = db.get(Producto, body.producto_id)
    if not producto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    producto.stock_actual += body.signo * body.cantidad
    mov = MovimientoInventario(
        producto_id=body.producto_id,
        tipo="ajuste",
        cantidad=body.cantidad,
        signo=body.signo,
        referencia_tipo="ajuste_manual",
        motivo=body.motivo,
        nota=body.nota,
        usuario_id=current_user.id,
    )
    db.add(mov)
    db.flush()
    db.commit()
    return _load_movimiento(db, mov.id)


@router.get("/stock-bajo", response_model=list[dict])
def stock_bajo(
    perms: tuple[User, Session] = require_permission("inventario", "view"),
):
    _, db = perms
    productos = (
        db.query(Producto)
        .filter(Producto.stock_actual < Producto.stock_minimo)
        .order_by(Producto.nombre)
        .all()
    )
    return [
        {
            "id": p.id,
            "nombre": p.nombre,
            "sku": p.sku,
            "stock_actual": p.stock_actual,
            "stock_minimo": p.stock_minimo,
        }
        for p in productos
    ]
```

- [ ] **Step 5: Register router in `backend/app/main.py`**

Add import after the existing imports:
```python
from app.api import inventario
```

Add after `app.include_router(ordenes_compra.router, ...)`:
```python
app.include_router(inventario.router, prefix="/api/inventario", tags=["inventario"])
```

- [ ] **Step 6: Run tests**

```bash
cd backend && python -m pytest tests/test_inventario.py -v
```
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/movimiento_inventario.py backend/app/api/inventario.py backend/app/main.py backend/tests/test_inventario.py
git commit -m "feat: add inventario router with movimientos, ajuste, and stock-bajo endpoints"
```

---

## Task 3: Hook OC reception to create movimiento

**Files:**
- Modify: `backend/app/api/ordenes_compra.py`

- [ ] **Step 1: Write failing test**

`backend/tests/test_inventario.py` — add:
```python
def _crear_proveedor_inv(client, token, email="provInv@test.cl"):
    r = client.post(
        "/api/proveedores/",
        json={"nombre": "Proveedor Inv", "rut": None, "email": email},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_recepcion_oc_crea_movimiento_entrada(client, admin_token):
    from app.models.movimiento_inventario import MovimientoInventario
    from tests.conftest import TestingSession

    pid_prov = _crear_proveedor_inv(client, admin_token)
    pid_prod = _crear_producto(client, admin_token, nombre="ProdOC", stock_actual=0)

    oc = client.post(
        "/api/ordenes-compra/",
        json={
            "proveedor_id": pid_prov,
            "fecha": "2026-04-19",
            "lineas": [{"orden": 1, "descripcion": "ProdOC", "cantidad": 5,
                         "valor_neto": 1000, "producto_id": pid_prod}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    oc_id = oc["id"]
    linea_id = oc["lineas"][0]["id"]

    # enviar orden
    client.patch(f"/api/ordenes-compra/{oc_id}/estado",
        json={"estado": "enviada"},
        headers={"Authorization": f"Bearer {admin_token}"})

    # recepcionar
    client.post(f"/api/ordenes-compra/{oc_id}/recepcion",
        json={"lineas": [{"id": linea_id, "cantidad_recibida": 5}]},
        headers={"Authorization": f"Bearer {admin_token}"})

    # stock_actual actualizado
    prod = client.get(f"/api/productos/{pid_prod}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 5

    # movimiento creado
    movs = client.get(f"/api/inventario/movimientos?producto_id={pid_prod}",
        headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert movs["total"] == 1
    m = movs["items"][0]
    assert m["tipo"] == "entrada"
    assert m["cantidad"] == 5
    assert m["signo"] == 1
    assert m["referencia_tipo"] == "orden_compra"
    assert m["referencia_id"] == oc_id
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_inventario.py::test_recepcion_oc_crea_movimiento_entrada -v
```
Expected: FAIL (no movimiento created)

- [ ] **Step 3: Add import to `backend/app/api/ordenes_compra.py`**

Add to imports at top (after existing imports):
```python
from app.models.movimiento_inventario import MovimientoInventario
```

- [ ] **Step 4: Instrument reception in `backend/app/api/ordenes_compra.py`**

Locate the reception function (the one that calls `producto.stock_actual += delta`). After that line, add:
```python
                if delta > 0:
                    db.add(MovimientoInventario(
                        producto_id=linea.producto_id,
                        tipo="entrada",
                        cantidad=delta,
                        signo=1,
                        referencia_tipo="orden_compra",
                        referencia_id=orden_id,
                        usuario_id=current_user.id,
                    ))
```

The `current_user` variable must be extracted from `perms`. The reception function signature uses `perms: tuple[User, Session] = require_permission("ordenes_compra", "edit")` — change the unpacking from `_, db = perms` to `current_user, db = perms`.

- [ ] **Step 5: Run test**

```bash
cd backend && python -m pytest tests/test_inventario.py::test_recepcion_oc_crea_movimiento_entrada -v
```
Expected: PASS

- [ ] **Step 6: Run full suite to check for regressions**

```bash
cd backend && python -m pytest -v
```
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/ordenes_compra.py backend/tests/test_inventario.py
git commit -m "feat: hook OC reception to create MovimientoInventario entrada"
```

---

## Task 4: Hook NV create / replace-lines / cancel / delete to movimientos

**Files:**
- Modify: `backend/app/api/nota_ventas.py`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_inventario.py`:
```python
def _crear_nv(client, token, producto_id: int, cantidad: int = 3):
    cli = client.post("/api/clientes/",
        json={"nombre": "CLI Test", "rut": None},
        headers={"Authorization": f"Bearer {token}"}).json()["id"]
    return client.post("/api/nota_ventas/",
        json={
            "cliente_id": cli,
            "fecha": "2026-04-19",
            "lineas": [{"orden": 1, "descripcion": "Item", "cantidad": cantidad,
                         "valor_neto": 1000, "producto_id": producto_id}],
        },
        headers={"Authorization": f"Bearer {token}"}).json()


def test_crear_nv_descuenta_stock(client, admin_token):
    pid = _crear_producto(client, admin_token, nombre="ProdNV", stock_actual=20)
    nv = _crear_nv(client, admin_token, pid, cantidad=3)
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 17
    movs = client.get(f"/api/inventario/movimientos?producto_id={pid}",
        headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert movs["total"] == 1
    m = movs["items"][0]
    assert m["tipo"] == "salida"
    assert m["cantidad"] == 3
    assert m["signo"] == -1
    assert m["referencia_tipo"] == "nota_venta"
    assert m["referencia_id"] == nv["id"]


def test_reemplazar_lineas_nv_ajusta_stock(client, admin_token):
    pid = _crear_producto(client, admin_token, nombre="ProdLineas", stock_actual=20)
    nv = _crear_nv(client, admin_token, pid, cantidad=3)
    # stock now 17; replace with cantidad=5 → delta = -2 more
    client.put(f"/api/nota_ventas/{nv['id']}/lineas",
        json=[{"orden": 1, "descripcion": "Item", "cantidad": 5,
               "valor_neto": 1000, "producto_id": pid}],
        headers={"Authorization": f"Bearer {admin_token}"})
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 15
    movs = client.get(f"/api/inventario/movimientos?producto_id={pid}",
        headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert movs["total"] == 2


def test_cancelar_nv_restaura_stock(client, admin_token):
    pid = _crear_producto(client, admin_token, nombre="ProdCancel", stock_actual=20)
    nv = _crear_nv(client, admin_token, pid, cantidad=3)
    # stock now 17
    client.patch(f"/api/nota_ventas/{nv['id']}/estado",
        json={"estado": "cancelada"},
        headers={"Authorization": f"Bearer {admin_token}"})
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 20
    movs = client.get(f"/api/inventario/movimientos?producto_id={pid}",
        headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert movs["total"] == 2  # salida + devolución


def test_eliminar_nv_restaura_stock(client, admin_token):
    pid = _crear_producto(client, admin_token, nombre="ProdDel", stock_actual=20)
    nv = _crear_nv(client, admin_token, pid, cantidad=3)
    # stock now 17
    client.delete(f"/api/nota_ventas/{nv['id']}",
        headers={"Authorization": f"Bearer {admin_token}"})
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 20
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_inventario.py -k "nv" -v
```
Expected: all FAIL

- [ ] **Step 3: Add import to `backend/app/api/nota_ventas.py`**

Add to imports:
```python
from app.models.movimiento_inventario import MovimientoInventario
```

- [ ] **Step 4: Add helper `_registrar_movimiento_stock` to `backend/app/api/nota_ventas.py`**

Add after the existing helper functions (after `_can_edit`):
```python
def _registrar_movimientos_salida(db: Session, nv_id: int, lineas: list, usuario_id: int | None) -> None:
    for linea in lineas:
        if linea.producto_id and linea.cantidad > 0:
            producto = db.get(Producto, linea.producto_id)
            if producto:
                producto.stock_actual -= linea.cantidad
                db.add(MovimientoInventario(
                    producto_id=linea.producto_id,
                    tipo="salida",
                    cantidad=linea.cantidad,
                    signo=-1,
                    referencia_tipo="nota_venta",
                    referencia_id=nv_id,
                    usuario_id=usuario_id,
                ))


def _registrar_movimientos_devolucion(db: Session, nv_id: int, lineas: list, usuario_id: int | None) -> None:
    for linea in lineas:
        if linea.producto_id and linea.cantidad > 0:
            producto = db.get(Producto, linea.producto_id)
            if producto:
                producto.stock_actual += linea.cantidad
                db.add(MovimientoInventario(
                    producto_id=linea.producto_id,
                    tipo="entrada",
                    cantidad=linea.cantidad,
                    signo=1,
                    referencia_tipo="nota_venta",
                    referencia_id=nv_id,
                    usuario_id=usuario_id,
                ))
```

- [ ] **Step 5: Instrument `crear_nv` in `backend/app/api/nota_ventas.py`**

In the `crear_nv` function, after `_recalcular_totales(nv)` and before `db.commit()`, add:
```python
    _registrar_movimientos_salida(db, nv.id, nv.lineas, current_user.id)
```

- [ ] **Step 6: Instrument `crear_nv_desde_cotizacion` in `backend/app/api/nota_ventas.py`**

Same pattern — after `_recalcular_totales(nv)` and before `db.commit()`, add:
```python
    _registrar_movimientos_salida(db, nv.id, nv.lineas, current_user.id)
```

- [ ] **Step 7: Instrument `reemplazar_lineas` in `backend/app/api/nota_ventas.py`**

After the NV is loaded and before replacing lines, capture the old lines quantities. Replace the body of `reemplazar_lineas` with:
```python
    current_user, db = perms
    nv = db.query(NotaVenta).options(joinedload(NotaVenta.lineas)).filter(NotaVenta.id == nv_id).first()
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    if not _can_edit(current_user, nv):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    # build old stock snapshot: product_id → total cantidad
    old_qtys: dict[int, int] = {}
    for linea in nv.lineas:
        if linea.producto_id:
            old_qtys[linea.producto_id] = old_qtys.get(linea.producto_id, 0) + linea.cantidad

    for linea in list(nv.lineas):
        db.delete(linea)
    db.flush()
    nuevas = _calcular_lineas(db, lineas_data)
    for linea in nuevas:
        linea.nv_id = nv_id
        db.add(linea)
    db.flush()
    nv.lineas = nuevas
    _recalcular_totales(nv)
    nv.updated_at = datetime.now(timezone.utc)

    # build new stock snapshot
    new_qtys: dict[int, int] = {}
    for linea in nuevas:
        if linea.producto_id:
            new_qtys[linea.producto_id] = new_qtys.get(linea.producto_id, 0) + linea.cantidad

    # apply delta per product
    all_ids = set(old_qtys) | set(new_qtys)
    for prod_id in all_ids:
        delta = new_qtys.get(prod_id, 0) - old_qtys.get(prod_id, 0)
        if delta == 0:
            continue
        producto = db.get(Producto, prod_id)
        if not producto:
            continue
        producto.stock_actual -= delta  # delta>0 means more sold → subtract; delta<0 means less sold → add back
        db.add(MovimientoInventario(
            producto_id=prod_id,
            tipo="ajuste",
            cantidad=abs(delta),
            signo=-1 if delta > 0 else 1,
            referencia_tipo="nota_venta",
            referencia_id=nv_id,
            usuario_id=current_user.id,
        ))

    db.commit()
    return _load_nv(db, nv_id)
```

- [ ] **Step 8: Instrument `cambiar_estado` for cancellation**

In `cambiar_estado`, after `nv.estado = body.estado` and before `db.commit()`, add:
```python
    if body.estado == "cancelada":
        nv_full = db.query(NotaVenta).options(joinedload(NotaVenta.lineas)).filter(NotaVenta.id == nv_id).first()
        _registrar_movimientos_devolucion(db, nv_id, nv_full.lineas, current_user.id)
```

Make sure `NotaVenta` is imported with joinedload available (it already is).

- [ ] **Step 9: Instrument `eliminar_nv` to restore stock**

In `eliminar_nv`, after the `nv.estado != "pendiente"` guard, before `db.delete(nv)`, add:
```python
    nv_full = db.query(NotaVenta).options(joinedload(NotaVenta.lineas)).filter(NotaVenta.id == nv_id).first()
    _registrar_movimientos_devolucion(db, nv_id, nv_full.lineas if nv_full else [], current_user.id)
```

- [ ] **Step 10: Run tests**

```bash
cd backend && python -m pytest tests/test_inventario.py -v
```
Expected: all PASS

- [ ] **Step 11: Run full suite**

```bash
cd backend && python -m pytest -v
```
Expected: all PASS

- [ ] **Step 12: Commit**

```bash
git add backend/app/api/nota_ventas.py backend/tests/test_inventario.py
git commit -m "feat: hook NV create/replace/cancel/delete to MovimientoInventario"
```

---

## Task 5: GET /api/productos/{id}/movimientos

**Files:**
- Modify: `backend/app/api/productos.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/test_inventario.py`:
```python
def test_historial_por_producto(client, admin_token):
    pid = _crear_producto(client, admin_token, nombre="ProdHistorial", stock_actual=10)
    client.post("/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 2, "signo": 1, "motivo": "otro"},
        headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get(f"/api/productos/{pid}/movimientos",
        headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["producto_id"] == pid
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_inventario.py::test_historial_por_producto -v
```
Expected: FAIL (404)

- [ ] **Step 3: Add endpoint to `backend/app/api/productos.py`**

Add imports at top:
```python
from app.models.movimiento_inventario import MovimientoInventario
from app.schemas.movimiento_inventario import MovimientoListOut
```

Add endpoint at end of file:
```python
@router.get("/{producto_id}/movimientos", response_model=MovimientoListOut)
def listar_movimientos_producto(
    producto_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    perms: tuple[User, Session] = require_permission("inventario", "view"),
):
    _, db = perms
    if not db.get(Producto, producto_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    q = (
        db.query(MovimientoInventario)
        .options(joinedload(MovimientoInventario.producto), joinedload(MovimientoInventario.usuario))
        .filter(MovimientoInventario.producto_id == producto_id)
    )
    total = q.count()
    items = q.order_by(MovimientoInventario.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return MovimientoListOut(items=items, total=total)
```

- [ ] **Step 4: Run test**

```bash
cd backend && python -m pytest tests/test_inventario.py::test_historial_por_producto -v
```
Expected: PASS

- [ ] **Step 5: Run full suite**

```bash
cd backend && python -m pytest -v
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/productos.py backend/tests/test_inventario.py
git commit -m "feat: add GET /api/productos/{id}/movimientos endpoint"
```

---

## Task 6: Frontend types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add MovimientoInventario interface**

Add at end of `frontend/src/types/index.ts`:
```typescript
export interface MovimientoInventario {
  id: number
  producto_id: number
  tipo: 'entrada' | 'salida' | 'ajuste'
  cantidad: number
  signo: number
  referencia_tipo: 'orden_compra' | 'nota_venta' | 'ajuste_manual' | null
  referencia_id: number | null
  motivo: 'conteo_fisico' | 'merma' | 'correccion' | 'otro' | null
  nota: string | null
  usuario_id: number | null
  created_at: string
  producto?: { id: number; nombre: string; sku: string | null } | null
  usuario?: { id: number; name: string } | null
}

export interface MovimientoListOut {
  items: MovimientoInventario[]
  total: number
}

export interface StockBajoItem {
  id: number
  nombre: string
  sku: string | null
  stock_actual: number
  stock_minimo: number
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add MovimientoInventario, MovimientoListOut, StockBajoItem types"
```

---

## Task 7: Frontend Inventario page

**Files:**
- Create: `frontend/src/pages/Inventario.tsx`

- [ ] **Step 1: Create page**

`frontend/src/pages/Inventario.tsx`:
```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api } from '../lib/api'
import type { MovimientoInventario, MovimientoListOut, Producto, StockBajoItem } from '../types'

const MOTIVO_LABELS: Record<string, string> = {
  conteo_fisico: 'Conteo físico',
  merma: 'Merma',
  correccion: 'Corrección',
  otro: 'Otro',
}

const TIPO_LABELS: Record<string, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
}

function MovimientoIcon({ tipo, signo }: { tipo: string; signo: number }) {
  if (tipo === 'entrada' || (tipo === 'ajuste' && signo === 1))
    return <TrendingUp size={14} className="text-green-500" />
  if (tipo === 'salida' || (tipo === 'ajuste' && signo === -1))
    return <TrendingDown size={14} className="text-red-500" />
  return <Minus size={14} className="text-gray-400" />
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ReferenciaCelda({ tipo, id }: { tipo: string | null; id: number | null }) {
  if (!tipo || !id) return <span className="text-gray-400">—</span>
  const map: Record<string, string> = {
    orden_compra: `/ordenes-compra/${id}`,
    nota_venta: `/notas-venta/${id}`,
  }
  const href = map[tipo]
  const label = tipo === 'orden_compra' ? `OC #${id}` : tipo === 'nota_venta' ? `NV #${id}` : `${tipo} #${id}`
  if (href) return <a href={href} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">{label}</a>
  return <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
}

export default function Inventario() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'stock' | 'movimientos'>('stock')
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  // ajuste modal
  const [ajusteOpen, setAjusteOpen] = useState(false)
  const [ajusteProductoId, setAjusteProductoId] = useState('')
  const [ajusteCantidad, setAjusteCantidad] = useState('1')
  const [ajusteSigno, setAjusteSigno] = useState<1 | -1>(1)
  const [ajusteMotivo, setAjusteMotivo] = useState('conteo_fisico')
  const [ajusteNota, setAjusteNota] = useState('')
  const [ajusteError, setAjusteError] = useState('')

  const { data: productos = [] } = useQuery<Producto[]>({
    queryKey: ['productos', busqueda],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const params = new URLSearchParams()
  if (filtroTipo) params.set('tipo', filtroTipo)
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)
  params.set('page', '1')
  params.set('page_size', '100')

  const { data: movimientos } = useQuery<MovimientoListOut>({
    queryKey: ['movimientos', filtroTipo, fechaDesde, fechaHasta],
    queryFn: () => api.get(`/api/inventario/movimientos?${params}`).then(r => r.data),
    enabled: tab === 'movimientos',
  })

  const { data: stockBajo = [] } = useQuery<StockBajoItem[]>({
    queryKey: ['stock-bajo'],
    queryFn: () => api.get('/api/inventario/stock-bajo').then(r => r.data),
  })

  const ajusteMut = useMutation({
    mutationFn: (payload: object) => api.post('/api/inventario/ajustes', payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['movimientos'] })
      qc.invalidateQueries({ queryKey: ['stock-bajo'] })
      setAjusteOpen(false)
      setAjusteProductoId('')
      setAjusteCantidad('1')
      setAjusteSigno(1)
      setAjusteMotivo('conteo_fisico')
      setAjusteNota('')
      setAjusteError('')
    },
    onError: (e: any) => setAjusteError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  function submitAjuste(e: React.FormEvent) {
    e.preventDefault()
    if (!ajusteProductoId) { setAjusteError('Selecciona un producto'); return }
    ajusteMut.mutate({
      producto_id: parseInt(ajusteProductoId),
      cantidad: parseInt(ajusteCantidad) || 1,
      signo: ajusteSigno,
      motivo: ajusteMotivo,
      nota: ajusteNota || null,
    })
  }

  const productosFiltrados = busqueda
    ? productos
    : productos

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Inventario</h1>
        <button
          onClick={() => setAjusteOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={16} />
          Ajuste manual
        </button>
      </div>

      {stockBajo.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-300">
            {stockBajo.length} producto{stockBajo.length > 1 ? 's' : ''} con stock crítico
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
        {(['stock', 'movimientos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t === 'stock' ? 'Stock actual' : 'Movimientos'}
          </button>
        ))}
      </div>

      {/* Tab: Stock actual */}
      {tab === 'stock' && (
        <div>
          <div className="mb-3">
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-72 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">SKU</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Stock mínimo</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Stock actual</th>
                  <th className="text-center px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {productosFiltrados.map(p => {
                  const critico = p.stock_actual < p.stock_minimo
                  return (
                    <tr key={p.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{p.nombre}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.sku ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{p.stock_minimo}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${critico ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                        {p.stock_actual}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {critico ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            <AlertTriangle size={10} /> Crítico
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">OK</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Movimientos */}
      {tab === 'movimientos' && (
        <div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">Todos los tipos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
            </select>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Tipo</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Cantidad</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Referencia</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {(movimientos?.items ?? []).map((m: MovimientoInventario) => (
                  <tr key={m.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtFecha(m.created_at)}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{m.producto?.nombre ?? `#${m.producto_id}`}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                        <MovimientoIcon tipo={m.tipo} signo={m.signo} />
                        {TIPO_LABELS[m.tipo] ?? m.tipo}
                        {m.motivo && <span className="text-gray-400 dark:text-gray-500 text-xs">({MOTIVO_LABELS[m.motivo] ?? m.motivo})</span>}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${m.signo === 1 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {m.signo === 1 ? '+' : '-'}{m.cantidad}
                    </td>
                    <td className="px-4 py-3"><ReferenciaCelda tipo={m.referencia_tipo} id={m.referencia_id} /></td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{m.usuario?.name ?? '—'}</td>
                  </tr>
                ))}
                {!movimientos?.items?.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin movimientos</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {movimientos && movimientos.total > 100 && (
            <p className="mt-2 text-sm text-gray-500">Mostrando 100 de {movimientos.total} movimientos.</p>
          )}
        </div>
      )}

      {/* Modal ajuste manual */}
      {ajusteOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">Ajuste manual de stock</h2>
              <button onClick={() => { setAjusteOpen(false); setAjusteError('') }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={submitAjuste} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Producto</label>
                <select
                  value={ajusteProductoId}
                  onChange={e => setAjusteProductoId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">Seleccionar producto...</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.sku ? ` (${p.sku})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de ajuste</label>
                <div className="flex gap-4">
                  {([1, -1] as const).map(s => (
                    <label key={s} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input type="radio" name="signo" value={s} checked={ajusteSigno === s} onChange={() => setAjusteSigno(s)} />
                      {s === 1 ? 'Suma (entrada)' : 'Resta (salida)'}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cantidad</label>
                <input type="number" min="1" value={ajusteCantidad} onChange={e => setAjusteCantidad(e.target.value)} required
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo</label>
                <select value={ajusteMotivo} onChange={e => setAjusteMotivo(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  <option value="conteo_fisico">Conteo físico</option>
                  <option value="merma">Merma</option>
                  <option value="correccion">Corrección</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nota (opcional)</label>
                <textarea value={ajusteNota} onChange={e => setAjusteNota(e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              {ajusteError && <p className="text-red-600 text-sm">{ajusteError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setAjusteOpen(false); setAjusteError('') }}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                  Cancelar
                </button>
                <button type="submit" disabled={ajusteMut.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                  {ajusteMut.isPending ? 'Guardando...' : 'Guardar ajuste'}
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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Inventario.tsx
git commit -m "feat: add Inventario page with stock tab, movimientos tab, and ajuste modal"
```

---

## Task 8: Frontend route + sidebar badge

**Files:**
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Register route in `frontend/src/router.tsx`**

Add import:
```typescript
import Inventario from './pages/Inventario'
```

Add route inside the children array (after the `rrhh` route):
```typescript
{ path: 'inventario', element: <Inventario /> },
```

- [ ] **Step 2: Add stock-bajo badge to `frontend/src/components/layout/Sidebar.tsx`**

Add import at top (React Query):
```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
```

The `useAuthStore` import already exists. Add only the React Query and api imports.

Inside the `Sidebar` component, after the existing hooks, add:
```typescript
  const user = useAuthStore(s => s.user)
  const { data: stockBajo = [] } = useQuery<{ id: number }[]>({
    queryKey: ['stock-bajo'],
    queryFn: () => api.get('/api/inventario/stock-bajo').then(r => r.data),
    enabled: !!user && user.role !== 'vendedor',
    staleTime: 60_000,
  })
  const stockBajoCount = stockBajo.length
```

Note: `user` is already declared in the existing component — do not duplicate. Add only the query.

In the NAV map rendering, change the Inventario item to show a badge. Replace the `NavLink` render with a conditional: for the `'/inventario'` item, render a badge overlay. The cleanest approach is to change the `NAV` array to support an optional `badge` prop and pass `stockBajoCount`:

Replace the entire NAV array and render logic:

The `NAV` array already exists as a const outside the component — leave it. Inside the `nav` JSX, change the map to:
```tsx
{NAV.map(({ to, icon: Icon, label }) => {
  const badge = to === '/inventario' ? stockBajoCount : 0
  return (
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
      <span className="relative flex-shrink-0">
        <Icon size={18} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
})}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/router.tsx frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: add /inventario route and sidebar badge for stock critico"
```

---

## Task 9: Stock crítico indicator in Catálogo

**Files:**
- Modify: `frontend/src/pages/Productos.tsx`

- [ ] **Step 1: Find the stock_actual cell in the table**

Search `Productos.tsx` for where `stock_actual` is rendered in the table. It will look something like:
```tsx
<td ...>{p.stock_actual}</td>
```

- [ ] **Step 2: Add red styling when crítico**

Replace that cell with:
```tsx
<td className={`px-4 py-2 text-right font-medium ${p.stock_actual < p.stock_minimo ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-900 dark:text-white'}`}>
  {p.stock_actual}
  {p.stock_actual < p.stock_minimo && (
    <span className="ml-1 text-xs text-red-500" title="Stock bajo mínimo">⚠</span>
  )}
</td>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Productos.tsx
git commit -m "feat: highlight critical stock in Catalogo table"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && python -m pytest -v
```
Expected: all PASS

- [ ] **Step 2: Build frontend (type-check)**

```bash
cd frontend && npm run build
```
Expected: no TypeScript errors, successful build

- [ ] **Step 3: Update PROGRESS.md**

In `PROGRESS.md`, mark Fase 7 as complete:
```markdown
- [x] **Fase 7 — Inventario**
```

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: mark Fase 7 Inventario complete in PROGRESS.md"
```
