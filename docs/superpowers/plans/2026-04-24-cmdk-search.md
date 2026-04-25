# Búsqueda global Cmd+K — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app global search modal accessible by configurable keyboard shortcut, fanning out to 8 entity types with permission-aware filtering.

**Architecture:** Single backend endpoint `GET /api/search` runs sequential SQL queries across productos/clientes/empresas/cotizaciones/notas_venta/facturas/ordenes_compra/empleados, omitting categories the user can't access. Frontend uses `cmdk` library inside an `AppLayout`-mounted modal. User preferences (button visibility + shortcut choice) persist in a new `users.preferencias` JSON column.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic + pytest (backend); React 18 + TypeScript + react-query + zustand + Tailwind + cmdk + lucide-react (frontend); existing auth (`get_current_user`) and permission helper (`has_permission`).

**Spec:** `docs/superpowers/specs/2026-04-24-cmdk-design.md`

---

## File Structure

**Backend (new):**
- `backend/migrations/versions/x3y4z5a6b7c8_add_users_preferencias.py` — migration
- `backend/app/api/search.py` — search router (single endpoint)
- `backend/app/schemas/preferencias.py` — Pydantic schemas
- `backend/tests/test_search.py` — search endpoint tests
- `backend/tests/test_preferencias.py` — preferences endpoint tests

**Backend (modified):**
- `backend/app/models/user.py` — add `preferencias` column
- `backend/app/api/users.py` — add `me/preferencias` GET/PATCH
- `backend/app/main.py` — register search router

**Frontend (new):**
- `frontend/src/api/search.ts` — API client for `/api/search`
- `frontend/src/api/preferencias.ts` — API client for `/api/users/me/preferencias`
- `frontend/src/stores/preferences.ts` — zustand store
- `frontend/src/hooks/useGlobalSearch.ts` — react-query hook with debounce + abort
- `frontend/src/hooks/useGlobalShortcut.ts` — keyboard listener bound to pref
- `frontend/src/hooks/useRecentEntities.ts` — localStorage CRUD for recents
- `frontend/src/components/search/GlobalSearchModal.tsx` — modal shell
- `frontend/src/components/search/SearchButton.tsx` — header button
- `frontend/src/components/search/items/ProductoItem.tsx`
- `frontend/src/components/search/items/ClienteItem.tsx`
- `frontend/src/components/search/items/EmpresaItem.tsx`
- `frontend/src/components/search/items/DocumentoItem.tsx` — cotización/NV/factura/OC
- `frontend/src/components/search/items/EmpleadoItem.tsx`
- `frontend/src/components/search/RecentesGroup.tsx`
- `frontend/src/__tests__/GlobalSearchModal.test.tsx`
- `frontend/src/__tests__/useGlobalShortcut.test.tsx`
- `frontend/src/__tests__/Preferencias.test.tsx`

**Frontend (modified):**
- `frontend/package.json` — add `cmdk`
- `frontend/src/components/layout/AppLayout.tsx` — mount modal + button
- `frontend/src/pages/Configuracion.tsx` — add Búsqueda section
- `frontend/src/pages/Login.tsx` — hydrate preferences store on success

---

## Phase 1 — Backend: preferencias

### Task 1: Migration `users.preferencias`

**Files:**
- Create: `backend/migrations/versions/x3y4z5a6b7c8_add_users_preferencias.py`

- [ ] **Step 1: Create migration file**

```python
"""add_users_preferencias

Revision ID: x3y4z5a6b7c8
Revises: w2x3y4z5a6b7
Create Date: 2026-04-24 22:00:00.000000

Adds JSON column users.preferencias for per-user UI preferences.
Uses generic JSON (Postgres → JSONB, SQLite → TEXT) for cross-env portability.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'x3y4z5a6b7c8'
down_revision: Union[str, Sequence[str], None] = 'w2x3y4z5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'preferencias',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'preferencias')
```

- [ ] **Step 2: Verify migration head chain**

Run: `cd backend && alembic heads`
Expected: a single head `x3y4z5a6b7c8`

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/versions/x3y4z5a6b7c8_add_users_preferencias.py
git commit -m "feat(preferencias): migration adds users.preferencias JSON column"
```

---

### Task 2: User model field

**Files:**
- Modify: `backend/app/models/user.py`

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_users.py`:

```python
def test_user_has_preferencias_default_empty_dict(db, admin_user):
    fresh = db.get(__import__("app.models.user", fromlist=["User"]).User, admin_user.id)
    assert fresh.preferencias == {}
```

- [ ] **Step 2: Run test — should fail**

Run: `cd backend && pytest tests/test_users.py::test_user_has_preferencias_default_empty_dict -v`
Expected: FAIL with `AttributeError: 'User' object has no attribute 'preferencias'`

- [ ] **Step 3: Add column to model**

Modify `backend/app/models/user.py` — add this import and column:

```python
from sqlalchemy import JSON
# ... existing imports ...

class User(Base):
    __tablename__ = "users"
    # ... existing columns ...
    preferencias: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'"))
```

- [ ] **Step 4: Run test — should pass**

Run: `cd backend && pytest tests/test_users.py::test_user_has_preferencias_default_empty_dict -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/user.py backend/tests/test_users.py
git commit -m "feat(preferencias): add User.preferencias JSON field"
```

---

### Task 3: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/preferencias.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_preferencias.py`:

```python
import pytest


def test_get_returns_defaults_for_new_user(client, admin_token):
    resp = client.get("/api/users/me/preferencias", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"busqueda_boton_visible": True, "busqueda_atajo": "ctrl_k"}
```

- [ ] **Step 2: Run test — should fail**

Run: `cd backend && pytest tests/test_preferencias.py::test_get_returns_defaults_for_new_user -v`
Expected: FAIL — 404 Not Found

- [ ] **Step 3: Create schemas**

`backend/app/schemas/preferencias.py`:

```python
from typing import Literal
from pydantic import BaseModel


AtajoBusqueda = Literal["ctrl_k", "ctrl_p", "ctrl_shift_f", "alt_s"]


DEFAULTS: dict = {
    "busqueda_boton_visible": True,
    "busqueda_atajo": "ctrl_k",
}


class PreferenciasOut(BaseModel):
    busqueda_boton_visible: bool
    busqueda_atajo: AtajoBusqueda


class PreferenciasUpdate(BaseModel):
    busqueda_boton_visible: bool | None = None
    busqueda_atajo: AtajoBusqueda | None = None


def merge_with_defaults(stored: dict | None) -> dict:
    return {**DEFAULTS, **(stored or {})}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/preferencias.py backend/tests/test_preferencias.py
git commit -m "feat(preferencias): pydantic schemas + defaults helper"
```

---

### Task 4: Endpoints `me/preferencias`

**Files:**
- Modify: `backend/app/api/users.py`
- Modify: `backend/tests/test_preferencias.py`

- [ ] **Step 1: Add more failing tests**

Append to `backend/tests/test_preferencias.py`:

