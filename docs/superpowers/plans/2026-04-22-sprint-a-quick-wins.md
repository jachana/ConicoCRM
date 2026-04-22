# Sprint A — Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add product tags+SKU search, NV dispatch address, cotización validity+per-line discount, factura bank receiver, and enforce al-contado for companies without credit line.

**Architecture:** 10 tasks (backend-first per feature, then frontend). Tests use the existing `client`+`admin_token` fixtures from `backend/tests/conftest.py`. New tables auto-created via `Base.metadata.create_all` in both test DB (drop/create per test) and main DB (migration script). New columns in existing tables require `ALTER TABLE` on the main DB only — test DB recreates from scratch each run.

**Tech Stack:** FastAPI, SQLAlchemy 2.0+, SQLite, Pydantic v2, pytest+TestClient, React+TypeScript, TanStack Query, Tailwind CSS

---

## File Map

| Task | Creates | Modifies |
|------|---------|----------|
| 1 | `models/tag.py`, `schemas/tag.py`, `api/tags.py`, `tests/test_tags.py`, `migrate_sprint_a.py` | `models/producto.py`, `models/__init__.py`, `schemas/producto.py`, `api/productos.py`, `main.py`, `tests/conftest.py` |
| 2 | `tests/test_nv_despacho.py` | `models/nota_venta.py`, `schemas/nota_venta.py`, `api/nota_ventas.py` |
| 3 | — | `types/index.ts`, `pages/NotaVentaDetalle.tsx` |
| 4 | `tests/test_cotizacion_extras.py` | `models/cotizacion.py`, `schemas/cotizacion.py`, `api/cotizaciones.py` |
| 5 | — | `types/index.ts`, `pages/CotizacionDetalle.tsx` |
| 6 | `models/banco_receptor.py`, `schemas/banco_receptor.py`, `api/bancos_receptores.py`, `tests/test_banco_receptor.py` | `models/factura.py`, `models/__init__.py`, `schemas/factura.py`, `main.py`, `tests/conftest.py` |
| 7 | — | `types/index.ts`, `pages/Configuracion.tsx`, `pages/FacturaDetalle.tsx` |
| 8 | `tests/test_empresa_credito.py` | `api/cotizaciones.py`, `api/nota_ventas.py` |
| 9 | — | `pages/CotizacionDetalle.tsx`, `pages/NotaVentaDetalle.tsx` |
| 10 | — | run `migrate_sprint_a.py` on main DB |

---

## Task 1: Product Tags — Model, Schema, API, Search

**Files:**
- Create: `backend/app/models/tag.py`
- Create: `backend/app/schemas/tag.py`
- Create: `backend/app/api/tags.py`
- Create: `backend/tests/test_tags.py`
- Create: `backend/migrate_sprint_a.py`
- Modify: `backend/app/models/producto.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/schemas/producto.py`
- Modify: `backend/app/api/productos.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_tags.py`:

```python
def test_crear_producto_con_tags(client, admin_token):
    resp = client.post(
        "/api/productos/",
        json={"nombre": "Tubo acero", "tags": ["acero", "304"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert set(data["tags"]) == {"acero", "304"}


def test_buscar_producto_por_sku(client, admin_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="Válvula", sku="VLV-001", precio_costo=Decimal("100"), precio_venta=Decimal("150"), stock_minimo=0, stock_actual=10)
    db.add(p)
    db.commit()

    resp = client.get("/api/productos/buscar?q=VLV-001", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert any(item["sku"] == "VLV-001" for item in resp.json())


def test_buscar_producto_por_tag(client, admin_token):
    client.post(
        "/api/productos/",
        json={"nombre": "Bomba hidráulica", "tags": ["hidraulica", "industrial"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = client.get("/api/productos/buscar?q=hidraulica", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert any("Bomba" in p["nombre"] for p in resp.json())


def test_listar_tags(client, admin_token):
    client.post("/api/tags/", json={"nombre": "premium"}, headers={"Authorization": f"Bearer {admin_token}"})
    resp = client.get("/api/tags/", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert any(t["nombre"] == "premium" for t in resp.json())
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && python -m pytest tests/test_tags.py -v 2>&1 | head -40
```

Expected: FAILED (routes not found, `tags` field absent)

- [ ] **Step 3: Create tag model**

Create `backend/app/models/tag.py`:

```python
from sqlalchemy import String, ForeignKey, Table, Column
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

producto_tag_link = Table(
    "producto_tag_link",
    Base.metadata,
    Column("producto_id", ForeignKey("productos.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("producto_tags.id", ondelete="CASCADE"), primary_key=True),
)


class ProductoTag(Base):
    __tablename__ = "producto_tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True, index=True)
```

- [ ] **Step 4: Add tags relationship to Producto**

In `backend/app/models/producto.py`, confirm `relationship` is in the `sqlalchemy.orm` import line. Add after the `proveedor` relationship inside `Producto`:

```python
    tags: Mapped[list["ProductoTag"]] = relationship(
        "ProductoTag",
        secondary="producto_tag_link",
        lazy="selectin",
    )
```

- [ ] **Step 5: Register in __init__.py**

In `backend/app/models/__init__.py`, add at the end:

```python
from app.models.tag import ProductoTag, producto_tag_link  # noqa: F401
```

- [ ] **Step 6: Update conftest.py to import tag model**

In `backend/tests/conftest.py`, inside `setup_test_db` after `import app.models.nota_venta`:

```python
    import app.models.tag  # noqa: F401
```

- [ ] **Step 7: Replace producto schemas**

Replace all of `backend/app/schemas/producto.py` with:

