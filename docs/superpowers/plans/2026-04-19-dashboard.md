# Dashboard Configurable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a configurable per-role widget dashboard with drag-and-drop layout (react-grid-layout), Recharts charts, and persistent layouts in a new `dashboard_layouts` DB table.

**Architecture:** FastAPI backend adds `/api/dashboard/` with layout CRUD and 8 analytics data endpoints; frontend replaces the placeholder route with `Dashboard.tsx` that renders a `react-grid-layout` grid of independently-fetching `Widget` components; admin enters edit mode to add/move/configure/delete widgets.

**Tech Stack:** FastAPI, SQLAlchemy 2 / SQLite (tests) + PostgreSQL (prod), Alembic, React 18, TypeScript, TanStack Query 5, react-grid-layout, Recharts, Tailwind CSS, Zustand (auth), Lucide icons.

---

## File Map

**New backend files:**
- `backend/app/models/dashboard_layout.py` — SQLAlchemy model
- `backend/app/schemas/dashboard_layout.py` — Pydantic schemas
- `backend/app/api/dashboard.py` — Router with all endpoints
- `backend/tests/test_dashboard.py` — Integration tests

**Modified backend files:**
- `backend/app/main.py` — register dashboard router
- `backend/tests/conftest.py` — add model import for test DB

**New frontend files:**
- `frontend/src/types/dashboard.ts` — TypeScript types
- `frontend/src/components/dashboard/widgetCatalog.ts` — widget definitions
- `frontend/src/hooks/useDashboardLayout.ts` — load/save layout
- `frontend/src/components/dashboard/Widget.tsx` — single widget (fetch + render)
- `frontend/src/components/dashboard/WidgetGrid.tsx` — react-grid-layout wrapper
- `frontend/src/components/dashboard/WidgetPicker.tsx` — add-widget panel (edit mode)
- `frontend/src/components/dashboard/WidgetConfig.tsx` — per-widget config modal
- `frontend/src/pages/Dashboard.tsx` — main page

**Modified frontend files:**
- `frontend/src/router.tsx` — replace placeholder with `<Dashboard />`

---

## Task 1: DB Model + Alembic Migration

**Files:**
- Create: `backend/app/models/dashboard_layout.py`
- Create: `backend/migrations/versions/h8i9j0k1l2m3_add_dashboard_layouts.py`

- [ ] **Step 1: Create SQLAlchemy model**

```python
# backend/app/models/dashboard_layout.py
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class DashboardLayout(Base):
    __tablename__ = "dashboard_layouts"

    role: Mapped[str] = mapped_column(String(20), primary_key=True)
    layout_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    updated_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
```

- [ ] **Step 2: Create Alembic migration**

```python
# backend/migrations/versions/h8i9j0k1l2m3_add_dashboard_layouts.py
"""add dashboard_layouts table

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-04-19 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "h8i9j0k1l2m3"
down_revision: Union[str, None] = "g7h8i9j0k1l2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dashboard_layouts",
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("layout_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("role"),
    )


def downgrade() -> None:
    op.drop_table("dashboard_layouts")
```

- [ ] **Step 3: Add model import to conftest so test DB creates the table**

In `backend/tests/conftest.py`, inside `setup_test_db`, add after the last import line:
```python
    import app.models.dashboard_layout  # noqa: F401
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/dashboard_layout.py backend/migrations/versions/h8i9j0k1l2m3_add_dashboard_layouts.py backend/tests/conftest.py
git commit -m "feat: add dashboard_layouts model and migration"
```

---

## Task 2: Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/dashboard_layout.py`

- [ ] **Step 1: Create schemas**

```python
# backend/app/schemas/dashboard_layout.py
from datetime import datetime
from pydantic import BaseModel


class WidgetGridPos(BaseModel):
    x: int
    y: int
    w: int
    h: int


class WidgetConfig(BaseModel):
    id: str
    type: str
    chart: str
    date_range: str = "month"
    date_from: str | None = None
    date_to: str | None = None
    limit: int = 10


class LayoutPayload(BaseModel):
    widgets: list[WidgetConfig]


class DashboardLayoutOut(BaseModel):
    role: str
    layout: LayoutPayload
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Analytics response schemas ---

class VentasPeriodoSerie(BaseModel):
    periodo: str
    monto: float


class VentasPeriodoOut(BaseModel):
    total: float
    series: list[VentasPeriodoSerie]


class EstadoCount(BaseModel):
    estado: str
    count: int


class CotizacionesAbiertasOut(BaseModel):
    total: int
    por_estado: list[EstadoCount]


class TopClienteItem(BaseModel):
    cliente_id: int
    nombre: str
    total: float


class TopProductoItem(BaseModel):
    producto_id: int
    nombre: str
    sku: str | None
    cantidad: int
    total: float


class StockCriticoItem(BaseModel):
    producto_id: int
    nombre: str
    sku: str | None
    stock_actual: int
    stock_minimo: int


class NVPorCobrarItem(BaseModel):
    numero: int
    cliente: str
    total: float


class NVPorCobrarOut(BaseModel):
    total_monto: float
    count: int
    items: list[NVPorCobrarItem]


class VendedorMetricaItem(BaseModel):
    vendedor_id: int
    nombre: str
    total: float
    count: int
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/dashboard_layout.py
git commit -m "feat: add dashboard Pydantic schemas"
```

---

## Task 3: Backend Tests — Layout Endpoints (Write Failing)

**Files:**
- Create: `backend/tests/test_dashboard.py`

- [ ] **Step 1: Write layout tests**

```python
# backend/tests/test_dashboard.py
import json
import pytest
from tests.conftest import TestingSession
from app.models.user import User
from app.core.security import get_password_hash


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_user(role: str, email: str) -> User:
    db = TestingSession()
    user = User(
        email=email,
        name=role.capitalize(),
        hashed_password=get_password_hash("secret"),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def _token(client, email: str) -> str:
    r = client.post("/api/auth/login", data={"username": email, "password": "secret"})
    return r.json()["access_token"]


SAMPLE_LAYOUT = {
    "widgets": [
        {"id": "w1", "type": "ventas_periodo", "chart": "bar", "date_range": "month", "limit": 10}
    ]
}


# ── layout CRUD ───────────────────────────────────────────────────────────────

class TestLayoutCRUD:
    def test_get_layout_no_saved_returns_empty(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/layout/admin", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "admin"
        assert body["layout"]["widgets"] == []

    def test_put_layout_saves_and_returns(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.put(
            "/api/dashboard/layout/admin",
            json=SAMPLE_LAYOUT,
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 200
        assert r.json()["layout"]["widgets"][0]["id"] == "w1"

    def test_get_layout_returns_saved(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        client.put("/api/dashboard/layout/admin", json=SAMPLE_LAYOUT,
                   headers={"Authorization": f"Bearer {tok}"})
        r = client.get("/api/dashboard/layout/admin",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.json()["layout"]["widgets"][0]["type"] == "ventas_periodo"

    def test_put_layout_forbidden_for_vendedor(self, client, setup_test_db):
        _make_user("vendedor", "v@test.cl")
        tok = _token(client, "v@test.cl")
        r = client.put(
            "/api/dashboard/layout/vendedor",
            json=SAMPLE_LAYOUT,
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 403

    def test_subadmin_layout_falls_back_to_admin_when_missing(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        _make_user("subadmin", "s@test.cl")
        admin_tok = _token(client, "a@test.cl")
        subadmin_tok = _token(client, "s@test.cl")
        # admin saves layout for admin role
        client.put("/api/dashboard/layout/admin", json=SAMPLE_LAYOUT,
                   headers={"Authorization": f"Bearer {admin_tok}"})
        # subadmin has no layout → should get admin's
        r = client.get("/api/dashboard/layout/subadmin",
                       headers={"Authorization": f"Bearer {subadmin_tok}"})
        assert r.status_code == 200
        assert r.json()["layout"]["widgets"][0]["type"] == "ventas_periodo"

    def test_unauthenticated_returns_401(self, client, setup_test_db):
        r = client.get("/api/dashboard/layout/admin")
        assert r.status_code == 401
```