```python
def test_patch_updates_partial_preserves_other_keys(client, admin_token):
    resp = client.patch(
        "/api/users/me/preferencias",
        json={"busqueda_atajo": "alt_s"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["busqueda_atajo"] == "alt_s"
    assert body["busqueda_boton_visible"] is True

    resp = client.get("/api/users/me/preferencias", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json()["busqueda_atajo"] == "alt_s"


def test_patch_invalid_atajo_returns_422(client, admin_token):
    resp = client.patch(
        "/api/users/me/preferencias",
        json={"busqueda_atajo": "ctrl_x"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


def test_get_unauthenticated_returns_401(client):
    resp = client.get("/api/users/me/preferencias")
    assert resp.status_code == 401


def test_patch_unauthenticated_returns_401(client):
    resp = client.patch("/api/users/me/preferencias", json={"busqueda_atajo": "alt_s"})
    assert resp.status_code == 401
```

- [ ] **Step 2: Run tests — all should fail**

Run: `cd backend && pytest tests/test_preferencias.py -v`
Expected: FAIL — endpoints not yet defined

- [ ] **Step 3: Add endpoints to users.py**

Append to `backend/app/api/users.py`:

```python
from app.schemas.preferencias import (
    DEFAULTS,
    PreferenciasOut,
    PreferenciasUpdate,
    merge_with_defaults,
)


@router.get("/me/preferencias", response_model=PreferenciasOut)
def get_my_preferencias(current_user: User = Depends(get_current_user)):
    return merge_with_defaults(current_user.preferencias)


@router.patch("/me/preferencias", response_model=PreferenciasOut)
def update_my_preferencias(
    body: PreferenciasUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = body.model_dump(exclude_unset=True)
    merged = {**(current_user.preferencias or {}), **payload}
    current_user.preferencias = merged
    db.commit()
    db.refresh(current_user)
    return merge_with_defaults(current_user.preferencias)
```

- [ ] **Step 4: Run tests — all should pass**