```python
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, field_validator


class ProductoBase(BaseModel):
    nombre: str
    descripcion: str | None = None
    precio_costo: Decimal = Decimal("0")
    precio_venta: Decimal = Decimal("0")
    stock_minimo: int = 0
    stock_actual: int = 0
    proveedor_id: int | None = None
    tags: list[str] = []

    @field_validator("tags", mode="before")
    @classmethod
    def extract_tags(cls, v):
        if not v:
            return []
        if v and hasattr(v[0], "nombre"):
            return [t.nombre for t in v]
        return list(v)


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    precio_costo: Decimal | None = None
    precio_venta: Decimal | None = None
    stock_minimo: int | None = None
    stock_actual: int | None = None
    proveedor_id: int | None = None
    tags: list[str] | None = None


class ProductoOut(ProductoBase):
    id: int
    sku: str | None = None
    formato: str | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


class ProductoBusquedaOut(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None
    sku: str | None = None
    formato: str | None = None
    precio_venta: Decimal
    precio_costo: Decimal
    stock_actual: int
    tags: list[str] = []
    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def extract_tags(cls, v):
        if not v:
            return []
        if v and hasattr(v[0], "nombre"):
            return [t.nombre for t in v]
        return list(v)
```

- [ ] **Step 8: Update productos.py — add imports, helper, update endpoints**

In `backend/app/api/productos.py`, add to top imports:

```python
from sqlalchemy import or_
from app.models.tag import ProductoTag, producto_tag_link
```

Add `_sync_tags` helper before `router = APIRouter()`:

```python
def _sync_tags(producto: Producto, tag_nombres: list[str], db: Session) -> None:
    nombres = [n.strip().lower() for n in tag_nombres if n.strip()]
    if not nombres:
        producto.tags = []
        return
    existing = {t.nombre: t for t in db.query(ProductoTag).filter(ProductoTag.nombre.in_(nombres)).all()}
    tags = []
    for nombre in nombres:
        if nombre in existing:
            tags.append(existing[nombre])
        else:
            t = ProductoTag(nombre=nombre)
            db.add(t)
            tags.append(t)
    producto.tags = tags
```

Replace `buscar_productos`:

```python
@router.get("/buscar", response_model=list[ProductoBusquedaOut])
def buscar_productos(
    q: str = Query("", description="Texto a buscar en nombre, SKU o tag"),
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    query = db.query(Producto).outerjoin(Producto.tags)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Producto.nombre.ilike(pattern),
                Producto.sku.ilike(pattern),
                ProductoTag.nombre.ilike(pattern),
            )
        ).distinct()
    return query.order_by(Producto.nombre).limit(20).all()
```

Replace `listar_productos`:

```python
@router.get("/", response_model=list[ProductoOut])
def listar_productos(
    q: str = Query("", description="Filtrar por nombre, SKU o tag"),
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    query = db.query(Producto).outerjoin(Producto.tags)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Producto.nombre.ilike(pattern),
                Producto.sku.ilike(pattern),
                ProductoTag.nombre.ilike(pattern),
            )
        ).distinct()
    return query.order_by(Producto.nombre).all()
```

Replace `crear_producto`:

```python
@router.post("/", response_model=ProductoOut, status_code=status.HTTP_201_CREATED)
def crear_producto(
    body: ProductoCreate,
    perms: tuple[User, Session] = require_permission("catalogo", "create"),
):
    _, db = perms
    data = body.model_dump(exclude={"tags"})
    producto = Producto(**data)
    db.add(producto)
    db.flush()
    _sync_tags(producto, body.tags, db)
    db.commit()
    db.refresh(producto)
    return producto
```

Replace `actualizar_producto`:

```python
@router.patch("/{producto_id}", response_model=ProductoOut)
def actualizar_producto(
    producto_id: int,
    body: ProductoUpdate,
    perms: tuple[User, Session] = require_permission("catalogo", "edit"),
):
    _, db = perms
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    for field, value in body.model_dump(exclude_unset=True, exclude={"tags"}).items():
        setattr(p, field, value)
    if body.tags is not None:
        _sync_tags(p, body.tags, db)
    db.commit()
    db.refresh(p)
    return p
```

- [ ] **Step 9: Create tag schema and router**

Create `backend/app/schemas/tag.py`:

```python
from pydantic import BaseModel


class TagOut(BaseModel):
    id: int
    nombre: str
    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    nombre: str
```

Create `backend/app/api/tags.py`:

```python
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import require_permission
from app.models.tag import ProductoTag
from app.models.user import User
from app.schemas.tag import TagCreate, TagOut

router = APIRouter()


@router.get("/", response_model=list[TagOut])
def listar_tags(perms: tuple[User, Session] = require_permission("catalogo", "view")):
    _, db = perms
    return db.query(ProductoTag).order_by(ProductoTag.nombre).all()


@router.post("/", response_model=TagOut, status_code=status.HTTP_201_CREATED)
def crear_tag(body: TagCreate, perms: tuple[User, Session] = require_permission("catalogo", "create")):
    _, db = perms
    nombre = body.nombre.strip().lower()
    existing = db.query(ProductoTag).filter(ProductoTag.nombre == nombre).first()
    if existing:
        return existing
    tag = ProductoTag(nombre=nombre)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_tag(tag_id: int, perms: tuple[User, Session] = require_permission("catalogo", "delete")):
    _, db = perms
    tag = db.get(ProductoTag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag no encontrada")
    db.delete(tag)
    db.commit()
```

- [ ] **Step 10: Register tags router in main.py**

In `backend/app/main.py`, add after `from app.api import reportes`:

```python
from app.api import tags
```

Add after `app.include_router(reportes.router, ...)`:

```python
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
```

- [ ] **Step 11: Create migration script**

Create `backend/migrate_sprint_a.py`:

```python
"""Run once on the main DB to apply Sprint A schema changes. Safe to re-run."""
import os, sys
sys.modules.setdefault("weasyprint", type(sys)("weasyprint"))

from sqlalchemy import text
from app.database import engine, Base
import app.models  # registers all models including new ones


def run():
    Base.metadata.create_all(engine)
    print("New tables created (idempotent).")

    new_columns = [
        ("nota_ventas",       "ALTER TABLE nota_ventas ADD COLUMN direccion_despacho TEXT"),
        ("nota_ventas",       "ALTER TABLE nota_ventas ADD COLUMN retiro_en_conico INTEGER NOT NULL DEFAULT 0"),
        ("nota_ventas",       "ALTER TABLE nota_ventas ADD COLUMN terminos_pago VARCHAR(255)"),
        ("cotizaciones",      "ALTER TABLE cotizaciones ADD COLUMN validez_dias INTEGER NOT NULL DEFAULT 5"),
        ("cotizacion_lineas", "ALTER TABLE cotizacion_lineas ADD COLUMN descuento REAL NOT NULL DEFAULT 0.0"),
        ("facturas",          "ALTER TABLE facturas ADD COLUMN banco_receptor_id INTEGER REFERENCES banco_receptores(id)"),
    ]
    with engine.connect() as conn:
        for table, stmt in new_columns:
            try:
                conn.execute(text(stmt))
                conn.commit()
                print(f"  + {table}: column added")
            except Exception as e:
                msg = str(e).lower()
                if "duplicate column" in msg or "already exists" in msg:
                    print(f"  = {table}: already exists, skipped")
                else:
                    raise
    print("Migration complete.")


if __name__ == "__main__":
    run()
```

- [ ] **Step 12: Run tests — verify they pass**

```bash
cd backend && python -m pytest tests/test_tags.py -v
```

Expected: 4 passed

- [ ] **Step 13: Commit Task 1**

```bash
cd backend && git add app/models/tag.py app/schemas/tag.py app/api/tags.py app/models/producto.py app/models/__init__.py app/schemas/producto.py app/api/productos.py app/main.py tests/conftest.py tests/test_tags.py migrate_sprint_a.py
git commit -m "feat(tags): product tags model, API, and SKU/tag search"
```

---

## Task 2: NV Dispatch Address — Backend

**Files:**
- Create: `backend/tests/test_nv_despacho.py`
- Modify: `backend/app/models/nota_venta.py`
- Modify: `backend/app/schemas/nota_venta.py`
- Modify: `backend/app/api/nota_ventas.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_nv_despacho.py`:

```python
def _make_cliente(db):
    from app.models.cliente import Cliente
    c = Cliente(nombre="Test Cliente")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_crear_nv_sin_direccion_ni_retiro_falla(client, admin_token, db):
    c = _make_cliente(db)
    resp = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": c.id, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422
    detail = str(resp.json()["detail"]).lower()
    assert "despacho" in detail or "retiro" in detail


def test_crear_nv_con_retiro_en_conico(client, admin_token, db):
    c = _make_cliente(db)
    resp = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": c.id, "retiro_en_conico": True, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["retiro_en_conico"] is True
    assert data["direccion_despacho"] is None


def test_crear_nv_con_direccion(client, admin_token, db):
    c = _make_cliente(db)
    resp = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": c.id, "direccion_despacho": "Calle Falsa 123", "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["direccion_despacho"] == "Calle Falsa 123"
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && python -m pytest tests/test_nv_despacho.py -v 2>&1 | head -30
```

Expected: FAILED

- [ ] **Step 3: Add fields to NotaVenta model**

In `backend/app/models/nota_venta.py`, add `Boolean` to the SQLAlchemy imports line so it reads:

```python
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
```

In `NotaVenta` class, add after `nota`:

```python
    direccion_despacho: Mapped[str | None] = mapped_column(Text, nullable=True)
    retiro_en_conico: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("0"))
    terminos_pago: Mapped[str | None] = mapped_column(String(255), nullable=True)
```

- [ ] **Step 4: Update NotaVenta schemas**

In `backend/app/schemas/nota_venta.py`:

In `NotaVentaCreate`, add:
```python
    direccion_despacho: str | None = None
    retiro_en_conico: bool = False
    terminos_pago: str | None = None
```

In `NotaVentaUpdate`, add:
```python
    direccion_despacho: str | None = None
    retiro_en_conico: bool | None = None
    terminos_pago: str | None = None
```

In both `NotaVentaOut` and `NotaVentaListOut`, add:
```python
    direccion_despacho: str | None = None
    retiro_en_conico: bool = False
    terminos_pago: str | None = None
```

- [ ] **Step 5: Add dispatch validation to nota_ventas.py**

In `backend/app/api/nota_ventas.py`, add helper after `_check_lineas_invalidas`:

```python
def _validate_despacho(retiro: bool, direccion: str | None) -> None:
    if not retiro and not (direccion and direccion.strip()):
        raise HTTPException(
            status_code=422,
            detail="Debe indicar dirección de despacho o marcar retiro en Conico.",
        )
```

In `crear_nota_venta` (the POST `/` endpoint), call it right after the body is received, before any DB writes:

```python
    _validate_despacho(body.retiro_en_conico, body.direccion_despacho)
```

In `actualizar_nota_venta` (the PATCH endpoint), after retrieving the NV object and before applying updates:

```python
    nuevo_retiro = body.retiro_en_conico if body.retiro_en_conico is not None else nv.retiro_en_conico
    nueva_dir = body.direccion_despacho if body.direccion_despacho is not None else nv.direccion_despacho
    _validate_despacho(nuevo_retiro, nueva_dir)
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd backend && python -m pytest tests/test_nv_despacho.py -v
```