- [ ] **Step 2: Run tests — expect failure (router not yet wired)**

```bash
cd backend && python -m pytest tests/test_dashboard.py -v 2>&1 | head -30
```

Expected: `FAILED` or import error.

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/test_dashboard.py
git commit -m "test: add failing dashboard layout tests"
```

---

## Task 4: Layout API Endpoints + Register Router

**Files:**
- Create: `backend/app/api/dashboard.py` (partial — layout endpoints only)
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create router with layout endpoints**

```python
# backend/app/api/dashboard.py
import json
from datetime import date, datetime, timezone
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.dashboard_layout import DashboardLayout
from app.models.user import User
from app.schemas.dashboard_layout import (
    DashboardLayoutOut,
    LayoutPayload,
)

router = APIRouter()


def _get_layout_for_role(db: Session, role: str) -> DashboardLayout | None:
    layout = db.query(DashboardLayout).filter_by(role=role).first()
    if layout is None and role == "subadmin":
        layout = db.query(DashboardLayout).filter_by(role="admin").first()
    return layout


def _layout_to_out(role: str, layout: DashboardLayout | None) -> DashboardLayoutOut:
    if layout is None:
        return DashboardLayoutOut(role=role, layout=LayoutPayload(widgets=[]))
    payload = LayoutPayload(**json.loads(layout.layout_json))
    return DashboardLayoutOut(role=role, layout=payload, updated_at=layout.updated_at)