Run: `cd backend && pytest tests/test_preferencias.py -v`
Expected: PASS — 5/5

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/users.py backend/tests/test_preferencias.py
git commit -m "feat(preferencias): GET/PATCH /api/users/me/preferencias"
```

---

## Phase 2 — Backend: search endpoint

### Task 5: Search router skeleton + validation

**Files:**
- Create: `backend/app/api/search.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_search.py`

- [ ] **Step 1: Write failing test for q validation**

Create `backend/tests/test_search.py`:

```python
def test_q_too_short_returns_422(client, admin_token):
    resp = client.get("/api/search?q=a", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_q_missing_returns_422(client, admin_token):
    resp = client.get("/api/search", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_unauthenticated_returns_401(client):
    resp = client.get("/api/search?q=hola")
    assert resp.status_code == 401


def test_admin_empty_results(client, admin_token):
    resp = client.get("/api/search?q=zzznoexiste", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["q"] == "zzznoexiste"
    assert body["productos"] == []
    assert body["clientes"] == []
    assert body["empresas"] == []
    assert body["cotizaciones"] == []
    assert body["notas_venta"] == []
    assert body["facturas"] == []
    assert body["ordenes_compra"] == []
    assert body["empleados"] == []
```

- [ ] **Step 2: Run tests — all fail (404)**

Run: `cd backend && pytest tests/test_search.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Create search router skeleton**

`backend/app/api/search.py`:

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.permissions import has_permission
from app.database import get_db
from app.models.user import User

router = APIRouter()

CATEGORIAS = (
    "productos",
    "clientes",
    "empresas",
    "cotizaciones",
    "notas_venta",
    "facturas",
    "ordenes_compra",
    "empleados",
)


@router.get("")
def search(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(5, ge=1, le=10),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result: dict = {"q": q, **{cat: [] for cat in CATEGORIAS}}
    return result
```

- [ ] **Step 4: Register router**

Modify `backend/app/main.py` — add import and include after `tareas_api`:

```python
from app.api import search as search_api
# ...
app.include_router(search_api.router, prefix="/api/search", tags=["search"])
```

- [ ] **Step 5: Run tests — should pass**

Run: `cd backend && pytest tests/test_search.py -v`
Expected: PASS — 4/4

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/search.py backend/app/main.py backend/tests/test_search.py
git commit -m "feat(search): scaffold /api/search with validation and empty results"
```

---

### Task 6: Search productos / clientes / empresas

**Files:**
- Modify: `backend/app/api/search.py`
- Modify: `backend/tests/test_search.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_search.py`:

```python
def test_match_producto_by_nombre(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="Tornillo M8", sku="TOR-008", precio_neto=100, precio_costo=50)
    db.add(p); db.commit()
    resp = client.get("/api/search?q=tor", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    items = resp.json()["productos"]
    assert any(it["sku"] == "TOR-008" for it in items)


def test_match_producto_by_sku(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="Pieza X", sku="ABC-123", precio_neto=100, precio_costo=50)
    db.add(p); db.commit()
    resp = client.get("/api/search?q=ABC", headers={"Authorization": f"Bearer {admin_token}"})
    items = resp.json()["productos"]
    assert any(it["sku"] == "ABC-123" for it in items)


def test_match_cliente_by_nombre_and_rut(client, admin_token, db):
    from app.models.cliente import Cliente
    c = Cliente(nombre="Juan Pérez", rut="12.345.678-9")
    db.add(c); db.commit()
    by_name = client.get("/api/search?q=Juan", headers={"Authorization": f"Bearer {admin_token}"})
    by_rut = client.get("/api/search?q=12.345", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(it["rut"] == "12.345.678-9" for it in by_name.json()["clientes"])
    assert any(it["rut"] == "12.345.678-9" for it in by_rut.json()["clientes"])


def test_match_empresa_by_nombre_and_rut(client, admin_token, db):
    from app.models.empresa import Empresa
    e = Empresa(nombre="ACME Corp", rut="76.123.456-7")
    db.add(e); db.commit()
    resp = client.get("/api/search?q=ACME", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(it["nombre"] == "ACME Corp" for it in resp.json()["empresas"])


def test_limit_per_category(client, admin_token, db):
    from app.models.producto import Producto
    for i in range(8):
        db.add(Producto(nombre=f"Sierra {i}", sku=f"SI-{i:03}", precio_neto=10, precio_costo=5))
    db.commit()
    resp = client.get("/api/search?q=Sierra&limit=5", headers={"Authorization": f"Bearer {admin_token}"})
    assert len(resp.json()["productos"]) == 5
```

- [ ] **Step 2: Run tests — should fail (empty arrays)**

Run: `cd backend && pytest tests/test_search.py -v -k "match_producto or match_cliente or match_empresa or limit_per"`
Expected: FAIL — assertions on items unmet

- [ ] **Step 3: Implement productos/clientes/empresas search**

Replace `search()` body in `backend/app/api/search.py`:

```python
from sqlalchemy import or_

from app.models.cliente import Cliente
from app.models.empresa import Empresa
from app.models.producto import Producto


def _search_productos(db: Session, q: str, limit: int) -> list[dict]:
    pattern = f"%{q}%"
    rows = (
        db.query(Producto)
        .filter(or_(Producto.nombre.ilike(pattern), Producto.sku.ilike(pattern)))
        .order_by(Producto.nombre)
        .limit(limit)
        .all()
    )
    return [{"id": r.id, "nombre": r.nombre, "sku": r.sku} for r in rows]


def _search_clientes(db: Session, q: str, limit: int) -> list[dict]:
    pattern = f"%{q}%"
    rows = (
        db.query(Cliente)
        .filter(or_(Cliente.nombre.ilike(pattern), Cliente.rut.ilike(pattern)))
        .order_by(Cliente.nombre)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "nombre": r.nombre,
            "rut": r.rut,
            "empresa": r.empresa.nombre if r.empresa else None,
        }
        for r in rows
    ]


def _search_empresas(db: Session, q: str, limit: int) -> list[dict]:
    pattern = f"%{q}%"
    rows = (
        db.query(Empresa)
        .filter(or_(Empresa.nombre.ilike(pattern), Empresa.rut.ilike(pattern)))
        .order_by(Empresa.nombre)
        .limit(limit)
        .all()
    )
    return [{"id": r.id, "nombre": r.nombre, "rut": r.rut} for r in rows]


@router.get("")
def search(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(5, ge=1, le=10),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result: dict = {"q": q, **{cat: [] for cat in CATEGORIAS}}
    if has_permission(db, current_user, "catalogo", "view"):
        result["productos"] = _search_productos(db, q, limit)
    if has_permission(db, current_user, "clientes", "view"):
        result["clientes"] = _search_clientes(db, q, limit)
    if has_permission(db, current_user, "empresas", "view"):
        result["empresas"] = _search_empresas(db, q, limit)
    return result
```

- [ ] **Step 4: Run tests — should pass**

Run: `cd backend && pytest tests/test_search.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/search.py backend/tests/test_search.py
git commit -m "feat(search): productos, clientes and empresas matching"
```

---

### Task 7: Search documentos with vendedor scoping

**Files:**
- Modify: `backend/app/api/search.py`
- Modify: `backend/tests/test_search.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_search.py`:

```python
def test_match_cotizacion_by_numero(client, admin_token, admin_user, cliente_demo, db):
    from app.models.cotizacion import Cotizacion
    cot = Cotizacion(numero=12345, cliente_id=cliente_demo.id, vendedor_id=admin_user.id, estado="abierta")
    db.add(cot); db.commit()
    resp = client.get("/api/search?q=12345", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(it["numero"] == 12345 for it in resp.json()["cotizaciones"])


def test_vendedor_sees_only_own_cotizaciones(client, vendedor_token, vendedor_user, admin_user, cliente_demo, db):
    from app.models.cotizacion import Cotizacion
    own = Cotizacion(numero=11111, cliente_id=cliente_demo.id, vendedor_id=vendedor_user.id, estado="abierta")
    other = Cotizacion(numero=22222, cliente_id=cliente_demo.id, vendedor_id=admin_user.id, estado="abierta")
    db.add_all([own, other]); db.commit()
    own_q = client.get("/api/search?q=11111", headers={"Authorization": f"Bearer {vendedor_token}"})
    other_q = client.get("/api/search?q=22222", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert any(it["numero"] == 11111 for it in own_q.json()["cotizaciones"])
    assert all(it["numero"] != 22222 for it in other_q.json()["cotizaciones"])


def test_match_factura_by_numero_and_state(client, admin_token, cliente_demo, db):
    from app.models.factura import Factura
    f = Factura(numero=200, cliente_id=cliente_demo.id, estado="pagada")
    db.add(f); db.commit()
    resp = client.get("/api/search?q=200", headers={"Authorization": f"Bearer {admin_token}"})
    items = resp.json()["facturas"]
    assert any(it["numero"] == 200 and it["estado"] == "pagada" for it in items)


def test_match_orden_compra_by_numero(client, admin_token, db):
    from app.models.orden_compra import OrdenCompra
    from app.models.proveedor import Proveedor
    p = Proveedor(nombre="Prov X")
    db.add(p); db.commit(); db.refresh(p)
    oc = OrdenCompra(numero=50, proveedor_id=p.id, estado="borrador")
    db.add(oc); db.commit()
    resp = client.get("/api/search?q=50", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(it["numero"] == 50 for it in resp.json()["ordenes_compra"])
```

- [ ] **Step 2: Run tests — should fail**

Run: `cd backend && pytest tests/test_search.py -v -k "cotizacion or factura or orden_compra"`
Expected: FAIL

- [ ] **Step 3: Implement documentos search**

Add to `backend/app/api/search.py`:

```python
from sqlalchemy import cast, String

from app.models.cotizacion import Cotizacion
from app.models.factura import Factura
from app.models.nota_venta import NotaVenta
from app.models.orden_compra import OrdenCompra
from app.models.proveedor import Proveedor


def _numero_like(q: str):
    """Case-insensitive prefix match on stringified numero."""
    return cast(Cotizacion.numero, String).ilike(f"{q}%")


def _vendedor_scope(role: str) -> bool:
    return role == "vendedor"


def _search_cotizaciones(db: Session, user: User, q: str, limit: int) -> list[dict]:
    query = (
        db.query(Cotizacion)
        .outerjoin(Cliente, Cotizacion.cliente_id == Cliente.id)
        .filter(cast(Cotizacion.numero, String).ilike(f"{q}%"))
    )
    if _vendedor_scope(user.role):
        query = query.filter(Cotizacion.vendedor_id == user.id)
    rows = query.order_by(Cotizacion.numero.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "numero": r.numero,
            "estado": r.estado,
            "cliente_nombre": r.cliente.nombre if r.cliente else None,
        }
        for r in rows
    ]


def _search_notas_venta(db: Session, user: User, q: str, limit: int) -> list[dict]:
    query = (
        db.query(NotaVenta)
        .outerjoin(Cliente, NotaVenta.cliente_id == Cliente.id)
        .filter(cast(NotaVenta.numero, String).ilike(f"{q}%"))
    )
    if _vendedor_scope(user.role):
        query = query.filter(NotaVenta.vendedor_id == user.id)
    rows = query.order_by(NotaVenta.numero.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "numero": r.numero,
            "estado": r.estado,
            "cliente_nombre": r.cliente.nombre if r.cliente else None,
        }
        for r in rows
    ]


def _search_facturas(db: Session, user: User, q: str, limit: int) -> list[dict]:
    query = (
        db.query(Factura)
        .outerjoin(Cliente, Factura.cliente_id == Cliente.id)
        .filter(cast(Factura.numero, String).ilike(f"{q}%"))
    )
    if _vendedor_scope(user.role):
        query = query.filter(Factura.vendedor_id == user.id)
    rows = query.order_by(Factura.numero.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "numero": r.numero,
            "estado": r.estado,
            "cliente_nombre": r.cliente.nombre if r.cliente else None,
        }
        for r in rows
    ]


def _search_ordenes_compra(db: Session, q: str, limit: int) -> list[dict]:
    rows = (
        db.query(OrdenCompra)
        .outerjoin(Proveedor, OrdenCompra.proveedor_id == Proveedor.id)
        .filter(cast(OrdenCompra.numero, String).ilike(f"{q}%"))
        .order_by(OrdenCompra.numero.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "numero": r.numero,
            "estado": r.estado,
            "proveedor_nombre": r.proveedor.nombre if r.proveedor else None,
        }
        for r in rows
    ]
```

Update the `search()` endpoint to call these:

```python
    if has_permission(db, current_user, "cotizaciones", "view"):
        result["cotizaciones"] = _search_cotizaciones(db, current_user, q, limit)
    if has_permission(db, current_user, "notas_venta", "view"):
        result["notas_venta"] = _search_notas_venta(db, current_user, q, limit)
    if has_permission(db, current_user, "facturas", "view"):
        result["facturas"] = _search_facturas(db, current_user, q, limit)
    if has_permission(db, current_user, "ordenes_compra", "view"):
        result["ordenes_compra"] = _search_ordenes_compra(db, q, limit)
```

- [ ] **Step 4: Run tests — should pass**

Run: `cd backend && pytest tests/test_search.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/search.py backend/tests/test_search.py
git commit -m "feat(search): documentos por numero with vendedor scoping"
```

---

### Task 8: Search empleados + RRHH permission omission

**Files:**
- Modify: `backend/app/api/search.py`
- Modify: `backend/tests/test_search.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_search.py`:

```python
def test_match_empleado_by_nombre(client, admin_token, db):
    from app.models.empleado import Empleado
    e = Empleado(nombre="María González", cargo="Vendedora")
    db.add(e); db.commit()
    resp = client.get("/api/search?q=Mar", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(it["nombre"] == "María González" for it in resp.json()["empleados"])


def test_user_without_rrhh_omits_empleados_key(client, vendedor_token, db):
    from app.models.empleado import Empleado
    db.add(Empleado(nombre="Pedro", cargo="X")); db.commit()
    resp = client.get("/api/search?q=Pedro", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert "empleados" not in body
```

- [ ] **Step 2: Run tests — should fail**

Run: `cd backend && pytest tests/test_search.py -v -k "empleado"`
Expected: FAIL — empleados always empty array

- [ ] **Step 3: Implement empleados search and adjust default**

In `backend/app/api/search.py`:

Add helper:

```python
from app.models.empleado import Empleado


def _search_empleados(db: Session, q: str, limit: int) -> list[dict]:
    pattern = f"%{q}%"
    rows = (
        db.query(Empleado)
        .filter(Empleado.nombre.ilike(pattern))
        .order_by(Empleado.nombre)
        .limit(limit)
        .all()
    )
    return [{"id": r.id, "nombre": r.nombre, "cargo": r.cargo} for r in rows]
```

Replace the body of `search()` to omit keys when permission is absent:

```python
@router.get("")
def search(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(5, ge=1, le=10),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result: dict = {"q": q}
    if has_permission(db, current_user, "catalogo", "view"):
        result["productos"] = _search_productos(db, q, limit)
    if has_permission(db, current_user, "clientes", "view"):
        result["clientes"] = _search_clientes(db, q, limit)
    if has_permission(db, current_user, "empresas", "view"):
        result["empresas"] = _search_empresas(db, q, limit)
    if has_permission(db, current_user, "cotizaciones", "view"):
        result["cotizaciones"] = _search_cotizaciones(db, current_user, q, limit)
    if has_permission(db, current_user, "notas_venta", "view"):
        result["notas_venta"] = _search_notas_venta(db, current_user, q, limit)
    if has_permission(db, current_user, "facturas", "view"):
        result["facturas"] = _search_facturas(db, current_user, q, limit)
    if has_permission(db, current_user, "ordenes_compra", "view"):
        result["ordenes_compra"] = _search_ordenes_compra(db, q, limit)
    if has_permission(db, current_user, "rrhh", "view"):
        result["empleados"] = _search_empleados(db, q, limit)
    return result
```

- [ ] **Step 4: Update earlier `test_admin_empty_results` for the omission semantic**

Replace the assertions in that test (`backend/tests/test_search.py`) to verify keys present (admin has all perms) and arrays empty:

```python
def test_admin_empty_results(client, admin_token):
    resp = client.get("/api/search?q=zzznoexiste", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["q"] == "zzznoexiste"
    for cat in ["productos", "clientes", "empresas", "cotizaciones",
                "notas_venta", "facturas", "ordenes_compra", "empleados"]:
        assert cat in body and body[cat] == []
```

- [ ] **Step 5: Run all search tests**

Run: `cd backend && pytest tests/test_search.py -v`
Expected: PASS — all green

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/search.py backend/tests/test_search.py
git commit -m "feat(search): empleados + omit categories user cannot view"
```

---

## Phase 3 — Frontend: API client, store, hooks

### Task 9: Install cmdk + create preferences store

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/stores/preferences.ts`
- Create: `frontend/src/api/preferencias.ts`

- [ ] **Step 1: Add cmdk dependency**

Run: `cd frontend && npm install cmdk@^1.0.0`
Expected: `package.json` and `package-lock.json` updated, no errors.

- [ ] **Step 2: Create API client**

`frontend/src/api/preferencias.ts`:

```typescript
import api from './client'

export type AtajoBusqueda = 'ctrl_k' | 'ctrl_p' | 'ctrl_shift_f' | 'alt_s'

export interface Preferencias {
  busqueda_boton_visible: boolean
  busqueda_atajo: AtajoBusqueda
}

export async function getPreferencias(): Promise<Preferencias> {
  const { data } = await api.get<Preferencias>('/users/me/preferencias')
  return data
}

export async function patchPreferencias(patch: Partial<Preferencias>): Promise<Preferencias> {
  const { data } = await api.patch<Preferencias>('/users/me/preferencias', patch)
  return data
}
```

(If `frontend/src/api/client.ts` doesn't exist, look for the existing axios instance — likely in `frontend/src/api/auth.ts` or similar — and import from there. Use `grep -rn "axios.create" frontend/src/api` to find it.)

- [ ] **Step 3: Create zustand store**

`frontend/src/stores/preferences.ts`:

```typescript
import { create } from 'zustand'
import type { Preferencias, AtajoBusqueda } from '../api/preferencias'

interface State {
  preferencias: Preferencias
  hydrated: boolean
  setAll: (p: Preferencias) => void
  setAtajo: (a: AtajoBusqueda) => void
  setBotonVisible: (v: boolean) => void
}

const DEFAULTS: Preferencias = {
  busqueda_boton_visible: true,
  busqueda_atajo: 'ctrl_k',
}

export const usePreferencesStore = create<State>(set => ({
  preferencias: DEFAULTS,
  hydrated: false,
  setAll: p => set({ preferencias: p, hydrated: true }),
  setAtajo: a => set(s => ({ preferencias: { ...s.preferencias, busqueda_atajo: a } })),
  setBotonVisible: v => set(s => ({ preferencias: { ...s.preferencias, busqueda_boton_visible: v } })),
}))
```

- [ ] **Step 4: Verify lint**

Run: `cd frontend && npm run lint`
Expected: PASS — no type errors

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/api/preferencias.ts frontend/src/stores/preferences.ts
git commit -m "feat(cmdk): add cmdk dep, preferencias store and API client"
```

---

### Task 10: Search API client + types

**Files:**
- Create: `frontend/src/api/search.ts`

- [ ] **Step 1: Create types and client**

`frontend/src/api/search.ts`:

```typescript
import api from './client'

export interface SearchProducto { id: number; nombre: string; sku: string | null }
export interface SearchCliente  { id: number; nombre: string; rut: string | null; empresa: string | null }
export interface SearchEmpresa  { id: number; nombre: string; rut: string | null }
export interface SearchDoc      { id: number; numero: number; estado: string; cliente_nombre?: string | null; proveedor_nombre?: string | null }
export interface SearchEmpleado { id: number; nombre: string; cargo: string }

export interface SearchResults {
  q: string
  productos?: SearchProducto[]
  clientes?: SearchCliente[]
  empresas?: SearchEmpresa[]
  cotizaciones?: SearchDoc[]
  notas_venta?: SearchDoc[]
  facturas?: SearchDoc[]
  ordenes_compra?: SearchDoc[]
  empleados?: SearchEmpleado[]
}

export async function search(q: string, signal?: AbortSignal): Promise<SearchResults> {
  const { data } = await api.get<SearchResults>('/search', { params: { q }, signal })
  return data
}
```

- [ ] **Step 2: Verify lint**

Run: `cd frontend && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/search.ts
git commit -m "feat(cmdk): add search API client and result types"
```

---

### Task 11: useGlobalSearch hook (debounced + abortable)

**Files:**
- Create: `frontend/src/hooks/useGlobalSearch.ts`

- [ ] **Step 1: Create hook**

`frontend/src/hooks/useGlobalSearch.ts`:

```typescript
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { search, type SearchResults } from '../api/search'

const DEBOUNCE_MS = 200

export function useGlobalSearch(rawQuery: string) {
  const [debounced, setDebounced] = useState(rawQuery)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(rawQuery), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [rawQuery])

  return useQuery<SearchResults>({
    queryKey: ['search', debounced],
    queryFn: ({ signal }) => search(debounced, signal),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
    placeholderData: prev => prev,
    retry: 1,
  })
}
```

- [ ] **Step 2: Verify lint**

Run: `cd frontend && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useGlobalSearch.ts
git commit -m "feat(cmdk): useGlobalSearch hook with debounce and abort"
```

---

### Task 12: useGlobalShortcut hook with platform detection

**Files:**
- Create: `frontend/src/hooks/useGlobalShortcut.ts`
- Create: `frontend/src/__tests__/useGlobalShortcut.test.tsx`

- [ ] **Step 1: Write failing test**

`frontend/src/__tests__/useGlobalShortcut.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { useGlobalShortcut } from '../hooks/useGlobalShortcut'

describe('useGlobalShortcut', () => {
  it('fires callback on Ctrl+K when atajo is ctrl_k', () => {
    const onTrigger = vi.fn()
    renderHook(() => useGlobalShortcut('ctrl_k', onTrigger))
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire on Ctrl+K when atajo is alt_s', () => {
    const onTrigger = vi.fn()
    renderHook(() => useGlobalShortcut('alt_s', onTrigger))
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('fires on Alt+S when atajo is alt_s', () => {
    const onTrigger = vi.fn()
    renderHook(() => useGlobalShortcut('alt_s', onTrigger))
    fireEvent.keyDown(window, { key: 's', altKey: true })
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('preventDefault on Ctrl+P to avoid browser print dialog', () => {
    const onTrigger = vi.fn()
    renderHook(() => useGlobalShortcut('ctrl_p', onTrigger))
    const ev = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — should fail (hook missing)**

Run: `cd frontend && npm test -- useGlobalShortcut`
Expected: FAIL — module not found

- [ ] **Step 3: Implement hook**

`frontend/src/hooks/useGlobalShortcut.ts`:

```typescript
import { useEffect } from 'react'
import type { AtajoBusqueda } from '../api/preferencias'

interface ShortcutDef {
  key: string
  ctrl?: boolean
  meta?: boolean  // mac cmd
  shift?: boolean
  alt?: boolean
}

const MAP: Record<AtajoBusqueda, ShortcutDef> = {
  ctrl_k:        { key: 'k', ctrl: true, meta: true },
  ctrl_p:        { key: 'p', ctrl: true, meta: true },
  ctrl_shift_f:  { key: 'f', ctrl: true, meta: true, shift: true },
  alt_s:         { key: 's', alt: true },
}

function matches(ev: KeyboardEvent, def: ShortcutDef): boolean {
  if (ev.key.toLowerCase() !== def.key) return false
  const isCtrlOrMeta = ev.ctrlKey || ev.metaKey
  if ((def.ctrl || def.meta) && !isCtrlOrMeta) return false
  if (!def.ctrl && !def.meta && isCtrlOrMeta) return false
  if (!!def.shift !== ev.shiftKey) return false
  if (!!def.alt !== ev.altKey) return false
  return true
}

export function useGlobalShortcut(atajo: AtajoBusqueda, onTrigger: () => void): void {
  useEffect(() => {
    const def = MAP[atajo]
    function handler(ev: KeyboardEvent) {
      if (matches(ev, def)) {
        ev.preventDefault()
        onTrigger()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [atajo, onTrigger])
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `cd frontend && npm test -- useGlobalShortcut`
Expected: PASS — 4/4

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useGlobalShortcut.ts frontend/src/__tests__/useGlobalShortcut.test.tsx
git commit -m "feat(cmdk): useGlobalShortcut with configurable atajo and platform detection"
```

---

### Task 13: useRecentEntities hook (localStorage)

**Files:**
- Create: `frontend/src/hooks/useRecentEntities.ts`

- [ ] **Step 1: Create hook**

`frontend/src/hooks/useRecentEntities.ts`:

```typescript
import { useState, useCallback } from 'react'

export type RecentTipo =
  | 'producto' | 'cliente' | 'empresa'
  | 'cotizacion' | 'nota_venta' | 'factura' | 'orden_compra'
  | 'empleado'

export interface RecentEntity {
  tipo: RecentTipo
  id: number
  titulo: string
  subtitulo?: string
  estado?: string
  addedAt: string
}

const STORAGE_KEY = 'conico:recientes'
const MAX = 5

function readSafe(): RecentEntity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (it): it is RecentEntity =>
        it && typeof it.tipo === 'string' && typeof it.id === 'number' && typeof it.titulo === 'string'
    )
  } catch {
    return []
  }
}

export function useRecentEntities() {
  const [items, setItems] = useState<RecentEntity[]>(readSafe)

  const push = useCallback((entry: Omit<RecentEntity, 'addedAt'>) => {
    setItems(prev => {
      const filtered = prev.filter(p => !(p.tipo === entry.tipo && p.id === entry.id))
      const next = [{ ...entry, addedAt: new Date().toISOString() }, ...filtered].slice(0, MAX)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* quota / disabled */ }
      return next
    })
  }, [])

  return { recientes: items, push }
}
```

- [ ] **Step 2: Verify lint**

Run: `cd frontend && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useRecentEntities.ts
git commit -m "feat(cmdk): useRecentEntities for localStorage recents"
```

---

## Phase 4 — Frontend: modal + items + button

### Task 14: GlobalSearchModal shell

**Files:**
- Create: `frontend/src/components/search/GlobalSearchModal.tsx`

- [ ] **Step 1: Create modal**

`frontend/src/components/search/GlobalSearchModal.tsx`:

```tsx
import { useState, useCallback } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2 } from 'lucide-react'
import { useGlobalSearch } from '../../hooks/useGlobalSearch'
import { useRecentEntities, type RecentTipo } from '../../hooks/useRecentEntities'
import ProductoItem from './items/ProductoItem'
import ClienteItem from './items/ClienteItem'
import EmpresaItem from './items/EmpresaItem'
import DocumentoItem from './items/DocumentoItem'
import EmpleadoItem from './items/EmpleadoItem'
import RecentesGroup from './RecentesGroup'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

const URL_BY_TIPO: Record<RecentTipo, (id: number) => string> = {
  producto:      () => '/catalogo',
  cliente:       () => '/clientes',
  empresa:       id => `/empresas/${id}`,
  cotizacion:    id => `/cotizaciones/${id}`,
  nota_venta:    id => `/notas-venta/${id}`,
  factura:       id => `/facturas/${id}`,
  orden_compra:  id => `/ordenes-compra/${id}`,
  empleado:      () => '/rrhh',
}

export default function GlobalSearchModal({ open, onOpenChange }: Props) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const { data, isFetching } = useGlobalSearch(q)
  const { recientes, push } = useRecentEntities()

  const handleSelect = useCallback(
    (entry: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string; estado?: string }) => {
      push(entry)
      navigate(URL_BY_TIPO[entry.tipo](entry.id))
      onOpenChange(false)
      setQ('')
    },
    [navigate, push, onOpenChange]
  )

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Búsqueda global"
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
    >
      <div
        className="w-[640px] max-w-[92vw] bg-white dark:bg-[#111827] rounded-xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-white/5">
          <Search size={18} className="text-gray-400" />
          <Command.Input
            value={q}
            onValueChange={setQ}
            placeholder="Buscar productos, clientes, documentos..."
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
          />
          {isFetching && <Loader2 size={16} className="text-gray-400 animate-spin" />}
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          {q.length < 2 && <RecentesGroup recientes={recientes} onSelect={handleSelect} />}
          {q.length >= 2 && (
            <>
              {data?.productos?.length ? (
                <Command.Group heading="Productos">
                  {data.productos.map(p => (
                    <ProductoItem key={`prod-${p.id}`} item={p} onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.clientes?.length ? (
                <Command.Group heading="Clientes">
                  {data.clientes.map(c => (
                    <ClienteItem key={`cli-${c.id}`} item={c} onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.empresas?.length ? (
                <Command.Group heading="Empresas">
                  {data.empresas.map(e => (
                    <EmpresaItem key={`emp-${e.id}`} item={e} onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.cotizaciones?.length ? (
                <Command.Group heading="Cotizaciones">
                  {data.cotizaciones.map(d => (
                    <DocumentoItem key={`cot-${d.id}`} item={d} tipo="cotizacion" onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.notas_venta?.length ? (
                <Command.Group heading="Notas de venta">
                  {data.notas_venta.map(d => (
                    <DocumentoItem key={`nv-${d.id}`} item={d} tipo="nota_venta" onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.facturas?.length ? (
                <Command.Group heading="Facturas">
                  {data.facturas.map(d => (
                    <DocumentoItem key={`fac-${d.id}`} item={d} tipo="factura" onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.ordenes_compra?.length ? (
                <Command.Group heading="Órdenes de compra">
                  {data.ordenes_compra.map(d => (
                    <DocumentoItem key={`oc-${d.id}`} item={d} tipo="orden_compra" onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.empleados?.length ? (
                <Command.Group heading="Empleados">
                  {data.empleados.map(e => (
                    <EmpleadoItem key={`empl-${e.id}`} item={e} onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              <Command.Empty className="py-8 text-center text-sm text-gray-500">Sin resultados</Command.Empty>
            </>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
  )
}
```

- [ ] **Step 2: Verify lint (item components missing — expect errors)**

Run: `cd frontend && npm run lint`
Expected: FAIL — missing `./items/*` modules. Fix by creating items in next task.

- [ ] **Step 3: Commit (broken intentionally — item files arrive next)**

Skip commit until items exist. Move directly to Task 15.

---

### Task 15: Item renderers + RecentesGroup

**Files:**
- Create all 5 item components + `RecentesGroup.tsx`

- [ ] **Step 1: Helper for badge classes**

Create `frontend/src/components/search/items/badge.ts`:

```typescript
export function badgeClass(estado: string): string {
  const e = estado.toLowerCase()
  if (e.includes('pagad') || e.includes('aprobad') || e.includes('completa')) return 'bg-green-500/15 text-green-400'
  if (e.includes('rechaz') || e.includes('cancelad') || e.includes('anulad')) return 'bg-red-500/15 text-red-400'
  if (e.includes('pendient') || e.includes('borrador') || e.includes('emitida')) return 'bg-yellow-500/15 text-yellow-400'
  if (e.includes('abierta') || e.includes('despachad') || e.includes('enviad')) return 'bg-blue-500/15 text-blue-400'
  return 'bg-gray-500/15 text-gray-400'
}
```

- [ ] **Step 2: Producto item**

`frontend/src/components/search/items/ProductoItem.tsx`:

```tsx
import { Command } from 'cmdk'
import { Package } from 'lucide-react'
import type { SearchProducto } from '../../../api/search'
import type { RecentTipo } from '../../../hooks/useRecentEntities'

interface Props {
  item: SearchProducto
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string }) => void
}

export default function ProductoItem({ item, onSelect }: Props) {
  return (
    <Command.Item
      value={`producto-${item.id}-${item.nombre}-${item.sku ?? ''}`}
      onSelect={() => onSelect({ tipo: 'producto', id: item.id, titulo: item.nombre, subtitulo: item.sku ?? undefined })}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <Package size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">{item.nombre}</div>
        {item.sku && <div className="text-xs text-gray-500 truncate">{item.sku}</div>}
      </div>
    </Command.Item>
  )
}
```

- [ ] **Step 3: Cliente item**

`frontend/src/components/search/items/ClienteItem.tsx`:

```tsx
import { Command } from 'cmdk'
import { User } from 'lucide-react'
import type { SearchCliente } from '../../../api/search'
import type { RecentTipo } from '../../../hooks/useRecentEntities'

interface Props {
  item: SearchCliente
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string }) => void
}

export default function ClienteItem({ item, onSelect }: Props) {
  const subtitulo = [item.rut, item.empresa].filter(Boolean).join(' · ')
  return (
    <Command.Item
      value={`cliente-${item.id}-${item.nombre}-${item.rut ?? ''}`}
      onSelect={() => onSelect({ tipo: 'cliente', id: item.id, titulo: item.nombre, subtitulo: subtitulo || undefined })}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <User size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">{item.nombre}</div>
        {subtitulo && <div className="text-xs text-gray-500 truncate">{subtitulo}</div>}
      </div>
    </Command.Item>
  )
}
```

- [ ] **Step 4: Empresa item**

`frontend/src/components/search/items/EmpresaItem.tsx`:

```tsx
import { Command } from 'cmdk'
import { Building } from 'lucide-react'
import type { SearchEmpresa } from '../../../api/search'
import type { RecentTipo } from '../../../hooks/useRecentEntities'

interface Props {
  item: SearchEmpresa
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string }) => void
}

export default function EmpresaItem({ item, onSelect }: Props) {
  return (
    <Command.Item
      value={`empresa-${item.id}-${item.nombre}-${item.rut ?? ''}`}
      onSelect={() => onSelect({ tipo: 'empresa', id: item.id, titulo: item.nombre, subtitulo: item.rut ?? undefined })}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <Building size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">{item.nombre}</div>
        {item.rut && <div className="text-xs text-gray-500 truncate">{item.rut}</div>}
      </div>
    </Command.Item>
  )
}
```

- [ ] **Step 5: Documento item (handles all 4 types)**

`frontend/src/components/search/items/DocumentoItem.tsx`:

```tsx
import { Command } from 'cmdk'
import { FileText, ShoppingCart, Receipt, Truck } from 'lucide-react'
import type { SearchDoc } from '../../../api/search'
import type { RecentTipo } from '../../../hooks/useRecentEntities'
import { badgeClass } from './badge'

type DocTipo = Extract<RecentTipo, 'cotizacion' | 'nota_venta' | 'factura' | 'orden_compra'>

const ICONS: Record<DocTipo, typeof FileText> = {
  cotizacion: FileText,
  nota_venta: ShoppingCart,
  factura: Receipt,
  orden_compra: Truck,
}

interface Props {
  item: SearchDoc
  tipo: DocTipo
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string; estado?: string }) => void
}

export default function DocumentoItem({ item, tipo, onSelect }: Props) {
  const Icon = ICONS[tipo]
  const subtitulo = item.cliente_nombre ?? item.proveedor_nombre ?? undefined
  return (
    <Command.Item
      value={`${tipo}-${item.id}-${item.numero}`}
      onSelect={() =>
        onSelect({
          tipo,
          id: item.id,
          titulo: `#${item.numero}`,
          subtitulo,
          estado: item.estado,
        })
      }
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <Icon size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">#{item.numero}</div>
        {subtitulo && <div className="text-xs text-gray-500 truncate">{subtitulo}</div>}
      </div>
      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${badgeClass(item.estado)}`}>
        {item.estado}
      </span>
    </Command.Item>
  )
}
```

- [ ] **Step 6: Empleado item**

`frontend/src/components/search/items/EmpleadoItem.tsx`:

```tsx
import { Command } from 'cmdk'
import { UserCircle } from 'lucide-react'
import type { SearchEmpleado } from '../../../api/search'
import type { RecentTipo } from '../../../hooks/useRecentEntities'

interface Props {
  item: SearchEmpleado
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string }) => void
}

export default function EmpleadoItem({ item, onSelect }: Props) {
  return (
    <Command.Item
      value={`empleado-${item.id}-${item.nombre}`}
      onSelect={() => onSelect({ tipo: 'empleado', id: item.id, titulo: item.nombre, subtitulo: item.cargo })}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <UserCircle size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">{item.nombre}</div>
        <div className="text-xs text-gray-500 truncate">{item.cargo}</div>
      </div>
    </Command.Item>
  )
}
```

- [ ] **Step 7: RecentesGroup**

`frontend/src/components/search/RecentesGroup.tsx`:

```tsx
import { Command } from 'cmdk'
import { Clock } from 'lucide-react'
import type { RecentEntity, RecentTipo } from '../../hooks/useRecentEntities'
import { badgeClass } from './items/badge'

interface Props {
  recientes: RecentEntity[]
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string; estado?: string }) => void
}

export default function RecentesGroup({ recientes, onSelect }: Props) {
  if (recientes.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        Empieza a escribir para buscar
      </div>
    )
  }
  return (
    <Command.Group heading="Recientes">
      {recientes.map(r => (
        <Command.Item
          key={`recent-${r.tipo}-${r.id}`}
          value={`recent-${r.tipo}-${r.id}`}
          onSelect={() => onSelect(r)}
          className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
        >
          <Clock size={16} className="text-gray-400" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-900 dark:text-white truncate">{r.titulo}</div>
            {r.subtitulo && <div className="text-xs text-gray-500 truncate">{r.subtitulo}</div>}
          </div>
          {r.estado && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${badgeClass(r.estado)}`}>
              {r.estado}
            </span>
          )}
        </Command.Item>
      ))}
    </Command.Group>
  )
}
```

- [ ] **Step 8: Verify build**

Run: `cd frontend && npm run lint`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/search/
git commit -m "feat(cmdk): GlobalSearchModal + per-tipo item renderers"
```

---

### Task 16: SearchButton component

**Files:**
- Create: `frontend/src/components/search/SearchButton.tsx`

- [ ] **Step 1: Create button**

`frontend/src/components/search/SearchButton.tsx`:

```tsx
import { Search } from 'lucide-react'
import { usePreferencesStore } from '../../stores/preferences'
import type { AtajoBusqueda } from '../../api/preferencias'

const LABELS_WIN: Record<AtajoBusqueda, string> = {
  ctrl_k: 'Ctrl+K',
  ctrl_p: 'Ctrl+P',
  ctrl_shift_f: 'Ctrl+Shift+F',
  alt_s: 'Alt+S',
}

const LABELS_MAC: Record<AtajoBusqueda, string> = {
  ctrl_k: '⌘K',
  ctrl_p: '⌘P',
  ctrl_shift_f: '⌘⇧F',
  alt_s: '⌥S',
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toUpperCase().includes('MAC')
}

export function atajoLabel(atajo: AtajoBusqueda): string {
  return (isMac() ? LABELS_MAC : LABELS_WIN)[atajo]
}

interface Props {
  onClick: () => void
}

export default function SearchButton({ onClick }: Props) {
  const prefs = usePreferencesStore(s => s.preferencias)
  if (!prefs.busqueda_boton_visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors"
      aria-label="Búsqueda global"
    >
      <Search size={14} />
      <span className="hidden sm:inline">Buscar</span>
      <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400">
        {atajoLabel(prefs.busqueda_atajo)}
      </kbd>
    </button>
  )
}
```

- [ ] **Step 2: Verify lint**

Run: `cd frontend && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/search/SearchButton.tsx
git commit -m "feat(cmdk): SearchButton with platform-adapted shortcut hint"
```

---

## Phase 5 — Frontend: integration

### Task 17: Mount in AppLayout + hydrate on login

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Modify: `frontend/src/pages/Login.tsx`

- [ ] **Step 1: Hydrate prefs on login**

In `frontend/src/pages/Login.tsx`, after successful login, fetch and hydrate. Find the success branch (look for `useAuthStore` setting tokens) and add:

```typescript
import { getPreferencias } from '../api/preferencias'
import { usePreferencesStore } from '../stores/preferences'
// ...
// after auth tokens are set:
try {
  const prefs = await getPreferencias()
  usePreferencesStore.getState().setAll(prefs)
} catch {
  // keep defaults
}
```

If the login flow already navigates immediately, hydrate before navigate.

- [ ] **Step 2: Mount modal in AppLayout**

Modify `frontend/src/components/layout/AppLayout.tsx`:

Add imports:

```typescript
import { useState } from 'react'
import GlobalSearchModal from '../search/GlobalSearchModal'
import SearchButton from '../search/SearchButton'
import { useGlobalShortcut } from '../../hooks/useGlobalShortcut'
import { usePreferencesStore } from '../../stores/preferences'
```

Inside `AppLayout`:

```typescript
const [searchOpen, setSearchOpen] = useState(false)
const atajo = usePreferencesStore(s => s.preferencias.busqueda_atajo)
useGlobalShortcut(atajo, () => setSearchOpen(true))
```

Render at bottom of root container (before closing `</div>`):

```tsx
<GlobalSearchModal open={searchOpen} onOpenChange={setSearchOpen} />
```

In the **mobile top bar** (look for `<header className="md:hidden ...">`), add the button next to the menu icon:

```tsx
<SearchButton onClick={() => setSearchOpen(true)} />
```

For desktop, render `<SearchButton>` in a top strip. Since current `AppLayout` has no desktop header, add a thin top bar before `<main>`:

```tsx
<header className="hidden md:flex items-center justify-end gap-2 h-10 px-4 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#0f1422] flex-shrink-0">
  <SearchButton onClick={() => setSearchOpen(true)} />
</header>
```

- [ ] **Step 3: Run frontend dev to smoke-test**

Run: `cd frontend && npm run dev`
Expected: dev server starts. Manually: load app, log in, press Ctrl+K → modal opens. Type "test" → results render or "Sin resultados". Click cliente → navigates. Esc → closes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppLayout.tsx frontend/src/pages/Login.tsx
git commit -m "feat(cmdk): mount GlobalSearchModal and hydrate prefs at login"
```

---

### Task 18: Configuración — Búsqueda section

**Files:**
- Modify: `frontend/src/pages/Configuracion.tsx`

- [ ] **Step 1: Read current Configuración structure**

Run: `cd frontend && head -50 src/pages/Configuracion.tsx`
Identify section pattern (likely a card with title + form).

- [ ] **Step 2: Add Búsqueda section**

Append to `Configuracion.tsx` after existing sections:

```tsx
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { usePreferencesStore } from '../stores/preferences'
import { patchPreferencias, type AtajoBusqueda } from '../api/preferencias'
import { atajoLabel } from '../components/search/SearchButton'

function BusquedaSection() {
  const prefs = usePreferencesStore(s => s.preferencias)
  const setAll = usePreferencesStore(s => s.setAll)
  const [visible, setVisible] = useState(prefs.busqueda_boton_visible)
  const [atajo, setAtajo] = useState<AtajoBusqueda>(prefs.busqueda_atajo)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setVisible(prefs.busqueda_boton_visible)
    setAtajo(prefs.busqueda_atajo)
  }, [prefs])

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await patchPreferencias({ busqueda_boton_visible: visible, busqueda_atajo: atajo })
      setAll(updated)
      toast.success('Preferencias guardadas')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const opciones: AtajoBusqueda[] = ['ctrl_k', 'ctrl_p', 'ctrl_shift_f', 'alt_s']

  return (
    <section className="bg-white dark:bg-[#111827] rounded-xl border border-gray-200 dark:border-white/5 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Búsqueda</h2>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={visible}
            onChange={e => setVisible(e.target.checked)}
            className="rounded"
          />
          Mostrar botón de búsqueda en barra superior
        </label>
        <div>
          <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
            Atajo de teclado
          </label>
          <select
            value={atajo}
            onChange={e => setAtajo(e.target.value as AtajoBusqueda)}
            className="w-48 bg-white dark:bg-[#0B0F1A] border border-gray-300 dark:border-white/10 rounded-md px-2 py-1.5 text-sm text-gray-900 dark:text-white"
          >
            {opciones.map(o => (
              <option key={o} value={o}>
                {atajoLabel(o)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-md text-white text-sm transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </section>
  )
}
```

Render `<BusquedaSection />` inside the main configuration layout.

- [ ] **Step 3: Verify lint**

Run: `cd frontend && npm run lint`
Expected: PASS

- [ ] **Step 4: Smoke-test in dev**

Run: `cd frontend && npm run dev`
- Navigate to `/configuracion`
- Toggle button visibility → save → header button appears/disappears
- Change atajo to Alt+S → save → press Ctrl+K (no-op), press Alt+S (modal opens)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Configuracion.tsx
git commit -m "feat(cmdk): Búsqueda section in /configuracion (toggle + atajo dropdown)"
```

---

### Task 19: Frontend tests for modal

**Files:**
- Create: `frontend/src/__tests__/GlobalSearchModal.test.tsx`

- [ ] **Step 1: Create test file**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearchModal from '../components/search/GlobalSearchModal'
import * as searchApi from '../api/search'

vi.mock('../api/search')

function wrap(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('GlobalSearchModal', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('does not call API when query < 2 chars', async () => {
    const spy = vi.spyOn(searchApi, 'search').mockResolvedValue({ q: '' })
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    const input = screen.getByPlaceholderText(/Buscar/i)
    fireEvent.change(input, { target: { value: 'a' } })
    await new Promise(r => setTimeout(r, 300))
    expect(spy).not.toHaveBeenCalled()
  })

  it('calls API after debounce when query >= 2 chars', async () => {
    const spy = vi.spyOn(searchApi, 'search').mockResolvedValue({
      q: 'tor',
      productos: [{ id: 1, nombre: 'Tornillo', sku: 'TOR-1' }],
    })
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    const input = screen.getByPlaceholderText(/Buscar/i)
    fireEvent.change(input, { target: { value: 'tor' } })
    await waitFor(() => expect(spy).toHaveBeenCalled(), { timeout: 1000 })
    expect(await screen.findByText('Tornillo')).toBeInTheDocument()
  })

  it('shows recientes when query empty and localStorage has entries', () => {
    localStorage.setItem(
      'conico:recientes',
      JSON.stringify([
        { tipo: 'cliente', id: 1, titulo: 'Juan', subtitulo: '12-3', addedAt: new Date().toISOString() },
      ])
    )
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    expect(screen.getByText('Juan')).toBeInTheDocument()
    expect(screen.getByText('Recientes')).toBeInTheDocument()
  })

  it('renders empty state when no recientes and query empty', () => {
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    expect(screen.getByText(/Empieza a escribir/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd frontend && npm test -- GlobalSearchModal`
Expected: PASS — 4/4

- [ ] **Step 3: Commit**

```bash
git add frontend/src/__tests__/GlobalSearchModal.test.tsx
git commit -m "test(cmdk): GlobalSearchModal coverage for debounce, recientes, empty"
```

---

## Phase 6 — Final verification

### Task 20: Full test pass + PROGRESS.md update

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && pytest -v`
Expected: PASS — no regressions; new search/preferencias tests included.

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 3: Update PROGRESS.md**

Add to PROGRESS.md after "Tier A #5 — Tareas y Recordatorios" entry:

```markdown
- [x] **Tier A #7 — Búsqueda global Cmd+K**
  - Endpoint `/api/search` con fan-out a 8 entidades (productos, clientes, empresas, cotizaciones, NV, facturas, OC, empleados)
  - Permission-aware: omite categorías sin permiso; vendedor solo ve docs propios
  - Modal cmdk con grupos por categoría, recientes en localStorage, debounce 200ms, AbortController
  - Atajo configurable (Ctrl+K / Ctrl+P / Ctrl+Shift+F / Alt+S) con detección Mac
  - Botón en header configurable por usuario; sección /configuracion guardada en `users.preferencias` JSON
```

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: mark Tier A #7 búsqueda global Cmd+K complete"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/cmdk-search
```

---

## Self-Review Checklist (executor — before declaring done)

- [ ] All 8 search categories return correct shapes when admin queries
- [ ] Vendedor cannot see other vendedores' cotizaciones/NV/facturas via search
- [ ] User without `rrhh:view` does not see `empleados` key in response
- [ ] Atajo configurable changes binding without reload
- [ ] Recientes persist across page reload
- [ ] Esc closes the modal
- [ ] Click on result navigates to detail and adds to recientes
- [ ] PROGRESS.md updated and pushed