Expected: 3 passed

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/app/models/nota_venta.py backend/app/schemas/nota_venta.py backend/app/api/nota_ventas.py backend/tests/test_nv_despacho.py
git commit -m "feat(nv): dispatch address and Conico pickup validation"
```

---

## Task 3: NV Dispatch — Frontend

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

- [ ] **Step 1: Update NotaVenta type**

In `frontend/src/types/index.ts`, find the `NotaVenta` interface (search for `numero:`) and add:

```typescript
  direccion_despacho: string | null
  retiro_en_conico: boolean
  terminos_pago: string | null
```

- [ ] **Step 2: Add state variables in NotaVentaDetalle**

In `frontend/src/pages/NotaVentaDetalle.tsx`, near the other `useState` declarations, add:

```typescript
const [retiroEnConico, setRetiroEnConico] = useState(false)
const [direccionDespacho, setDireccionDespacho] = useState('')
```

In the `useEffect` or wherever the form is initialized from the loaded NV data, add:

```typescript
setRetiroEnConico(nv.retiro_en_conico ?? false)
setDireccionDespacho(nv.direccion_despacho ?? '')
```

- [ ] **Step 3: Add dispatch UI block to the form**

In the form section (where contacto, correo, nota inputs are rendered), add a dispatch block:

```tsx
{/* Despacho */}
<div className="space-y-2">
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={retiroEnConico}
      onChange={e => {
        setRetiroEnConico(e.target.checked)
        if (e.target.checked) setDireccionDespacho('')
        setFormDirty(true)  // use whatever dirty-flag setter is used for other fields
      }}
      className="rounded border-gray-300"
    />
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Retiro en Conico</span>
  </label>
  {!retiroEnConico && (
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        Dirección de despacho <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={direccionDespacho}
        onChange={e => { setDireccionDespacho(e.target.value); setFormDirty(true) }}
        placeholder="Calle, número, ciudad"
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      />
    </div>
  )}
</div>
```

Note: Replace `setFormDirty(true)` with the actual dirty-tracking call used in this component — look at how other `onChange` handlers flag unsaved changes.

- [ ] **Step 4: Include fields in save payload**

Find the save mutation object passed to the API and add:

```typescript
direccion_despacho: retiroEnConico ? null : (direccionDespacho.trim() || null),
retiro_en_conico: retiroEnConico,
```

- [ ] **Step 5: Show dispatch in read-only detail view**

Find the read-only info section (outside the edit form) and add:

```tsx
<div className="text-sm">
  <span className="font-medium text-gray-500 dark:text-gray-400">Despacho: </span>
  <span className="text-gray-900 dark:text-gray-100">
    {nv.retiro_en_conico ? 'Retiro en Conico' : (nv.direccion_despacho || '—')}
  </span>
</div>
```

- [ ] **Step 6: Commit Task 3**

```bash
git add frontend/src/types/index.ts frontend/src/pages/NotaVentaDetalle.tsx
git commit -m "feat(nv): dispatch address and Conico pickup UI"
```

---

## Task 4: Cotización — Validez + Descuento Backend

**Files:**
- Create: `backend/tests/test_cotizacion_extras.py`
- Modify: `backend/app/models/cotizacion.py`
- Modify: `backend/app/schemas/cotizacion.py`
- Modify: `backend/app/api/cotizaciones.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_cotizacion_extras.py`:

```python
import pytest
from decimal import Decimal


def _make_cliente_vendedor(db):
    from app.models.cliente import Cliente
    from app.models.user import User
    from app.core.security import get_password_hash
    c = Cliente(nombre="Test")
    u = User(email="v@cottest.cl", name="V", hashed_password=get_password_hash("x"), role="admin")
    db.add_all([c, u])
    db.commit()
    db.refresh(c)
    db.refresh(u)
    return c, u