@router.get("/layout/{role}", response_model=DashboardLayoutOut)
def get_layout(
    role: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    layout = _get_layout_for_role(db, role)
    return _layout_to_out(role, layout)


@router.put("/layout/{role}", response_model=DashboardLayoutOut)
def save_layout(
    role: str,
    body: LayoutPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede editar el layout")
    layout = db.query(DashboardLayout).filter_by(role=role).first()
    if layout is None:
        layout = DashboardLayout(role=role)
        db.add(layout)
    layout.layout_json = body.model_dump_json()
    layout.updated_by = current_user.id
    layout.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(layout)
    return _layout_to_out(role, layout)
```

- [ ] **Step 2: Register router in main.py**

Add at the top of imports:
```python
from app.api import dashboard
```

Add after the last `app.include_router` line:
```python
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
```

- [ ] **Step 3: Run layout tests — expect pass**

```bash
cd backend && python -m pytest tests/test_dashboard.py::TestLayoutCRUD -v
```

Expected: all 6 tests `PASSED`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/dashboard.py backend/app/main.py
git commit -m "feat: add dashboard layout GET/PUT endpoints"
```

---

## Task 5: Backend Tests — Data Endpoints (Write Failing)

**Files:**
- Modify: `backend/tests/test_dashboard.py` — append data tests

- [ ] **Step 1: Append data endpoint tests to test_dashboard.py**

```python
# append to backend/tests/test_dashboard.py

from app.models.nota_venta import NotaVenta, NotaVentaLinea
from app.models.cotizacion import Cotizacion
from app.models.producto import Producto
from app.models.cliente import Cliente
from decimal import Decimal


def _seed_data(vendedor_id: int, cliente_id: int | None = None) -> None:
    """Seeds one NV (pagada) and one NV (pendiente) for vendedor."""
    db = TestingSession()

    if cliente_id is None:
        cli = Cliente(nombre="Cliente Test", rut=None, email=None, telefono=None)
        db.add(cli)
        db.flush()
        cliente_id = cli.id

    # NV pendiente (por cobrar)
    nv1 = NotaVenta(
        numero=9001,
        cliente_id=cliente_id,
        vendedor_id=vendedor_id,
        fecha=date.today(),
        estado="pendiente",
        total_neto=Decimal("1000"),
        total_iva=Decimal("190"),
        total=Decimal("1190"),
    )
    db.add(nv1)
    db.flush()

    # NV pagada (counts in ventas_periodo)
    nv2 = NotaVenta(
        numero=9002,
        cliente_id=cliente_id,
        vendedor_id=vendedor_id,
        fecha=date.today(),
        estado="pagada",
        total_neto=Decimal("2000"),
        total_iva=Decimal("380"),
        total=Decimal("2380"),
    )
    db.add(nv2)
    db.commit()
    db.close()


class TestDataEndpoints:
    def test_ventas_periodo_admin_sees_all(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        v = _make_user("vendedor", "v@test.cl")
        _seed_data(v.id)
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/ventas_periodo", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        body = r.json()
        assert "total" in body
        assert "series" in body
        assert body["total"] > 0

    def test_ventas_periodo_vendedor_sees_own(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        v1 = _make_user("vendedor", "v1@test.cl")
        _make_user("vendedor", "v2@test.cl")
        _seed_data(v1.id)
        tok = _token(client, "v1@test.cl")
        r = client.get("/api/dashboard/data/ventas_periodo", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        assert r.json()["total"] > 0

    def test_cotizaciones_abiertas(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/cotizaciones_abiertas",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        body = r.json()
        assert "total" in body
        assert "por_estado" in body

    def test_stock_critico(self, client, setup_test_db):
        db = TestingSession()
        p = Producto(nombre="Bajo Stock", precio_costo=Decimal("10"), precio_venta=Decimal("20"),
                     stock_minimo=10, stock_actual=2)
        db.add(p)
        db.commit()
        db.close()
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/stock_critico",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        items = r.json()
        assert any(i["nombre"] == "Bajo Stock" for i in items)

    def test_nv_por_cobrar(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        v = _make_user("vendedor", "v@test.cl")
        _seed_data(v.id)
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/nv_por_cobrar",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        body = r.json()
        assert body["count"] >= 1
        assert body["total_monto"] >= 1190

    def test_vendedor_cannot_call_admin_only_widgets(self, client, setup_test_db):
        _make_user("vendedor", "v@test.cl")
        tok = _token(client, "v@test.cl")
        for widget_type in ("cotizaciones_por_vendedor", "ventas_por_vendedor"):
            r = client.get(f"/api/dashboard/data/{widget_type}",
                           headers={"Authorization": f"Bearer {tok}"})
            assert r.status_code == 403, f"{widget_type} should return 403 for vendedor"

    def test_top_clientes(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        v = _make_user("vendedor", "v@test.cl")
        _seed_data(v.id)
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/top_clientes",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_top_productos(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/top_productos",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_unknown_widget_type_returns_404(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/no_existe",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 404
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && python -m pytest tests/test_dashboard.py::TestDataEndpoints -v 2>&1 | head -20
```

Expected: `FAILED` (endpoints not implemented yet).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_dashboard.py
git commit -m "test: add failing dashboard data endpoint tests"
```

---

## Task 6: Data API Endpoints

**Files:**
- Modify: `backend/app/api/dashboard.py` — append data endpoints

- [ ] **Step 1: Append all data endpoints to dashboard.py**

Add these imports at the top of `backend/app/api/dashboard.py`:
```python
from collections import defaultdict
from sqlalchemy import func
from app.models.nota_venta import NotaVenta, NotaVentaLinea
from app.models.cotizacion import Cotizacion
from app.models.cliente import Cliente
from app.models.producto import Producto
from app.schemas.dashboard_layout import (
    VentasPeriodoOut, VentasPeriodoSerie,
    CotizacionesAbiertasOut, EstadoCount,
    TopClienteItem, TopProductoItem,
    StockCriticoItem,
    NVPorCobrarOut, NVPorCobrarItem,
    VendedorMetricaItem,
)
from app.models.user import User as UserModel
```

Then append these functions and route at the end of the file:

```python
# ── helpers ──────────────────────────────────────────────────────────────────

def _vendor_filter(q, model, current_user: User):
    """Apply vendedor_id filter when user is a vendedor."""
    if current_user.role == "vendedor":
        q = q.filter(model.vendedor_id == current_user.id)
    return q


def _date_filter(q, model, date_from: date | None, date_to: date | None):
    if date_from:
        q = q.filter(model.fecha >= date_from)
    if date_to:
        q = q.filter(model.fecha <= date_to)
    return q


# ── data handlers ─────────────────────────────────────────────────────────────

def _data_ventas_periodo(
    db: Session, current_user: User, date_from: date | None, date_to: date | None, limit: int
) -> VentasPeriodoOut:
    q = db.query(NotaVenta).filter(NotaVenta.estado.in_(["pagada", "entregada", "despachada"]))
    q = _vendor_filter(q, NotaVenta, current_user)
    q = _date_filter(q, NotaVenta, date_from, date_to)
    nvs = q.all()
    total = sum(float(nv.total) for nv in nvs)
    by_month: dict[str, float] = defaultdict(float)
    for nv in nvs:
        key = nv.fecha.strftime("%Y-%m")
        by_month[key] += float(nv.total)
    series = [VentasPeriodoSerie(periodo=k, monto=v) for k, v in sorted(by_month.items())]
    return VentasPeriodoOut(total=total, series=series)


def _data_cotizaciones_abiertas(
    db: Session, current_user: User, date_from: date | None, date_to: date | None, limit: int
) -> CotizacionesAbiertasOut:
    q = db.query(Cotizacion).filter(Cotizacion.estado.in_(["abierta", "no_definido"]))
    q = _vendor_filter(q, Cotizacion, current_user)
    q = _date_filter(q, Cotizacion, date_from, date_to)
    cots = q.all()
    by_estado: dict[str, int] = defaultdict(int)
    for c in cots:
        by_estado[c.estado] += 1
    por_estado = [EstadoCount(estado=k, count=v) for k, v in by_estado.items()]
    return CotizacionesAbiertasOut(total=len(cots), por_estado=por_estado)


def _data_top_clientes(
    db: Session, current_user: User, date_from: date | None, date_to: date | None, limit: int
) -> list[TopClienteItem]:
    q = db.query(NotaVenta)
    q = _vendor_filter(q, NotaVenta, current_user)
    q = _date_filter(q, NotaVenta, date_from, date_to)
    nvs = q.all()
    by_cliente: dict[int, float] = defaultdict(float)
    for nv in nvs:
        by_cliente[nv.cliente_id] += float(nv.total)
    top = sorted(by_cliente.items(), key=lambda x: x[1], reverse=True)[:limit]
    result = []
    for cid, total in top:
        cli = db.get(Cliente, cid)
        if cli:
            result.append(TopClienteItem(cliente_id=cid, nombre=cli.nombre, total=total))
    return result


def _data_top_productos(
    db: Session, current_user: User, date_from: date | None, date_to: date | None, limit: int
) -> list[TopProductoItem]:
    from app.models.nota_venta import NotaVentaLinea
    q = db.query(NotaVenta)
    q = _vendor_filter(q, NotaVenta, current_user)
    q = _date_filter(q, NotaVenta, date_from, date_to)
    nv_ids = [nv.id for nv in q.all()]
    if not nv_ids:
        return []
    lineas = db.query(NotaVentaLinea).filter(
        NotaVentaLinea.nv_id.in_(nv_ids),
        NotaVentaLinea.producto_id.isnot(None),
    ).all()
    by_prod: dict[int, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
    for l in lineas:
        qty, tot = by_prod[l.producto_id]
        by_prod[l.producto_id] = (qty + l.cantidad, tot + float(l.total))
    top = sorted(by_prod.items(), key=lambda x: x[1][1], reverse=True)[:limit]
    result = []
    for pid, (qty, tot) in top:
        p = db.get(Producto, pid)
        if p:
            result.append(TopProductoItem(
                producto_id=pid, nombre=p.nombre, sku=p.sku, cantidad=qty, total=tot
            ))
    return result


def _data_stock_critico(
    db: Session, current_user: User, date_from: date | None, date_to: date | None, limit: int
) -> list[StockCriticoItem]:
    productos = db.query(Producto).filter(
        Producto.stock_actual < Producto.stock_minimo
    ).order_by(Producto.stock_actual.asc()).limit(limit).all()
    return [
        StockCriticoItem(
            producto_id=p.id, nombre=p.nombre, sku=p.sku,
            stock_actual=p.stock_actual, stock_minimo=p.stock_minimo,
        )
        for p in productos
    ]


def _data_nv_por_cobrar(
    db: Session, current_user: User, date_from: date | None, date_to: date | None, limit: int
) -> NVPorCobrarOut:
    q = db.query(NotaVenta).filter(NotaVenta.estado.in_(["pendiente", "despachada"]))
    q = _vendor_filter(q, NotaVenta, current_user)
    nvs = q.order_by(NotaVenta.numero.desc()).limit(limit).all()
    total_monto = sum(float(nv.total) for nv in nvs)
    items = [
        NVPorCobrarItem(
            numero=nv.numero,
            cliente=nv.cliente.nombre if nv.cliente else str(nv.cliente_id),
            total=float(nv.total),
        )
        for nv in nvs
    ]
    # count is total matching, not just limited
    count = db.query(func.count(NotaVenta.id)).filter(
        NotaVenta.estado.in_(["pendiente", "despachada"])
    )
    if current_user.role == "vendedor":
        count = count.filter(NotaVenta.vendedor_id == current_user.id)
    return NVPorCobrarOut(total_monto=total_monto, count=count.scalar(), items=items)


def _data_cotizaciones_por_vendedor(
    db: Session, current_user: User, date_from: date | None, date_to: date | None, limit: int
) -> list[VendedorMetricaItem]:
    q = db.query(Cotizacion)
    q = _date_filter(q, Cotizacion, date_from, date_to)
    cots = q.all()
    by_v: dict[int, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
    for c in cots:
        cnt, tot = by_v[c.vendedor_id]
        by_v[c.vendedor_id] = (cnt + 1, tot + float(c.total))
    top = sorted(by_v.items(), key=lambda x: x[1][1], reverse=True)[:limit]
    result = []
    for vid, (cnt, tot) in top:
        u = db.get(UserModel, vid)
        if u:
            result.append(VendedorMetricaItem(vendedor_id=vid, nombre=u.name, total=tot, count=cnt))
    return result


def _data_ventas_por_vendedor(
    db: Session, current_user: User, date_from: date | None, date_to: date | None, limit: int
) -> list[VendedorMetricaItem]:
    q = db.query(NotaVenta)
    q = _date_filter(q, NotaVenta, date_from, date_to)
    nvs = q.all()
    by_v: dict[int, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
    for nv in nvs:
        if nv.vendedor_id is None:
            continue
        cnt, tot = by_v[nv.vendedor_id]
        by_v[nv.vendedor_id] = (cnt + 1, tot + float(nv.total))
    top = sorted(by_v.items(), key=lambda x: x[1][1], reverse=True)[:limit]
    result = []
    for vid, (cnt, tot) in top:
        u = db.get(UserModel, vid)
        if u:
            result.append(VendedorMetricaItem(vendedor_id=vid, nombre=u.name, total=tot, count=cnt))
    return result


# ── data router ───────────────────────────────────────────────────────────────

_ADMIN_ONLY = {"cotizaciones_por_vendedor", "ventas_por_vendedor"}

_DATA_HANDLERS = {
    "ventas_periodo": _data_ventas_periodo,
    "cotizaciones_abiertas": _data_cotizaciones_abiertas,
    "top_clientes": _data_top_clientes,
    "top_productos": _data_top_productos,
    "stock_critico": _data_stock_critico,
    "nv_por_cobrar": _data_nv_por_cobrar,
    "cotizaciones_por_vendedor": _data_cotizaciones_por_vendedor,
    "ventas_por_vendedor": _data_ventas_por_vendedor,
}


@router.get("/data/{widget_type}")
def get_widget_data(
    widget_type: str,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if widget_type not in _DATA_HANDLERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Widget '{widget_type}' no existe")
    if widget_type in _ADMIN_ONLY and current_user.role == "vendedor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    handler = _DATA_HANDLERS[widget_type]
    return handler(db, current_user, date_from, date_to, limit)
```

- [ ] **Step 2: The `nv_por_cobrar` handler needs Cliente joined — add joinedload**

Replace the `nvs` query in `_data_nv_por_cobrar` with:
```python
from sqlalchemy.orm import joinedload
    q = q.options(joinedload(NotaVenta.cliente))
```

Full corrected function:
```python
def _data_nv_por_cobrar(
    db: Session, current_user: User, date_from: date | None, date_to: date | None, limit: int
) -> NVPorCobrarOut:
    from sqlalchemy.orm import joinedload
    q = db.query(NotaVenta).filter(NotaVenta.estado.in_(["pendiente", "despachada"]))
    q = _vendor_filter(q, NotaVenta, current_user)
    nvs = q.options(joinedload(NotaVenta.cliente)).order_by(NotaVenta.numero.desc()).limit(limit).all()
    total_monto = sum(float(nv.total) for nv in nvs)
    items = [
        NVPorCobrarItem(
            numero=nv.numero,
            cliente=nv.cliente.nombre if nv.cliente else str(nv.cliente_id),
            total=float(nv.total),
        )
        for nv in nvs
    ]
    count_q = db.query(func.count(NotaVenta.id)).filter(
        NotaVenta.estado.in_(["pendiente", "despachada"])
    )
    if current_user.role == "vendedor":
        count_q = count_q.filter(NotaVenta.vendedor_id == current_user.id)
    return NVPorCobrarOut(total_monto=total_monto, count=count_q.scalar() or 0, items=items)
```

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && python -m pytest tests/test_dashboard.py -v
```

Expected: all tests `PASSED`.

- [ ] **Step 4: Run full test suite to check no regressions**

```bash
cd backend && python -m pytest --tb=short -q
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/dashboard.py
git commit -m "feat: add dashboard data endpoints for all 8 widget types"
```

---

## Task 7: Install Frontend Dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd frontend && npm install react-grid-layout recharts @types/react-grid-layout
```

- [ ] **Step 2: Verify installation**

```bash
cd frontend && node -e "require('react-grid-layout'); require('recharts'); console.log('OK')"
```

Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: install react-grid-layout and recharts"
```

---

## Task 8: TypeScript Types

**Files:**
- Create: `frontend/src/types/dashboard.ts`

- [ ] **Step 1: Create types file**

```typescript
// frontend/src/types/dashboard.ts

export type WidgetType =
  | 'ventas_periodo'
  | 'cotizaciones_abiertas'
  | 'top_clientes'
  | 'top_productos'
  | 'stock_critico'
  | 'nv_por_cobrar'
  | 'cotizaciones_por_vendedor'
  | 'ventas_por_vendedor'

export type ChartType = 'kpi' | 'bar' | 'line' | 'table'

export type DateRange = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

export interface WidgetGridPos {
  x: number
  y: number
  w: number
  h: number
}

export interface WidgetConfig {
  id: string
  type: WidgetType
  chart: ChartType
  date_range: DateRange
  date_from?: string
  date_to?: string
  limit: number
  grid: WidgetGridPos
}

export interface LayoutPayload {
  widgets: WidgetConfig[]
}

export interface DashboardLayoutOut {
  role: string
  layout: LayoutPayload
  updated_at?: string
}

// ── API response shapes ────────────────────────────────────────────────────

export interface VentasPeriodoSerie {
  periodo: string
  monto: number
}

export interface VentasPeriodoOut {
  total: number
  series: VentasPeriodoSerie[]
}

export interface EstadoCount {
  estado: string
  count: number
}

export interface CotizacionesAbiertasOut {
  total: number
  por_estado: EstadoCount[]
}

export interface TopClienteItem {
  cliente_id: number
  nombre: string
  total: number
}

export interface TopProductoItem {
  producto_id: number
  nombre: string
  sku: string | null
  cantidad: number
  total: number
}

export interface StockCriticoItem {
  producto_id: number
  nombre: string
  sku: string | null
  stock_actual: number
  stock_minimo: number
}

export interface NVPorCobrarItem {
  numero: number
  cliente: string
  total: number
}

export interface NVPorCobrarOut {
  total_monto: number
  count: number
  items: NVPorCobrarItem[]
}

export interface VendedorMetricaItem {
  vendedor_id: number
  nombre: string
  total: number
  count: number
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/dashboard.ts
git commit -m "feat: add dashboard TypeScript types"
```

---

## Task 9: Widget Catalog

**Files:**
- Create: `frontend/src/components/dashboard/widgetCatalog.ts`

- [ ] **Step 1: Create catalog**

```typescript
// frontend/src/components/dashboard/widgetCatalog.ts
import type { ChartType, WidgetConfig, WidgetType } from '../../types/dashboard'

export interface WidgetDef {
  type: WidgetType
  label: string
  chartTypes: ChartType[]
  hasDateRange: boolean
  adminOnly: boolean
  defaultGrid: Partial<Record<ChartType, { w: number; h: number }>> & { default: { w: number; h: number } }
}

export const WIDGET_CATALOG: WidgetDef[] = [
  {
    type: 'ventas_periodo',
    label: 'Ventas del período',
    chartTypes: ['kpi', 'bar', 'line'],
    hasDateRange: true,
    adminOnly: false,
    defaultGrid: {
      kpi: { w: 3, h: 3 },
      bar: { w: 6, h: 4 },
      line: { w: 6, h: 4 },
      default: { w: 6, h: 4 },
    },
  },
  {
    type: 'cotizaciones_abiertas',
    label: 'Cotizaciones abiertas',
    chartTypes: ['kpi', 'bar'],
    hasDateRange: true,
    adminOnly: false,
    defaultGrid: {
      kpi: { w: 3, h: 3 },
      bar: { w: 6, h: 4 },
      default: { w: 3, h: 3 },
    },
  },
  {
    type: 'top_clientes',
    label: 'Top clientes',
    chartTypes: ['table', 'bar'],
    hasDateRange: true,
    adminOnly: false,
    defaultGrid: { default: { w: 6, h: 5 } },
  },
  {
    type: 'top_productos',
    label: 'Top productos',
    chartTypes: ['table', 'bar'],
    hasDateRange: true,
    adminOnly: false,
    defaultGrid: { default: { w: 6, h: 5 } },
  },
  {
    type: 'stock_critico',
    label: 'Stock crítico',
    chartTypes: ['table'],
    hasDateRange: false,
    adminOnly: false,
    defaultGrid: { default: { w: 6, h: 5 } },
  },
  {
    type: 'nv_por_cobrar',
    label: 'NV por cobrar',
    chartTypes: ['kpi', 'table'],
    hasDateRange: false,
    adminOnly: false,
    defaultGrid: {
      kpi: { w: 3, h: 3 },
      table: { w: 6, h: 5 },
      default: { w: 3, h: 3 },
    },
  },
  {
    type: 'cotizaciones_por_vendedor',
    label: 'Cotizaciones por vendedor',
    chartTypes: ['table', 'bar'],
    hasDateRange: true,
    adminOnly: true,
    defaultGrid: { default: { w: 6, h: 5 } },
  },
  {
    type: 'ventas_por_vendedor',
    label: 'Ventas por vendedor',
    chartTypes: ['table', 'bar'],
    hasDateRange: true,
    adminOnly: true,
    defaultGrid: { default: { w: 6, h: 5 } },
  },
]

export const WIDGET_BY_TYPE = Object.fromEntries(
  WIDGET_CATALOG.map(w => [w.type, w])
) as Record<WidgetType, WidgetDef>

export function getDefaultGrid(def: WidgetDef, chart: ChartType): { w: number; h: number } {
  return (def.defaultGrid as Record<string, { w: number; h: number }>)[chart] ?? def.defaultGrid.default
}

export function makeWidget(type: WidgetType, chart: ChartType): WidgetConfig {
  const def = WIDGET_BY_TYPE[type]
  const size = getDefaultGrid(def, chart)
  return {
    id: Math.random().toString(36).slice(2, 9),
    type,
    chart,
    date_range: 'month',
    limit: 10,
    grid: { x: 0, y: Infinity, w: size.w, h: size.h },
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

export interface DashboardTemplate {
  name: string
  widgets: Array<{ type: WidgetType; chart: ChartType }>
}

export const TEMPLATES: DashboardTemplate[] = [
  {
    name: 'Ventas',
    widgets: [
      { type: 'ventas_periodo', chart: 'line' },
      { type: 'top_clientes', chart: 'table' },
      { type: 'top_productos', chart: 'bar' },
    ],
  },
  {
    name: 'Operacional',
    widgets: [
      { type: 'cotizaciones_abiertas', chart: 'kpi' },
      { type: 'stock_critico', chart: 'table' },
      { type: 'nv_por_cobrar', chart: 'kpi' },
    ],
  },
  {
    name: 'Completo',
    widgets: [
      { type: 'ventas_periodo', chart: 'bar' },
      { type: 'cotizaciones_abiertas', chart: 'kpi' },
      { type: 'top_clientes', chart: 'table' },
      { type: 'top_productos', chart: 'table' },
      { type: 'stock_critico', chart: 'table' },
      { type: 'nv_por_cobrar', chart: 'kpi' },
      { type: 'cotizaciones_por_vendedor', chart: 'table' },
      { type: 'ventas_por_vendedor', chart: 'table' },
    ],
  },
]

export function applyTemplate(template: DashboardTemplate, adminOnly: boolean): WidgetConfig[] {
  return template.widgets
    .filter(w => adminOnly || !WIDGET_BY_TYPE[w.type].adminOnly)
    .map(w => makeWidget(w.type, w.chart))
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard/widgetCatalog.ts
git commit -m "feat: add dashboard widget catalog and templates"
```

---

## Task 10: useDashboardLayout Hook

**Files:**
- Create: `frontend/src/hooks/useDashboardLayout.ts`

- [ ] **Step 1: Create hook**

```typescript
// frontend/src/hooks/useDashboardLayout.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { DashboardLayoutOut, LayoutPayload } from '../types/dashboard'

export function useDashboardLayout(role: string) {
  const qc = useQueryClient()

  const query = useQuery<DashboardLayoutOut>({
    queryKey: ['dashboard-layout', role],
    queryFn: () => api.get(`/api/dashboard/layout/${role}`).then(r => r.data),
  })

  const save = useMutation({
    mutationFn: (payload: LayoutPayload) =>
      api.put<DashboardLayoutOut>(`/api/dashboard/layout/${role}`, payload).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['dashboard-layout', role], data)
    },
  })

  return { query, save }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useDashboardLayout.ts
git commit -m "feat: add useDashboardLayout hook"
```

---

## Task 11: Widget Component

**Files:**
- Create: `frontend/src/components/dashboard/Widget.tsx`

- [ ] **Step 1: Create Widget.tsx with all chart/table renderers**

```tsx
// frontend/src/components/dashboard/Widget.tsx
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import { Settings, X, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { WidgetConfig } from '../../types/dashboard'
import type {
  VentasPeriodoOut, CotizacionesAbiertasOut,
  TopClienteItem, TopProductoItem,
  StockCriticoItem, NVPorCobrarOut, VendedorMetricaItem,
} from '../../types/dashboard'
import { WIDGET_BY_TYPE } from './widgetCatalog'

function formatMoney(n: number) {
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
}

function buildParams(w: WidgetConfig) {
  const p = new URLSearchParams()
  if (w.date_range !== 'custom') {
    const today = new Date()
    const from = new Date(today)
    if (w.date_range === 'today') from.setDate(today.getDate())
    else if (w.date_range === 'week') from.setDate(today.getDate() - today.getDay() + 1)
    else if (w.date_range === 'month') from.setDate(1)
    else if (w.date_range === 'quarter') from.setMonth(Math.floor(today.getMonth() / 3) * 3, 1)
    else if (w.date_range === 'year') from.setMonth(0, 1)
    p.set('date_from', from.toISOString().split('T')[0])
    p.set('date_to', today.toISOString().split('T')[0])
  } else {
    if (w.date_from) p.set('date_from', w.date_from)
    if (w.date_to) p.set('date_to', w.date_to)
  }
  p.set('limit', String(w.limit))
  return p.toString()
}

// ── Chart renderers ────────────────────────────────────────────────────────────

function KpiCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <span className="text-3xl font-bold text-blue-500 dark:text-blue-400">{value}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  )
}

function SimpleBarChart({ data, xKey, yKey }: { data: object[]; xKey: string; yKey: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} width={50} />
        <Tooltip formatter={(v: number) => formatMoney(v)} />
        <Bar dataKey={yKey} fill="#6366f1" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function SimpleLineChart({ data, xKey, yKey }: { data: object[]; xKey: string; yKey: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} width={50} />
        <Tooltip formatter={(v: number) => formatMoney(v)} />
        <Line type="monotone" dataKey={yKey} stroke="#6366f1" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Per-widget render ──────────────────────────────────────────────────────────

function RenderVentas({ data, chart }: { data: VentasPeriodoOut; chart: string }) {
  if (chart === 'kpi') return <KpiCard value={formatMoney(data.total)} label="Ventas del período" />
  if (chart === 'line') return <SimpleLineChart data={data.series} xKey="periodo" yKey="monto" />
  return <SimpleBarChart data={data.series} xKey="periodo" yKey="monto" />
}

function RenderCotizaciones({ data, chart }: { data: CotizacionesAbiertasOut; chart: string }) {
  if (chart === 'kpi') return <KpiCard value={String(data.total)} label="Cotizaciones abiertas" />
  return <SimpleBarChart data={data.por_estado} xKey="estado" yKey="count" />
}

function RenderTopClientes({ data, chart }: { data: TopClienteItem[]; chart: string }) {
  if (chart === 'bar') return <SimpleBarChart data={data} xKey="nombre" yKey="total" />
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-1 px-2">Cliente</th>
          <th className="text-right py-1 px-2">Total</th>
        </tr></thead>
        <tbody>{data.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-1 px-2 truncate max-w-[150px]">{r.nombre}</td>
            <td className="py-1 px-2 text-right">{formatMoney(r.total)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function RenderTopProductos({ data, chart }: { data: TopProductoItem[]; chart: string }) {
  if (chart === 'bar') return <SimpleBarChart data={data} xKey="nombre" yKey="total" />
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-1 px-2">Producto</th>
          <th className="text-right py-1 px-2">Cant.</th>
          <th className="text-right py-1 px-2">Total</th>
        </tr></thead>
        <tbody>{data.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-1 px-2 truncate max-w-[120px]">{r.nombre}</td>
            <td className="py-1 px-2 text-right">{r.cantidad}</td>
            <td className="py-1 px-2 text-right">{formatMoney(r.total)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function RenderStockCritico({ data }: { data: StockCriticoItem[] }) {
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-1 px-2">Producto</th>
          <th className="text-right py-1 px-2">Actual</th>
          <th className="text-right py-1 px-2">Mínimo</th>
        </tr></thead>
        <tbody>{data.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-1 px-2 truncate max-w-[130px]">{r.nombre}</td>
            <td className="py-1 px-2 text-right text-red-600 font-medium">{r.stock_actual}</td>
            <td className="py-1 px-2 text-right text-gray-500">{r.stock_minimo}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function RenderNVPorCobrar({ data, chart }: { data: NVPorCobrarOut; chart: string }) {
  if (chart === 'kpi') return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <span className="text-3xl font-bold text-orange-500">{formatMoney(data.total_monto)}</span>
      <span className="text-xs text-gray-500">{data.count} NV por cobrar</span>
    </div>
  )
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-1 px-2">NV</th>
          <th className="text-left py-1 px-2">Cliente</th>
          <th className="text-right py-1 px-2">Total</th>
        </tr></thead>
        <tbody>{data.items.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-1 px-2">#{r.numero}</td>
            <td className="py-1 px-2 truncate max-w-[120px]">{r.cliente}</td>
            <td className="py-1 px-2 text-right">{formatMoney(r.total)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function RenderVendedorMetrica({ data, chart }: { data: VendedorMetricaItem[]; chart: string }) {
  if (chart === 'bar') return <SimpleBarChart data={data} xKey="nombre" yKey="total" />
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-1 px-2">Vendedor</th>
          <th className="text-right py-1 px-2">Docs</th>
          <th className="text-right py-1 px-2">Total</th>
        </tr></thead>
        <tbody>{data.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-1 px-2">{r.nombre}</td>
            <td className="py-1 px-2 text-right">{r.count}</td>
            <td className="py-1 px-2 text-right">{formatMoney(r.total)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function WidgetContent({ widget, data }: { widget: WidgetConfig; data: unknown }) {
  switch (widget.type) {
    case 'ventas_periodo': return <RenderVentas data={data as VentasPeriodoOut} chart={widget.chart} />
    case 'cotizaciones_abiertas': return <RenderCotizaciones data={data as CotizacionesAbiertasOut} chart={widget.chart} />
    case 'top_clientes': return <RenderTopClientes data={data as TopClienteItem[]} chart={widget.chart} />
    case 'top_productos': return <RenderTopProductos data={data as TopProductoItem[]} chart={widget.chart} />
    case 'stock_critico': return <RenderStockCritico data={data as StockCriticoItem[]} />
    case 'nv_por_cobrar': return <RenderNVPorCobrar data={data as NVPorCobrarOut} chart={widget.chart} />
    case 'cotizaciones_por_vendedor':
    case 'ventas_por_vendedor': return <RenderVendedorMetrica data={data as VendedorMetricaItem[]} chart={widget.chart} />
    default: return <div className="text-xs text-gray-400">Widget desconocido</div>
  }
}

// ── Main Widget component ──────────────────────────────────────────────────────

interface WidgetProps {
  widget: WidgetConfig
  editMode: boolean
  onConfigure: (id: string) => void
  onRemove: (id: string) => void
}

export default function Widget({ widget, editMode, onConfigure, onRemove }: WidgetProps) {
  const def = WIDGET_BY_TYPE[widget.type]
  const params = buildParams(widget)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['widget-data', widget.type, params],
    queryFn: () => api.get(`/api/dashboard/data/${widget.type}?${params}`).then(r => r.data),
  })

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate">{def.label}</span>
        {editMode && (
          <div className="flex gap-1 flex-shrink-0 ml-2">
            <button
              onClick={() => onConfigure(widget.id)}
              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <Settings size={13} />
            </button>
            <button
              onClick={() => onRemove(widget.id)}
              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 p-2 min-h-0">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-full text-xs text-red-400">
            Error al cargar datos
          </div>
        )}
        {data && <WidgetContent widget={widget} data={data} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Import react-grid-layout CSS in main.tsx**

In `frontend/src/main.tsx`, add after the existing CSS imports:
```tsx
import 'react-grid-layout/css/styles.css'
import 'react-resize-detector'
```

Actually just add the CSS import (no need for react-resize-detector import):
```tsx
import 'react-grid-layout/css/styles.css'
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/Widget.tsx frontend/src/main.tsx
git commit -m "feat: add Widget component with Recharts and table renderers"
```

---

## Task 12: WidgetGrid, WidgetPicker, WidgetConfig

**Files:**
- Create: `frontend/src/components/dashboard/WidgetGrid.tsx`
- Create: `frontend/src/components/dashboard/WidgetPicker.tsx`
- Create: `frontend/src/components/dashboard/WidgetConfig.tsx`

- [ ] **Step 1: Create WidgetGrid.tsx**

```tsx
// frontend/src/components/dashboard/WidgetGrid.tsx
import GridLayout, { WidthProvider, Layout } from 'react-grid-layout'
import type { WidgetConfig } from '../../types/dashboard'
import Widget from './Widget'

const ResponsiveGrid = WidthProvider(GridLayout)

interface WidgetGridProps {
  widgets: WidgetConfig[]
  editMode: boolean
  onLayoutChange: (updated: WidgetConfig[]) => void
  onConfigure: (id: string) => void
  onRemove: (id: string) => void
}

export default function WidgetGrid({
  widgets, editMode, onLayoutChange, onConfigure, onRemove,
}: WidgetGridProps) {
  const layout: Layout[] = widgets.map(w => ({
    i: w.id,
    x: w.grid.x,
    y: w.grid.y,
    w: w.grid.w,
    h: w.grid.h,
    static: !editMode,
  }))

  function handleLayoutChange(newLayout: Layout[]) {
    const posMap = Object.fromEntries(newLayout.map(l => [l.i, l]))
    const updated = widgets.map(w => {
      const pos = posMap[w.id]
      if (!pos) return w
      return { ...w, grid: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } }
    })
    onLayoutChange(updated)
  }

  return (
    <ResponsiveGrid
      className="layout"
      layout={layout}
      cols={12}
      rowHeight={60}
      isDraggable={editMode}
      isResizable={editMode}
      onLayoutChange={handleLayoutChange}
      draggableHandle=".drag-handle"
    >
      {widgets.map(w => (
        <div key={w.id} className={editMode ? 'cursor-grab' : ''}>
          {editMode && (
            <div className="drag-handle absolute top-0 left-0 right-0 h-6 cursor-grab z-10 opacity-0 hover:opacity-100 bg-indigo-500/20 rounded-t" />
          )}
          <Widget
            widget={w}
            editMode={editMode}
            onConfigure={onConfigure}
            onRemove={onRemove}
          />
        </div>
      ))}
    </ResponsiveGrid>
  )
}
```

- [ ] **Step 2: Create WidgetPicker.tsx**

```tsx
// frontend/src/components/dashboard/WidgetPicker.tsx
import { Plus } from 'lucide-react'
import { WIDGET_CATALOG, makeWidget } from './widgetCatalog'
import type { WidgetConfig } from '../../types/dashboard'

interface WidgetPickerProps {
  isAdmin: boolean
  onAdd: (widget: WidgetConfig) => void
}

export default function WidgetPicker({ isAdmin, onAdd }: WidgetPickerProps) {
  const available = WIDGET_CATALOG.filter(def => isAdmin || !def.adminOnly)

  return (
    <div className="w-56 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-3 overflow-y-auto">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        Agregar widget
      </p>
      <div className="flex flex-col gap-2">
        {available.map(def => (
          <button
            key={def.type}
            onClick={() => onAdd(makeWidget(def.type, def.chartTypes[0]))}
            className="flex items-center gap-2 w-full text-left px-2 py-2 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600"
          >
            <Plus size={13} className="flex-shrink-0 text-indigo-500" />
            <span className="truncate">{def.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create WidgetConfig.tsx**

```tsx
// frontend/src/components/dashboard/WidgetConfig.tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import type { WidgetConfig, ChartType, DateRange } from '../../types/dashboard'
import { WIDGET_BY_TYPE } from './widgetCatalog'

const CHART_LABELS: Record<ChartType, string> = {
  kpi: 'KPI (número)',
  bar: 'Barras',
  line: 'Línea',
  table: 'Tabla',
}

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: 'Hoy',
  week: 'Esta semana',
  month: 'Este mes',
  quarter: 'Este trimestre',
  year: 'Este año',
  custom: 'Personalizado',
}

interface WidgetConfigProps {
  widget: WidgetConfig
  onSave: (updated: WidgetConfig) => void
  onClose: () => void
}

export default function WidgetConfigModal({ widget, onSave, onClose }: WidgetConfigProps) {
  const def = WIDGET_BY_TYPE[widget.type]
  const [draft, setDraft] = useState<WidgetConfig>({ ...widget })

  function set<K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-80 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{def.label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Tipo de gráfico
            </label>
            <select
              value={draft.chart}
              onChange={e => set('chart', e.target.value as ChartType)}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-700 dark:text-gray-200"
            >
              {def.chartTypes.map(ct => (
                <option key={ct} value={ct}>{CHART_LABELS[ct]}</option>
              ))}
            </select>
          </div>

          {def.hasDateRange && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Período
              </label>
              <select
                value={draft.date_range}
                onChange={e => set('date_range', e.target.value as DateRange)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-700 dark:text-gray-200"
              >
                {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map(dr => (
                  <option key={dr} value={dr}>{DATE_RANGE_LABELS[dr]}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Límite de filas
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={draft.limit}
              onChange={e => set('limit', Number(e.target.value))}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-700 dark:text-gray-200"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={() => { onSave(draft); onClose() }}
            className="flex-1 px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/WidgetGrid.tsx frontend/src/components/dashboard/WidgetPicker.tsx frontend/src/components/dashboard/WidgetConfig.tsx
git commit -m "feat: add WidgetGrid, WidgetPicker, WidgetConfig components"
```

---

## Task 13: Dashboard Page

**Files:**
- Create: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Create Dashboard.tsx**

```tsx
// frontend/src/pages/Dashboard.tsx
import { useState, useRef } from 'react'
import { Pencil, Save, X, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useDashboardLayout } from '../hooks/useDashboardLayout'
import WidgetGrid from '../components/dashboard/WidgetGrid'
import WidgetPicker from '../components/dashboard/WidgetPicker'
import WidgetConfigModal from '../components/dashboard/WidgetConfig'
import { TEMPLATES, applyTemplate } from '../components/dashboard/widgetCatalog'
import type { WidgetConfig } from '../types/dashboard'

export default function Dashboard() {
  const user = useAuthStore(s => s.user)
  const role = user?.role ?? 'vendedor'
  const isAdmin = role === 'admin'

  const { query, save } = useDashboardLayout(role)

  const [editMode, setEditMode] = useState(false)
  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const savedWidgetsRef = useRef<WidgetConfig[]>([])

  const layoutWidgets: WidgetConfig[] = query.data?.layout.widgets ?? []

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function enterEdit() {
    savedWidgetsRef.current = [...layoutWidgets]
    setWidgets([...layoutWidgets])
    setEditMode(true)
  }

  function cancelEdit() {
    setWidgets([])
    setEditMode(false)
  }

  async function saveLayout() {
    await save.mutateAsync({ widgets })
    setEditMode(false)
    setWidgets([])
    showToast('Layout guardado')
  }

  function handleLayoutChange(updated: WidgetConfig[]) {
    setWidgets(updated)
  }

  function handleAdd(widget: WidgetConfig) {
    setWidgets(prev => [...prev, widget])
  }

  function handleRemove(id: string) {
    setWidgets(prev => prev.filter(w => w.id !== id))
  }

  function handleConfigure(id: string) {
    setConfiguringId(id)
  }

  function handleSaveConfig(updated: WidgetConfig) {
    setWidgets(prev => prev.map(w => w.id === updated.id ? updated : w))
  }

  function applyTempl(templateName: string) {
    const tmpl = TEMPLATES.find(t => t.name === templateName)
    if (!tmpl) return
    setWidgets(applyTemplate(tmpl, isAdmin))
    setShowTemplates(false)
  }

  const activeWidgets = editMode ? widgets : layoutWidgets

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">Cargando dashboard…</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Dashboard</h1>
        <div className="flex items-center gap-2">
          {isAdmin && !editMode && (
            <button
              onClick={enterEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
            >
              <Pencil size={13} /> Editar dashboard
            </button>
          )}
          {editMode && (
            <>
              <div className="relative">
                <button
                  onClick={() => setShowTemplates(v => !v)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Templates <ChevronDown size={12} />
                </button>
                {showTemplates && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-20 min-w-[140px]">
                    {TEMPLATES.map(t => (
                      <button
                        key={t.name}
                        onClick={() => applyTempl(t.name)}
                        className="block w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <X size={13} /> Cancelar
              </button>
              <button
                onClick={saveLayout}
                disabled={save.isPending}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
              >
                <Save size={13} /> {save.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg text-sm text-white z-50 ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          {activeWidgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
              <p className="text-sm">{isAdmin ? 'No hay widgets. Hacé clic en "Editar dashboard" para agregar.' : 'El dashboard aún no tiene widgets configurados.'}</p>
            </div>
          ) : (
            <WidgetGrid
              widgets={activeWidgets}
              editMode={editMode}
              onLayoutChange={handleLayoutChange}
              onConfigure={handleConfigure}
              onRemove={handleRemove}
            />
          )}
        </div>

        {editMode && (
          <WidgetPicker isAdmin={isAdmin} onAdd={handleAdd} />
        )}
      </div>

      {/* Config modal */}
      {configuringId && (() => {
        const w = widgets.find(x => x.id === configuringId)
        if (!w) return null
        return (
          <WidgetConfigModal
            widget={w}
            onSave={handleSaveConfig}
            onClose={() => setConfiguringId(null)}
          />
        )
      })()}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat: add Dashboard page with edit mode and template support"
```

---

## Task 14: Wire Router + Final Verification

**Files:**
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Replace placeholder with Dashboard component**

In `frontend/src/router.tsx`, add the import:
```tsx
import Dashboard from './pages/Dashboard'
```

Replace:
```tsx
{ index: true, element: <div className="p-6 text-gray-700 dark:text-gray-300">Dashboard — próximamente</div> },
```

With:
```tsx
{ index: true, element: <Dashboard /> },
```

- [ ] **Step 2: Start dev server and test manually**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173 (or whatever port Vite uses).

Manual test checklist:
- [ ] Dashboard loads (no error, shows empty state or widgets)
- [ ] Admin sees "Editar dashboard" button
- [ ] Click Edit: WidgetPicker appears on right, handles appear on widgets
- [ ] Add a widget from picker: appears in grid
- [ ] Drag widget to new position
- [ ] Click ⚙ on widget: config modal opens, can change chart type and period
- [ ] Save layout: toast "Layout guardado", grid persists on refresh
- [ ] Cancel edit: grid reverts to saved state
- [ ] Load template: widgets replaced by template preset
- [ ] vendedor user: no "Editar" button, no admin-only widgets in data

- [ ] **Step 3: Run backend tests one final time**

```bash
cd backend && python -m pytest --tb=short -q
```

Expected: all pass.

- [ ] **Step 4: Commit and mark Fase 9 done**

```bash
git add frontend/src/router.tsx
git commit -m "feat: wire Dashboard route, complete Fase 9 dashboard"
```

Update `PROGRESS.md`: change `- [ ] **Fase 9` to `- [x] **Fase 9`.

```bash
git add PROGRESS.md
git commit -m "docs: mark Fase 9 Dashboard complete in PROGRESS.md"
```