def test_cotizacion_validez_dias_default(client, admin_token, db):
    c, u = _make_cliente_vendedor(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "vendedor_id": u.id, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["validez_dias"] == 5


def test_cotizacion_validez_dias_custom(client, admin_token, db):
    c, u = _make_cliente_vendedor(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "vendedor_id": u.id, "validez_dias": 15, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["validez_dias"] == 15


def test_cotizacion_linea_con_descuento(client, admin_token, db):
    c, u = _make_cliente_vendedor(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": c.id,
            "vendedor_id": u.id,
            "lineas": [{"orden": 1, "descripcion": "Item", "cantidad": 2, "valor_neto": 100, "descuento": 10}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    linea = resp.json()["lineas"][0]
    assert float(linea["descuento"]) == pytest.approx(10.0)
    # total_neto = 2 * 100 * (1 - 10/100) = 180
    assert float(linea["total_neto"]) == pytest.approx(180.0)
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && python -m pytest tests/test_cotizacion_extras.py -v 2>&1 | head -30
```

Expected: FAILED

- [ ] **Step 3: Add fields to cotizacion models**

In `backend/app/models/cotizacion.py`:

In `Cotizacion` class, add after `terminos_pago_estado`:

```python
    validez_dias: Mapped[int] = mapped_column(Integer, default=5, server_default=text("5"))
```

In `CotizacionLinea` class, add after `valor_neto`:

```python
    descuento: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"), server_default=text("0"))
```

- [ ] **Step 4: Update cotizacion schemas**

In `backend/app/schemas/cotizacion.py`:

In `CotizacionLineaCreate`, add:
```python
    descuento: Decimal = Decimal("0")
```

In `CotizacionLineaOut`, add:
```python
    descuento: Decimal = Decimal("0")
```

In `CotizacionCreate`, add:
```python
    validez_dias: int = 5
```

In `CotizacionUpdate`, add:
```python
    validez_dias: int | None = None
```

In both `CotizacionOut` and `CotizacionListOut`, add:
```python
    validez_dias: int = 5
```

- [ ] **Step 5: Update _calcular_lineas to apply discount**

In `backend/app/api/cotizaciones.py`, find `_calcular_lineas`. Update the `total_neto` line:

Old:
```python
        total_neto = data.cantidad * data.valor_neto
```

New:
```python
        descuento = data.descuento if hasattr(data, 'descuento') else Decimal("0")
        total_neto = data.cantidad * data.valor_neto * (1 - descuento / 100)
```

Also pass `descuento` when constructing `CotizacionLinea`:
```python
        lineas.append(CotizacionLinea(
            orden=data.orden,
            producto_id=data.producto_id,
            sku=data.sku,
            descripcion=data.descripcion,
            formato=data.formato,
            cantidad=data.cantidad,
            valor_neto=data.valor_neto,
            descuento=descuento,
            total_neto=total_neto,
            iva=iva,
            total=total,
            margen=margen,
        ))
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd backend && python -m pytest tests/test_cotizacion_extras.py -v
```

Expected: 3 passed

- [ ] **Step 7: Commit Task 4**

```bash
git add backend/app/models/cotizacion.py backend/app/schemas/cotizacion.py backend/app/api/cotizaciones.py backend/tests/test_cotizacion_extras.py
git commit -m "feat(cotizacion): validez_dias and per-line discount with recalculation"
```

---

## Task 5: Cotización — Validez + Descuento Frontend

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Update types**

In `frontend/src/types/index.ts`:

Find `CotizacionLinea` interface and add:
```typescript
  descuento: number
```

Find `Cotizacion` interface and add:
```typescript
  validez_dias: number
```

- [ ] **Step 2: Update LineaLocal and newLinea**

In `frontend/src/pages/CotizacionDetalle.tsx`:

Find `type LineaLocal` and add `descuento: number` to it.

Find `function newLinea` and add `descuento: 0` to the returned object.

- [ ] **Step 3: Update calcLinea to apply discount**

Find `function calcLinea` and replace it entirely:

```typescript
function calcLinea(l: LineaLocal): LineaLocal {
  const cantidad = Number(l.cantidad) || 0
  const valor_neto = Number(l.valor_neto) || 0
  const descuento = Math.min(100, Math.max(0, Number(l.descuento) || 0))
  const total_neto = Math.round(cantidad * valor_neto * (1 - descuento / 100) * 100) / 100
  const iva = Math.round(total_neto * 0.19 * 100) / 100
  const total = total_neto + iva
  return { ...l, cantidad, valor_neto, descuento, total_neto, iva, total }
}
```

- [ ] **Step 4: Add validez_dias state and UI**

Near the other state declarations, add:
```typescript
const [validezDias, setValidezDias] = useState<number>(5)
```

In the `useEffect` that syncs from `cot`, add:
```typescript
setValidezDias(cot.validez_dias ?? 5)
```

In the form header area (near `terminos_pago`, `fecha`), add:
```tsx
<div>
  <label className="block text-xs text-gray-500 mb-1">Validez (días)</label>
  <input
    type="number"
    min={1}
    value={validezDias}
    onChange={e => { setValidezDias(Number(e.target.value)); markDirty() }}
    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
  />
  {cot?.fecha && (
    <p className="text-xs text-gray-400 mt-1">
      Vence:{' '}
      {new Date(new Date(cot.fecha + 'T00:00:00').getTime() + validezDias * 86400000)
        .toLocaleDateString('es-CL')}
    </p>
  )}
</div>
```

Note: replace `markDirty()` with the actual dirty-tracking call used by other form fields (e.g. `setFormDirty(true)` or the snapshot pattern — check existing onChange handlers).

Include `validez_dias: validezDias` in the save payload.

- [ ] **Step 5: Add descuento column to lineas table**

In the lineas table header row, add a column after `Precio unit.`:
```tsx
<th className="text-right text-xs font-medium text-gray-500 uppercase px-2 py-2 w-20">Desc %</th>
```

In each line row, add a cell after the `valor_neto` cell:
```tsx
<td className="px-2 py-1">
  <input
    type="number"
    min={0}
    max={100}
    step={0.1}
    value={linea.descuento ?? 0}
    onChange={e => updateLinea(linea._key, { descuento: Number(e.target.value) })}
    className="w-16 text-right border border-gray-200 rounded px-1 py-0.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
  />
</td>
```

Note: `updateLinea` is whatever function updates a line's fields and triggers `calcLinea` — look for the existing pattern where `valor_neto` or `cantidad` are updated.

Include `descuento: linea.descuento ?? 0` in the line payloads sent to the API.

- [ ] **Step 6: Commit Task 5**

```bash
git add frontend/src/types/index.ts frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat(cotizacion): validity days and per-line discount UI"
```

---

## Task 6: BancoReceptor — Backend

**Files:**
- Create: `backend/app/models/banco_receptor.py`
- Create: `backend/app/schemas/banco_receptor.py`
- Create: `backend/app/api/bancos_receptores.py`
- Create: `backend/tests/test_banco_receptor.py`
- Modify: `backend/app/models/factura.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/schemas/factura.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_banco_receptor.py`:

```python
def test_crear_banco_receptor(client, admin_token):
    resp = client.post(
        "/api/bancos-receptores/",
        json={"nombre": "Banco Estado"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["nombre"] == "Banco Estado"
    assert data["activo"] is True


def test_listar_bancos(client, admin_token):
    client.post("/api/bancos-receptores/", json={"nombre": "Santander"}, headers={"Authorization": f"Bearer {admin_token}"})
    resp = client.get("/api/bancos-receptores/", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert any(b["nombre"] == "Santander" for b in resp.json())


def test_toggle_banco(client, admin_token):
    r = client.post("/api/bancos-receptores/", json={"nombre": "BCI"}, headers={"Authorization": f"Bearer {admin_token}"})
    bid = r.json()["id"]
    resp = client.patch(f"/api/bancos-receptores/{bid}", json={"activo": False}, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["activo"] is False


def test_factura_acepta_banco_receptor_id(client, admin_token, db):
    from app.models.banco_receptor import BancoReceptor
    from app.models.cliente import Cliente
    banco = BancoReceptor(nombre="BICE")
    c = Cliente(nombre="Cliente BRTest")
    db.add_all([banco, c])
    db.commit()
    db.refresh(banco)
    db.refresh(c)

    resp = client.post(
        "/api/facturas/",
        json={"cliente_id": c.id, "banco_receptor_id": banco.id, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["banco_receptor_id"] == banco.id
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && python -m pytest tests/test_banco_receptor.py -v 2>&1 | head -30
```

Expected: FAILED

- [ ] **Step 3: Create BancoReceptor model**

Create `backend/app/models/banco_receptor.py`:

```python
from sqlalchemy import String, Boolean, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class BancoReceptor(Base):
    __tablename__ = "banco_receptores"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(200), unique=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("1"))
```

- [ ] **Step 4: Add FK and relationship to Factura model**

In `backend/app/models/factura.py`, add after `metodo_pago`:

```python
    banco_receptor_id: Mapped[int | None] = mapped_column(
        ForeignKey("banco_receptores.id", ondelete="SET NULL"), nullable=True
    )
```

Add relationship after the existing ones:

```python
    banco_receptor: Mapped["BancoReceptor | None"] = relationship("BancoReceptor")
```

- [ ] **Step 5: Register in __init__.py**

In `backend/app/models/__init__.py`, add:

```python
from app.models.banco_receptor import BancoReceptor  # noqa: F401
```

- [ ] **Step 6: Update conftest.py**

In `backend/tests/conftest.py`, inside `setup_test_db`, add:

```python
    import app.models.banco_receptor  # noqa: F401
```

- [ ] **Step 7: Create BancoReceptor schema and router**

Create `backend/app/schemas/banco_receptor.py`:

```python
from pydantic import BaseModel


class BancoReceptorOut(BaseModel):
    id: int
    nombre: str
    activo: bool
    model_config = {"from_attributes": True}


class BancoReceptorCreate(BaseModel):
    nombre: str


class BancoReceptorPatch(BaseModel):
    nombre: str | None = None
    activo: bool | None = None
```

Create `backend/app/api/bancos_receptores.py`:

```python
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import require_permission
from app.models.banco_receptor import BancoReceptor
from app.models.user import User
from app.schemas.banco_receptor import BancoReceptorCreate, BancoReceptorOut, BancoReceptorPatch

router = APIRouter()


@router.get("/", response_model=list[BancoReceptorOut])
def listar_bancos(perms: tuple[User, Session] = require_permission("config", "view")):
    _, db = perms
    return db.query(BancoReceptor).order_by(BancoReceptor.nombre).all()


@router.post("/", response_model=BancoReceptorOut, status_code=status.HTTP_201_CREATED)
def crear_banco(body: BancoReceptorCreate, perms: tuple[User, Session] = require_permission("config", "edit")):
    _, db = perms
    banco = BancoReceptor(nombre=body.nombre.strip())
    db.add(banco)
    db.commit()
    db.refresh(banco)
    return banco


@router.patch("/{banco_id}", response_model=BancoReceptorOut)
def actualizar_banco(banco_id: int, body: BancoReceptorPatch, perms: tuple[User, Session] = require_permission("config", "edit")):
    _, db = perms
    banco = db.get(BancoReceptor, banco_id)
    if not banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(banco, field, value)
    db.commit()
    db.refresh(banco)
    return banco


@router.delete("/{banco_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_banco(banco_id: int, perms: tuple[User, Session] = require_permission("config", "edit")):
    _, db = perms
    banco = db.get(BancoReceptor, banco_id)
    if not banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    db.delete(banco)
    db.commit()
```

- [ ] **Step 8: Register router in main.py**

In `backend/app/main.py`, add import after `from app.api import reportes`:

```python
from app.api import bancos_receptores, tags
```

(merge with the tags import added in Task 1 if already there)

Add router:

```python
app.include_router(bancos_receptores.router, prefix="/api/bancos-receptores", tags=["config"])
```

- [ ] **Step 9: Update Factura schemas**

In `backend/app/schemas/factura.py`:

In `FacturaCreate`, add:
```python
    banco_receptor_id: int | None = None
```

In `FacturaUpdate`, add:
```python
    banco_receptor_id: int | None = None
```

In `FacturaOut` and `FacturaListOut`, add:
```python
    banco_receptor_id: int | None = None
```

Then in `backend/app/api/facturas.py`, find the `crear_factura` endpoint and ensure `banco_receptor_id` from `body` is set on the `Factura` object (same pattern as other optional fields like `metodo_pago`).

- [ ] **Step 10: Run tests — verify they pass**

```bash
cd backend && python -m pytest tests/test_banco_receptor.py -v
```

Expected: 4 passed

- [ ] **Step 11: Commit Task 6**

```bash
git add backend/app/models/banco_receptor.py backend/app/schemas/banco_receptor.py backend/app/api/bancos_receptores.py backend/app/models/__init__.py backend/app/models/factura.py backend/app/schemas/factura.py backend/app/main.py backend/tests/conftest.py backend/tests/test_banco_receptor.py
git commit -m "feat(factura): banco receptor model, API, and FK"
```

---

## Task 7: BancoReceptor — Frontend

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/Configuracion.tsx`
- Modify: `frontend/src/pages/FacturaDetalle.tsx`

- [ ] **Step 1: Add BancoReceptor type and update Factura**

In `frontend/src/types/index.ts`, add:

```typescript
export interface BancoReceptor {
  id: number
  nombre: string
  activo: boolean
}
```

Find `Factura` interface (search for `nv_id:`) and add:

```typescript
  banco_receptor_id: number | null
```

- [ ] **Step 2: Add banco management section to Configuracion.tsx**

In `frontend/src/pages/Configuracion.tsx`:

Add import: `import type { BancoReceptor } from '../types'` (merge with existing type imports).

Add state and queries alongside the existing config query:

```typescript
const [nuevoBanco, setNuevoBanco] = useState('')

const { data: bancos = [] } = useQuery<BancoReceptor[]>({
  queryKey: ['bancos-receptores'],
  queryFn: () => api.get('/api/bancos-receptores').then(r => r.data),
})

const addBanco = useMutation({
  mutationFn: (nombre: string) => api.post('/api/bancos-receptores', { nombre }),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ['bancos-receptores'] }); setNuevoBanco('') },
})

const toggleBanco = useMutation({
  mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
    api.patch(`/api/bancos-receptores/${id}`, { activo }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['bancos-receptores'] }),
})
```

In the JSX, after the last existing section (banking fields, etc.), add:

```tsx
<section className="mt-8 border-t pt-6">
  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
    Bancos de recepción de pagos
  </h2>
  <div className="space-y-1 mb-3">
    {bancos.map(b => (
      <div key={b.id} className="flex items-center justify-between text-sm py-1">
        <span className={b.activo ? 'text-gray-900 dark:text-gray-100' : 'line-through text-gray-400'}>
          {b.nombre}
        </span>
        <button
          onClick={() => toggleBanco.mutate({ id: b.id, activo: !b.activo })}
          className="text-xs text-blue-500 hover:underline ml-4"
        >
          {b.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    ))}
    {bancos.length === 0 && <p className="text-xs text-gray-400">Sin bancos configurados</p>}
  </div>
  <div className="flex gap-2">
    <input
      type="text"
      value={nuevoBanco}
      onChange={e => setNuevoBanco(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && nuevoBanco.trim() && addBanco.mutate(nuevoBanco.trim())}
      placeholder="Nombre del banco"
      className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
    />
    <button
      onClick={() => nuevoBanco.trim() && addBanco.mutate(nuevoBanco.trim())}
      disabled={!nuevoBanco.trim() || addBanco.isPending}
      className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
    >
      Agregar
    </button>
  </div>
</section>
```

- [ ] **Step 3: Add banco select to FacturaDetalle.tsx**

In `frontend/src/pages/FacturaDetalle.tsx`:

Add query:
```typescript
const { data: bancos = [] } = useQuery<BancoReceptor[]>({
  queryKey: ['bancos-receptores'],
  queryFn: () => api.get('/api/bancos-receptores').then(r => r.data),
})
```

Add state:
```typescript
const [bancoReceptorId, setBancoReceptorId] = useState<number | null>(null)
```

In the `useEffect` that syncs form from loaded factura:
```typescript
setBancoReceptorId(factura.banco_receptor_id ?? null)
```

In the form, add the select field:
```tsx
<div>
  <label className="block text-xs text-gray-500 mb-1">Banco de recepción</label>
  <select
    value={bancoReceptorId ?? ''}
    onChange={e => setBancoReceptorId(e.target.value ? Number(e.target.value) : null)}
    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
  >
    <option value="">Sin especificar</option>
    {bancos.filter(b => b.activo).map(b => (
      <option key={b.id} value={b.id}>{b.nombre}</option>
    ))}
  </select>
</div>
```

Include `banco_receptor_id: bancoReceptorId` in the save payload.

- [ ] **Step 4: Commit Task 7**

```bash
git add frontend/src/types/index.ts frontend/src/pages/Configuracion.tsx frontend/src/pages/FacturaDetalle.tsx
git commit -m "feat(factura): banco receptor settings and factura form"
```

---

## Task 8: Empresa — Enforce Al Contado Backend

**Files:**
- Create: `backend/tests/test_empresa_credito.py`
- Modify: `backend/app/api/cotizaciones.py`
- Modify: `backend/app/api/nota_ventas.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_empresa_credito.py`:

```python
from decimal import Decimal


def _setup(db):
    from app.models.cliente import Cliente
    from app.models.empresa import Empresa
    from app.models.user import User
    from app.core.security import get_password_hash

    emp_sin = Empresa(nombre="SinCredito")
    emp_con = Empresa(nombre="ConCredito", linea_credito=Decimal("1000000"))
    c = Cliente(nombre="Test")
    u = User(email="v@credtest.cl", name="V", hashed_password=get_password_hash("x"), role="admin")
    db.add_all([emp_sin, emp_con, c, u])
    db.commit()
    for obj in [emp_sin, emp_con, c, u]:
        db.refresh(obj)
    return emp_sin, emp_con, c, u


def test_cotizacion_sin_credito_fuerza_al_contado(client, admin_token, db):
    emp_sin, _, c, u = _setup(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "vendedor_id": u.id, "empresa_id": emp_sin.id, "terminos_pago": "30 días", "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["terminos_pago"] == "al_contado"


def test_cotizacion_con_credito_respeta_terminos(client, admin_token, db):
    _, emp_con, c, u = _setup(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "vendedor_id": u.id, "empresa_id": emp_con.id, "terminos_pago": "30 días", "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["terminos_pago"] == "30 días"


def test_cotizacion_sin_empresa_respeta_terminos(client, admin_token, db):
    from app.models.cliente import Cliente
    from app.models.user import User
    from app.core.security import get_password_hash
    c = Cliente(nombre="SinEmp")
    u = User(email="v@noemptest.cl", name="V3", hashed_password=get_password_hash("x"), role="admin")
    db.add_all([c, u]); db.commit(); db.refresh(c); db.refresh(u)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "vendedor_id": u.id, "terminos_pago": "60 días", "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["terminos_pago"] == "60 días"
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && python -m pytest tests/test_empresa_credito.py -v 2>&1 | head -30
```

Expected: FAILED (no enforcement in place)

- [ ] **Step 3: Add enforcement helper to cotizaciones.py**

In `backend/app/api/cotizaciones.py`, add helper after `_calc_terminos_estado`:

```python
def _enforce_al_contado(empresa_id: int | None, terminos_pago: str | None, db: Session) -> str | None:
    if not empresa_id:
        return terminos_pago
    empresa = db.get(Empresa, empresa_id)
    if empresa and (empresa.linea_credito is None or empresa.linea_credito <= 0):
        return "al_contado"
    return terminos_pago
```

In `crear_cotizacion` (POST `/`), right before the `Cotizacion(...)` object is constructed, add:

```python
    terminos = _enforce_al_contado(body.empresa_id, body.terminos_pago, db)
```

Then use `terminos` in place of `body.terminos_pago` when setting `cotizacion.terminos_pago`.

In `actualizar_cotizacion` (PATCH `/{cotizacion_id}`), after all field updates are applied and before `db.commit()`, add:

```python
    cotizacion.terminos_pago = _enforce_al_contado(cotizacion.empresa_id, cotizacion.terminos_pago, db)
```

- [ ] **Step 4: Add enforcement helper to nota_ventas.py**

In `backend/app/api/nota_ventas.py`, add helper after `_validate_despacho`:

```python
def _enforce_al_contado(empresa_id: int | None, terminos_pago: str | None, db: Session) -> str | None:
    if not empresa_id:
        return terminos_pago
    empresa = db.get(Empresa, empresa_id)
    if empresa and (empresa.linea_credito is None or empresa.linea_credito <= 0):
        return "al_contado"
    return terminos_pago
```

In `crear_nota_venta`, after `_validate_despacho` and before `db.add(nv)`:

```python
    nv.terminos_pago = _enforce_al_contado(body.empresa_id, body.terminos_pago, db)
```

In `actualizar_nota_venta`, after applying updates, before `db.commit()`:

```python
    nv.terminos_pago = _enforce_al_contado(nv.empresa_id, nv.terminos_pago, db)
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd backend && python -m pytest tests/test_empresa_credito.py -v
```

Expected: 3 passed

- [ ] **Step 6: Commit Task 8**

```bash
git add backend/app/api/cotizaciones.py backend/app/api/nota_ventas.py backend/tests/test_empresa_credito.py
git commit -m "feat(empresa): enforce al contado when no credit line"
```

---

## Task 9: Empresa Al Contado — Frontend

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

- [ ] **Step 1: Lock terminos_pago in CotizacionDetalle**

In `frontend/src/pages/CotizacionDetalle.tsx`, find where `empresa` is used (it's already fetched since the page shows empresa info). Add:

```typescript
const empresaSinCredito = empresa != null && (empresa.linea_credito == null || empresa.linea_credito <= 0)
```

Find the `terminos_pago` input field and replace it with a conditional version:

```tsx
<input
  type="text"
  value={empresaSinCredito ? 'Al contado' : terminosPago}
  disabled={empresaSinCredito}
  onChange={e => { if (!empresaSinCredito) { setTerminosPago(e.target.value); markDirty() } }}
  placeholder="Ej: 30 días, contado"
  className={`w-full border rounded-md px-3 py-2 text-sm dark:border-gray-600 ${
    empresaSinCredito
      ? 'bg-gray-100 text-gray-500 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'
      : 'dark:bg-gray-700 dark:text-white'
  }`}
/>
{empresaSinCredito && (
  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
    Esta empresa no tiene línea de crédito.
  </p>
)}
```

Note: replace `markDirty()` and `terminosPago`/`setTerminosPago` with the actual variable names used in this component.

- [ ] **Step 2: Lock terminos_pago in NotaVentaDetalle**

In `frontend/src/pages/NotaVentaDetalle.tsx`, add the same derived variable:

```typescript
const empresaSinCredito = empresa != null && (empresa.linea_credito == null || empresa.linea_credito <= 0)
```

If `terminos_pago` is displayed or editable in this form, apply the same disabled treatment. If the NV form does not currently have a `terminos_pago` field, skip the input change and only ensure the save payload sends `terminos_pago: empresaSinCredito ? 'al_contado' : terminosPago`.

- [ ] **Step 3: Commit Task 9**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx frontend/src/pages/NotaVentaDetalle.tsx
git commit -m "feat(empresa): lock payment terms UI when no credit line"
```

---

## Task 10: Run Migration on Main DB

**Files:** run `backend/migrate_sprint_a.py`

- [ ] **Step 1: Run migration**

```bash
cd backend && python migrate_sprint_a.py
```

Expected output (columns already-added lines are fine if re-run):
```
New tables created (idempotent).
  + nota_ventas: column added
  + nota_ventas: column added
  + nota_ventas: column added
  + cotizaciones: column added
  + cotizacion_lineas: column added
  + facturas: column added
Migration complete.
```

- [ ] **Step 2: Run full test suite**

```bash
cd backend && python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: all new tests pass, no regressions in existing tests.

- [ ] **Step 3: Commit**

```bash
git add backend/migrate_sprint_a.py
git commit -m "chore: Sprint A migration applied to main DB"
```
