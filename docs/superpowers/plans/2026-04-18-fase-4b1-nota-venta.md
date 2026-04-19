# Fase 4b-1: Nota de Venta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Nota de Venta module — models, API, PDF/email, and frontend list + detail pages.

**Architecture:** NV mirrors Cotizacion structure with its own correlative number (`nv_last_id` in system_config), estado machine (pendiente→despachada→entregada→pagada|cancelada), and optional FK to a Cotizacion. Lines are snapshot copies. Frontend follows CotizacionDetalle pattern with a `PATCH /{id}/estado` endpoint for state transitions.

**Tech Stack:** Python/FastAPI/SQLAlchemy 2.x mapped columns, Alembic migrations, Pydantic v2 (model_config/from_attributes), WeasyPrint+Jinja2 PDF, openpyxl Excel, React+TypeScript+React Query+Tailwind CSS frontend.

---

## File Map

**Create:**
- `backend/migrations/versions/f1a2b3c4d5e6_add_nota_ventas.py`
- `backend/app/models/nota_venta.py`
- `backend/app/schemas/nota_venta.py`
- `backend/app/api/nota_ventas.py`
- `backend/app/templates/nota_venta.html`
- `backend/tests/test_nota_ventas.py`
- `frontend/src/pages/NotaVentas.tsx`
- `frontend/src/pages/NotaVentas.test.tsx`
- `frontend/src/pages/NotaVentaDetalle.tsx`

**Modify:**
- `backend/app/models/__init__.py` — add NotaVenta, NotaVentaLinea imports
- `backend/app/services/pdf.py` — add generar_pdf_nota_venta
- `backend/app/services/email.py` — add enviar_nota_venta
- `backend/app/core/permissions.py` — vendedor nota_venta create/edit → True
- `backend/app/main.py` — include nota_ventas router
- `frontend/src/types/index.ts` — add NotaVenta, NotaVentaLinea interfaces
- `frontend/src/router.tsx` — add notas-venta routes
- `frontend/src/pages/CotizacionDetalle.tsx` — add "Crear NV" button

---

### Task 1: Alembic Migration

**Files:**
- Create: `backend/migrations/versions/f1a2b3c4d5e6_add_nota_ventas.py`

- [ ] **Step 1: Write the migration file**

```python
"""add nota_ventas and nota_venta_lineas tables

Revision ID: f1a2b3c4d5e6
Revises: e6f3a0b4c9d2
Create Date: 2026-04-18 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e6f3a0b4c9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nota_ventas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("cotizacion_id", sa.Integer(), nullable=True),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=True),
        sa.Column("vendedor_id", sa.Integer(), nullable=True),
        sa.Column("contacto", sa.String(255), nullable=True),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("correo", sa.String(255), nullable=True),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_iva", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["cotizacion_id"], ["cotizaciones.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["vendedor_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_nota_ventas_numero", "nota_ventas", ["numero"], unique=True)

    op.create_table(
        "nota_venta_lineas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nv_id", sa.Integer(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("producto_id", sa.Integer(), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("descripcion", sa.String(500), nullable=False),
        sa.Column("formato", sa.String(50), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("valor_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("iva", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("margen", sa.Numeric(10, 8), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["nv_id"], ["nota_ventas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="SET NULL"),
    )


def downgrade() -> None:
    op.drop_table("nota_venta_lineas")
    op.drop_index("ix_nota_ventas_numero", table_name="nota_ventas")
    op.drop_table("nota_ventas")
```

- [ ] **Step 2: Run migration to verify it applies cleanly**

```bash
cd backend && alembic upgrade head
```
Expected: no errors, migration applies.

- [ ] **Step 3: Run downgrade and upgrade again to verify reversibility**

```bash
cd backend && alembic downgrade -1 && alembic upgrade head
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/versions/f1a2b3c4d5e6_add_nota_ventas.py
git commit -m "feat: migration add nota_ventas and nota_venta_lineas tables"
```

---

### Task 2: NotaVenta + NotaVentaLinea Models

**Files:**
- Create: `backend/app/models/nota_venta.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Write the model file**

`backend/app/models/nota_venta.py`:
```python
from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class NotaVenta(Base):
    __tablename__ = "nota_ventas"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True
    )
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id", ondelete="RESTRICT"))
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    vendedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    cliente: Mapped["Cliente"] = relationship("Cliente")
    empresa: Mapped["Empresa | None"] = relationship("Empresa")
    vendedor: Mapped["User | None"] = relationship("User")
    cotizacion: Mapped["Cotizacion | None"] = relationship("Cotizacion")
    lineas: Mapped[list["NotaVentaLinea"]] = relationship(
        "NotaVentaLinea",
        back_populates="nv",
        cascade="all, delete-orphan",
        order_by="NotaVentaLinea.orden",
    )


class NotaVentaLinea(Base):
    __tablename__ = "nota_venta_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nv_id: Mapped[int] = mapped_column(ForeignKey("nota_ventas.id", ondelete="CASCADE"))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descripcion: Mapped[str] = mapped_column(String(500))
    formato: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cantidad: Mapped[int] = mapped_column(Integer, default=1)
    valor_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    margen: Mapped[Decimal | None] = mapped_column(Numeric(10, 8), nullable=True)

    nv: Mapped["NotaVenta"] = relationship("NotaVenta", back_populates="lineas")
    producto: Mapped["Producto | None"] = relationship("Producto")
```

- [ ] **Step 2: Update `backend/app/models/__init__.py`**

Add after the cotizacion import line:
```python
from app.models.nota_venta import NotaVenta, NotaVentaLinea  # noqa: F401
```

- [ ] **Step 3: Verify import works**

```bash
cd backend && python -c "from app.models.nota_venta import NotaVenta, NotaVentaLinea; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/nota_venta.py backend/app/models/__init__.py
git commit -m "feat: add NotaVenta and NotaVentaLinea models"
```

---

### Task 3: Schemas

**Files:**
- Create: `backend/app/schemas/nota_venta.py`

- [ ] **Step 1: Write the schemas file**

`backend/app/schemas/nota_venta.py`:
```python
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel
from app.schemas.empresa import EmpresaRef


class NotaVentaLineaCreate(BaseModel):
    orden: int
    producto_id: int | None = None
    sku: str | None = None
    descripcion: str
    formato: str | None = None
    cantidad: int = 1
    valor_neto: Decimal = Decimal("0")


class NotaVentaLineaOut(NotaVentaLineaCreate):
    id: int
    total_neto: Decimal
    iva: Decimal
    total: Decimal
    margen: Decimal | None = None
    model_config = {"from_attributes": True}


class NotaVentaCreate(BaseModel):
    cliente_id: int
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    lineas: list[NotaVentaLineaCreate] = []


class NotaVentaUpdate(BaseModel):
    cliente_id: int | None = None
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None


class EstadoCambio(BaseModel):
    estado: str


class ClienteMinOut(BaseModel):
    id: int
    nombre: str
    rut: str | None = None
    email: str | None = None
    telefono: str | None = None
    model_config = {"from_attributes": True}


class VendedorMinOut(BaseModel):
    id: int
    name: str
    email: str
    model_config = {"from_attributes": True}


class CotizacionRef(BaseModel):
    id: int
    numero: int
    model_config = {"from_attributes": True}


class NotaVentaOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    cliente_id: int
    vendedor_id: int | None = None
    empresa_id: int | None = None
    contacto: str | None = None
    fecha: date
    estado: str
    nota: str | None = None
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    cotizacion: CotizacionRef | None = None
    lineas: list[NotaVentaLineaOut] = []
    model_config = {"from_attributes": True}


class NotaVentaListOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    cliente_id: int
    vendedor_id: int | None = None
    empresa_id: int | None = None
    contacto: str | None = None
    fecha: date
    estado: str
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Verify import**

```bash
cd backend && python -c "from app.schemas.nota_venta import NotaVentaOut; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/nota_venta.py
git commit -m "feat: add NotaVenta schemas"
```

---

### Task 4: Permissions + Router Registration

**Files:**
- Modify: `backend/app/core/permissions.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Update vendedor permissions in `permissions.py`**

In the `_DEFAULT["vendedor"]` dict, change `nota_venta` line from:
```python
"nota_venta":     {"view": True,  "create": False, "edit": False, "delete": False},
```
to:
```python
"nota_venta":     {"view": True,  "create": True,  "edit": True,  "delete": False},
```

- [ ] **Step 2: Add router to `main.py`**

Add import at top of imports block:
```python
from app.api import nota_ventas
```

Add after the cotizaciones router line:
```python
app.include_router(nota_ventas.router, prefix="/api/nota_ventas", tags=["nota_ventas"])
```

Note: the `nota_ventas.py` file does not exist yet. Create an empty router stub so the app imports without error:

`backend/app/api/nota_ventas.py` (temporary stub):
```python
from fastapi import APIRouter
router = APIRouter()
```

- [ ] **Step 3: Verify app imports correctly**

```bash
cd backend && python -c "from app.main import app; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/permissions.py backend/app/main.py backend/app/api/nota_ventas.py
git commit -m "feat: register nota_ventas router, update vendedor permissions"
```

---

### Task 5: Write Failing Backend Tests

**Files:**
- Create: `backend/tests/test_nota_ventas.py`

- [ ] **Step 1: Write the test file**

`backend/tests/test_nota_ventas.py`:
```python
import pytest

# ── helpers ──────────────────────────────────────────────────────────────────

def _make_cliente(client, token):
    r = client.post("/api/clientes/", json={"nombre": "Cliente NV Test"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()["id"]


def _make_cotizacion(client, token, cliente_id):
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cliente_id,
        "lineas": [{"orden": 1, "descripcion": "Prod A", "cantidad": 2, "valor_neto": 1000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()


def _create_nv(client, token, cliente_id, **extra):
    payload = {"cliente_id": cliente_id, **extra}
    return client.post("/api/nota_ventas/", json=payload,
                       headers={"Authorization": f"Bearer {token}"})


# ── auth ─────────────────────────────────────────────────────────────────────

def test_listar_sin_auth(client):
    assert client.get("/api/nota_ventas/").status_code == 401


def test_crear_sin_auth(client):
    assert client.post("/api/nota_ventas/", json={"cliente_id": 1}).status_code == 401


# ── crear desde cero ──────────────────────────────────────────────────────────

def test_crear_nv_admin(client, admin_token):
    cid = _make_cliente(client, admin_token)
    r = _create_nv(client, admin_token, cid,
                   lineas=[{"orden": 1, "descripcion": "Artículo", "cantidad": 1, "valor_neto": 500}])
    assert r.status_code == 201
    data = r.json()
    assert data["numero"] >= 1
    assert data["estado"] == "pendiente"
    assert len(data["lineas"]) == 1
    assert float(data["total_neto"]) == 500
    assert float(data["total_iva"]) == pytest.approx(95, rel=0.01)
    assert float(data["total"]) == pytest.approx(595, rel=0.01)


def test_crear_nv_vendedor(client, vendedor_token):
    cid = _make_cliente(client, vendedor_token)
    r = _create_nv(client, vendedor_token, cid)
    assert r.status_code == 201


def test_numeros_son_consecutivos(client, admin_token):
    cid = _make_cliente(client, admin_token)
    r1 = _create_nv(client, admin_token, cid)
    r2 = _create_nv(client, admin_token, cid)
    assert r2.json()["numero"] == r1.json()["numero"] + 1


# ── crear desde cotización ───────────────────────────────────────────────────

def test_crear_nv_desde_cotizacion(client, admin_token):
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid)
    r = client.post(f"/api/nota_ventas/from_cotizacion/{cot['id']}",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201
    nv = r.json()
    assert nv["cotizacion_id"] == cot["id"]
    assert len(nv["lineas"]) == 1
    assert nv["lineas"][0]["descripcion"] == "Prod A"
    assert nv["lineas"][0]["cantidad"] == 2
    assert float(nv["lineas"][0]["valor_neto"]) == 1000


def test_crear_nv_desde_cotizacion_cierra_cotizacion(client, admin_token):
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid)
    client.post(f"/api/nota_ventas/from_cotizacion/{cot['id']}",
                headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get(f"/api/cotizaciones/{cot['id']}",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.json()["estado"] == "cerrada_fv"


def test_crear_nv_desde_cotizacion_404(client, admin_token):
    r = client.post("/api/nota_ventas/from_cotizacion/9999",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


# ── listar ────────────────────────────────────────────────────────────────────

def test_listar_nvs(client, admin_token):
    cid = _make_cliente(client, admin_token)
    _create_nv(client, admin_token, cid)
    r = client.get("/api/nota_ventas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_filtrar_por_estado(client, admin_token):
    cid = _make_cliente(client, admin_token)
    _create_nv(client, admin_token, cid)
    r = client.get("/api/nota_ventas/?estado=pendiente",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    for nv in r.json():
        assert nv["estado"] == "pendiente"


# ── obtener ───────────────────────────────────────────────────────────────────

def test_obtener_nv(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.get(f"/api/nota_ventas/{nv_id}",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["id"] == nv_id


def test_obtener_nv_404(client, admin_token):
    r = client.get("/api/nota_ventas/9999",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


# ── actualizar header ─────────────────────────────────────────────────────────

def test_actualizar_header(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}",
                     json={"contacto": "Juan Pérez", "correo": "juan@test.cl"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["contacto"] == "Juan Pérez"


def test_vendedor_no_puede_editar_nv_ajena(client, admin_token, vendedor_token, vendedor_user):
    cid = _make_cliente(client, admin_token)
    # admin creates NV with a different vendedor (admin themselves)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}",
                     json={"contacto": "Hack"},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403


def test_vendedor_puede_editar_nv_propia(client, admin_token, vendedor_token, vendedor_user):
    cid = _make_cliente(client, vendedor_token)
    nv_id = _create_nv(client, vendedor_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}",
                     json={"contacto": "Yo mismo"},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


# ── reemplazar líneas ─────────────────────────────────────────────────────────

def test_reemplazar_lineas_recalcula_totales(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid,
                       lineas=[{"orden": 1, "descripcion": "X", "cantidad": 1, "valor_neto": 100}]
                       ).json()["id"]
    r = client.put(f"/api/nota_ventas/{nv_id}/lineas",
                   json=[{"orden": 1, "descripcion": "Y", "cantidad": 3, "valor_neto": 200}],
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert float(data["total_neto"]) == 600
    assert float(data["total_iva"]) == pytest.approx(114, rel=0.01)
    assert float(data["total"]) == pytest.approx(714, rel=0.01)


# ── cambio de estado ──────────────────────────────────────────────────────────

def test_admin_puede_despaChar(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "despachada"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["estado"] == "despachada"


def test_vendedor_puede_despachar(client, vendedor_token):
    cid = _make_cliente(client, vendedor_token)
    nv_id = _create_nv(client, vendedor_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "despachada"},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_vendedor_no_puede_pagar(client, admin_token, vendedor_token, vendedor_user):
    cid = _make_cliente(client, admin_token)
    # create NV owned by vendedor
    nv = _create_nv(client, vendedor_token, _make_cliente(client, vendedor_token)).json()
    # advance to entregada via admin
    client.patch(f"/api/nota_ventas/{nv['id']}/estado",
                 json={"estado": "despachada"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    client.patch(f"/api/nota_ventas/{nv['id']}/estado",
                 json={"estado": "entregada"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    r = client.patch(f"/api/nota_ventas/{nv['id']}/estado",
                     json={"estado": "pagada"},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403


def test_admin_puede_pagar(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    client.patch(f"/api/nota_ventas/{nv_id}/estado",
                 json={"estado": "despachada"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    client.patch(f"/api/nota_ventas/{nv_id}/estado",
                 json={"estado": "entregada"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "pagada"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["estado"] == "pagada"


def test_vendedor_no_puede_cancelar(client, vendedor_token):
    cid = _make_cliente(client, vendedor_token)
    nv_id = _create_nv(client, vendedor_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "cancelada"},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403


def test_transicion_invalida_retorna_422(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    # pendiente → pagada is not a valid direct transition
    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "pagada"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422


# ── eliminar ──────────────────────────────────────────────────────────────────

def test_eliminar_nv_pendiente(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.delete(f"/api/nota_ventas/{nv_id}",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 204


def test_eliminar_nv_despachada_falla(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    client.patch(f"/api/nota_ventas/{nv_id}/estado",
                 json={"estado": "despachada"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    r = client.delete(f"/api/nota_ventas/{nv_id}",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409


# ── pdf ───────────────────────────────────────────────────────────────────────

def test_pdf_retorna_bytes(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.get(f"/api/nota_ventas/{nv_id}/pdf",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"


# ── excel ─────────────────────────────────────────────────────────────────────

def test_excel_export(client, admin_token):
    cid = _make_cliente(client, admin_token)
    _create_nv(client, admin_token, cid)
    r = client.get("/api/nota_ventas/export/excel",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
```

- [ ] **Step 2: Run tests to confirm they fail (router stub has no routes)**

```bash
cd backend && python -m pytest tests/test_nota_ventas.py -v --tb=short 2>&1 | head -40
```
Expected: tests fail with 404 or 405 (routes not implemented yet). Auth test may pass (401).

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/test_nota_ventas.py
git commit -m "test: add failing tests for nota_ventas API"
```

---

### Task 6: Implement nota_ventas.py API

**Files:**
- Modify: `backend/app/api/nota_ventas.py` (replace stub with full implementation)

- [ ] **Step 1: Write the full API**

`backend/app/api/nota_ventas.py`:
```python
from datetime import date
from decimal import Decimal
from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.api.deps import require_permission
from app.database import get_db
from app.models.cotizacion import Cotizacion
from app.models.nota_venta import NotaVenta, NotaVentaLinea
from app.models.producto import Producto
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.nota_venta import (
    EstadoCambio,
    NotaVentaCreate,
    NotaVentaListOut,
    NotaVentaLineaCreate,
    NotaVentaOut,
    NotaVentaUpdate,
)
from app.services.email import EmailNotConfiguredError, enviar_nota_venta
from app.services.pdf import generar_pdf_nota_venta

router = APIRouter()

# ── valid estado transitions ─────────────────────────────────────────────────
# (from_estado, to_estado): min_role  ("any" = vendedor ok, "admin" = admin/subadmin only)
_TRANSITIONS: dict[tuple[str, str], str] = {
    ("pendiente",  "despachada"): "any",
    ("despachada", "entregada"):  "any",
    ("entregada",  "pagada"):     "admin",
    ("pendiente",  "cancelada"):  "admin",
    ("despachada", "cancelada"):  "admin",
    ("entregada",  "cancelada"):  "admin",
    ("pagada",     "cancelada"):  "admin",
}


def _get_config_dict(db: Session) -> dict:
    return {r.key: r.value for r in db.query(SystemConfig).all()}


def _asignar_numero_nv(db: Session) -> int:
    config = (
        db.query(SystemConfig)
        .filter_by(key="nv_last_id")
        .with_for_update()
        .first()
    )
    if not config:
        config = SystemConfig(key="nv_last_id", value="0")
        db.add(config)
        db.flush()
    numero = int(config.value) + 1
    config.value = str(numero)
    return numero


def _calcular_lineas(db: Session, lineas_data: list[NotaVentaLineaCreate]) -> list[NotaVentaLinea]:
    lineas = []
    for data in lineas_data:
        total_neto = data.cantidad * data.valor_neto
        iva = total_neto * Decimal("0.19")
        total = total_neto + iva
        margen = None
        if data.producto_id:
            producto = db.get(Producto, data.producto_id)
            if producto and data.valor_neto > 0:
                margen = (data.valor_neto - producto.precio_costo) / data.valor_neto
        lineas.append(NotaVentaLinea(
            orden=data.orden,
            producto_id=data.producto_id,
            sku=data.sku,
            descripcion=data.descripcion,
            formato=data.formato,
            cantidad=data.cantidad,
            valor_neto=data.valor_neto,
            total_neto=total_neto,
            iva=iva,
            total=total,
            margen=margen,
        ))
    return lineas


def _recalcular_totales(nv: NotaVenta) -> None:
    nv.total_neto = sum(l.total_neto for l in nv.lineas)
    nv.total_iva = sum(l.iva for l in nv.lineas)
    nv.total = sum(l.total for l in nv.lineas)


def _can_edit(current_user: User, nv: NotaVenta) -> bool:
    if current_user.role in ("admin", "subadmin"):
        return True
    return nv.vendedor_id == current_user.id


def _load_nv(db: Session, nv_id: int) -> NotaVenta:
    nv = db.query(NotaVenta).options(
        joinedload(NotaVenta.cliente),
        joinedload(NotaVenta.vendedor),
        joinedload(NotaVenta.empresa),
        joinedload(NotaVenta.cotizacion),
        joinedload(NotaVenta.lineas),
    ).filter(NotaVenta.id == nv_id).first()
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    return nv


# ── excel must be before GET "/" ─────────────────────────────────────────────

@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    nvs = (
        db.query(NotaVenta)
        .options(joinedload(NotaVenta.cliente), joinedload(NotaVenta.vendedor))
        .order_by(NotaVenta.numero.desc())
        .all()
    )
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Notas de Venta"
    ws.append(["Nº NV", "Fecha", "Cliente", "Contacto", "Total Neto", "IVA", "Total", "Estado", "Encargado"])
    for nv in nvs:
        ws.append([
            nv.numero,
            nv.fecha.strftime("%d/%m/%Y") if nv.fecha else "",
            nv.cliente.nombre if nv.cliente else "",
            nv.contacto or "",
            float(nv.total_neto),
            float(nv.total_iva),
            float(nv.total),
            nv.estado,
            nv.vendedor.name if nv.vendedor else "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=notas_venta.xlsx"},
    )


@router.get("/", response_model=list[NotaVentaListOut])
def listar_nvs(
    estado: str | None = Query(None),
    vendedor_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    q = db.query(NotaVenta).options(
        joinedload(NotaVenta.cliente),
        joinedload(NotaVenta.vendedor),
        joinedload(NotaVenta.empresa),
    )
    if estado:
        q = q.filter(NotaVenta.estado == estado)
    if vendedor_id:
        q = q.filter(NotaVenta.vendedor_id == vendedor_id)
    if cliente_id:
        q = q.filter(NotaVenta.cliente_id == cliente_id)
    if fecha_desde:
        q = q.filter(NotaVenta.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(NotaVenta.fecha <= fecha_hasta)
    return q.order_by(NotaVenta.numero.desc()).all()


@router.post("/", response_model=NotaVentaOut, status_code=status.HTTP_201_CREATED)
def crear_nv(
    body: NotaVentaCreate,
    perms: tuple[User, Session] = require_permission("nota_venta", "create"),
):
    current_user, db = perms
    numero = _asignar_numero_nv(db)
    vendedor_id = (
        body.vendedor_id
        if body.vendedor_id and current_user.role in ("admin", "subadmin")
        else current_user.id
    )
    nv = NotaVenta(
        numero=numero,
        cliente_id=body.cliente_id,
        vendedor_id=vendedor_id,
        contacto=body.contacto,
        fecha=body.fecha or date.today(),
        nota=body.nota,
        correo=body.correo,
        empresa_id=body.empresa_id,
    )
    db.add(nv)
    db.flush()
    nv.lineas = _calcular_lineas(db, body.lineas)
    for linea in nv.lineas:
        linea.nv_id = nv.id
    _recalcular_totales(nv)
    db.commit()
    return _load_nv(db, nv.id)


@router.post("/from_cotizacion/{cot_id}", response_model=NotaVentaOut, status_code=status.HTTP_201_CREATED)
def crear_nv_desde_cotizacion(
    cot_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "create"),
):
    current_user, db = perms
    cot = db.query(Cotizacion).options(joinedload(Cotizacion.lineas)).filter(Cotizacion.id == cot_id).first()
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")

    numero = _asignar_numero_nv(db)
    nv = NotaVenta(
        numero=numero,
        cotizacion_id=cot.id,
        cliente_id=cot.cliente_id,
        empresa_id=cot.empresa_id,
        vendedor_id=cot.vendedor_id,
        contacto=cot.contacto,
        fecha=date.today(),
        nota=cot.nota,
        correo=cot.correo,
    )
    db.add(nv)
    db.flush()

    lineas = []
    for cl in cot.lineas:
        lineas.append(NotaVentaLinea(
            nv_id=nv.id,
            orden=cl.orden,
            producto_id=cl.producto_id,
            sku=cl.sku,
            descripcion=cl.descripcion,
            formato=cl.formato,
            cantidad=cl.cantidad,
            valor_neto=cl.valor_neto,
            total_neto=cl.total_neto,
            iva=cl.iva,
            total=cl.total,
            margen=cl.margen,
        ))
    nv.lineas = lineas
    _recalcular_totales(nv)

    cot.estado = "cerrada_fv"
    db.commit()
    return _load_nv(db, nv.id)


@router.get("/{nv_id}", response_model=NotaVentaOut)
def obtener_nv(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    return _load_nv(db, nv_id)


@router.patch("/{nv_id}", response_model=NotaVentaOut)
def actualizar_nv(
    nv_id: int,
    body: NotaVentaUpdate,
    perms: tuple[User, Session] = require_permission("nota_venta", "edit"),
):
    current_user, db = perms
    nv = db.get(NotaVenta, nv_id)
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    if not _can_edit(current_user, nv):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos para editar esta NV")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(nv, field, value)
    db.commit()
    return _load_nv(db, nv_id)


@router.put("/{nv_id}/lineas", response_model=NotaVentaOut)
def reemplazar_lineas(
    nv_id: int,
    lineas_data: list[NotaVentaLineaCreate],
    perms: tuple[User, Session] = require_permission("nota_venta", "edit"),
):
    current_user, db = perms
    nv = db.query(NotaVenta).options(joinedload(NotaVenta.lineas)).filter(NotaVenta.id == nv_id).first()
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    if not _can_edit(current_user, nv):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
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
    db.commit()
    return _load_nv(db, nv_id)


@router.patch("/{nv_id}/estado", response_model=NotaVentaOut)
def cambiar_estado(
    nv_id: int,
    body: EstadoCambio,
    perms: tuple[User, Session] = require_permission("nota_venta", "edit"),
):
    current_user, db = perms
    nv = db.get(NotaVenta, nv_id)
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")

    transition = (nv.estado, body.estado)
    allowed = _TRANSITIONS.get(transition)
    if allowed is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Transición '{nv.estado}' → '{body.estado}' no permitida",
        )
    if allowed == "admin" and current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede hacer esta transición")

    nv.estado = body.estado
    db.commit()
    return _load_nv(db, nv_id)


@router.delete("/{nv_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_nv(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "delete"),
):
    current_user, db = perms
    nv = db.get(NotaVenta, nv_id)
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    if nv.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se pueden eliminar notas de venta en estado 'pendiente'",
        )
    db.delete(nv)
    db.commit()


@router.get("/{nv_id}/pdf")
def generar_pdf(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    nv = _load_nv(db, nv_id)
    config = _get_config_dict(db)
    pdf_bytes = generar_pdf_nota_venta(nv, config)
    cliente_nombre = nv.cliente.nombre if nv.cliente else "cliente"
    filename = f"NV - {nv.numero} {nv.fecha}.{nv.contacto or ''}. {cliente_nombre}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{nv_id}/email")
def enviar_email(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    nv = _load_nv(db, nv_id)
    config = _get_config_dict(db)
    try:
        pdf_bytes = generar_pdf_nota_venta(nv, config)
        enviar_nota_venta(nv, pdf_bytes)
    except EmailNotConfiguredError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error al enviar email: {e}")
    return {"detail": "Email enviado correctamente"}
```

- [ ] **Step 2: Run the tests — expect most to pass**

```bash
cd backend && python -m pytest tests/test_nota_ventas.py -v --tb=short
```
Expected: most tests pass. PDF test will fail because `generar_pdf_nota_venta` doesn't exist yet — that's OK, it's fixed in Task 7.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/nota_ventas.py
git commit -m "feat: implement nota_ventas API endpoints"
```

---

### Task 7: PDF Template + Services

**Files:**
- Create: `backend/app/templates/nota_venta.html`
- Modify: `backend/app/services/pdf.py`
- Modify: `backend/app/services/email.py`

- [ ] **Step 1: Create `nota_venta.html` (copy of cotizacion.html with NV branding)**

`backend/app/templates/nota_venta.html`:
```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #333; padding: 20px; }
  @page { size: A4; margin: 15mm; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #2563eb; padding-bottom: 16px; }
  .header-left { flex: 1; }
  .header-right { text-align: right; }
  .logo { max-height: 60px; max-width: 180px; margin-bottom: 8px; }
  .empresa-nombre { font-size: 14px; font-weight: bold; color: #1e3a5f; }
  .empresa-info { font-size: 10px; color: #666; margin-top: 2px; }
  .doc-numero { font-size: 22px; font-weight: bold; color: #2563eb; }
  .doc-label { font-size: 11px; font-weight: bold; color: #555; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .doc-fecha { font-size: 11px; color: #555; margin-top: 4px; }

  .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 4px; }
  .cliente-block { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 12px; margin-bottom: 20px; }
  .cliente-nombre { font-size: 13px; font-weight: bold; color: #1e3a5f; margin-bottom: 4px; }
  .cliente-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px; color: #555; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead th { background: #2563eb; color: white; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th.right { text-align: right; }
  tbody tr:nth-child(even) { background: #f8f9fb; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 10px; vertical-align: top; }
  tbody td.right { text-align: right; white-space: nowrap; }
  tbody td.center { text-align: center; }

  .totales { display: flex; justify-content: flex-end; margin-top: 8px; }
  .totales-tabla { width: 260px; }
  .totales-tabla td { padding: 4px 8px; font-size: 11px; }
  .totales-tabla td:last-child { text-align: right; font-weight: 600; }
  .totales-tabla tr:last-child td { border-top: 2px solid #2563eb; font-size: 13px; font-weight: bold; color: #2563eb; }

  .nota-block { margin-top: 20px; padding: 10px 12px; border-left: 3px solid #2563eb; background: #f0f4ff; font-size: 10px; color: #444; }
  .nota-label { font-weight: bold; color: #2563eb; margin-bottom: 4px; }

  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9px; color: #aaa; text-align: center; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="header-left">
    {% if config.empresa_logo_url %}
    <img src="{{ config.empresa_logo_url }}" class="logo" alt="Logo">
    {% endif %}
    <div class="empresa-nombre">{{ config.empresa_nombre or 'Distribuidora Conico Ltda.' }}</div>
    {% if config.empresa_rut %}<div class="empresa-info">RUT: {{ config.empresa_rut }}</div>{% endif %}
    {% if config.empresa_direccion %}<div class="empresa-info">{{ config.empresa_direccion }}</div>{% endif %}
  </div>
  <div class="header-right">
    <div class="doc-label">Nota de Venta</div>
    <div class="doc-numero">NV-{{ '%05d' % nv.numero }}</div>
    <div class="doc-fecha">Fecha: {{ nv.fecha.strftime('%d/%m/%Y') if nv.fecha else '' }}</div>
  </div>
</div>

<!-- CLIENTE -->
<div class="section-title">Datos del Cliente</div>
<div class="cliente-block">
  <div class="cliente-nombre">{{ nv.cliente.nombre if nv.cliente else '' }}</div>
  <div class="cliente-grid">
    {% if nv.cliente and nv.cliente.rut %}
    <div><strong>RUT:</strong> {{ nv.cliente.rut }}</div>
    {% endif %}
    {% if nv.contacto %}
    <div><strong>Contacto:</strong> {{ nv.contacto }}</div>
    {% endif %}
    {% if nv.correo %}
    <div><strong>Email:</strong> {{ nv.correo }}</div>
    {% endif %}
    {% if nv.cliente and nv.cliente.telefono %}
    <div><strong>Teléfono:</strong> {{ nv.cliente.telefono }}</div>
    {% endif %}
  </div>
</div>

<!-- LÍNEAS -->
<div class="section-title">Detalle de Productos</div>
<table>
  <thead>
    <tr>
      <th style="width:28px">Nº</th>
      <th style="width:80px">SKU</th>
      <th>Descripción</th>
      <th style="width:70px">Formato</th>
      <th class="right" style="width:55px">Cant.</th>
      <th class="right" style="width:85px">Valor Neto</th>
      <th class="right" style="width:90px">Total Neto</th>
    </tr>
  </thead>
  <tbody>
    {% for linea in nv.lineas %}
    <tr>
      <td class="center">{{ loop.index }}</td>
      <td>{{ linea.sku or '' }}</td>
      <td>{{ linea.descripcion }}</td>
      <td>{{ linea.formato or '' }}</td>
      <td class="right">{{ linea.cantidad }}</td>
      <td class="right">{{ '{:,.0f}'.format(linea.valor_neto) }}</td>
      <td class="right">{{ '{:,.0f}'.format(linea.total_neto) }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>

<!-- TOTALES -->
<div class="totales">
  <table class="totales-tabla">
    <tr>
      <td>Total Neto</td>
      <td>$ {{ '{:,.0f}'.format(nv.total_neto) }}</td>
    </tr>
    <tr>
      <td>IVA (19%)</td>
      <td>$ {{ '{:,.0f}'.format(nv.total_iva) }}</td>
    </tr>
    <tr>
      <td>TOTAL</td>
      <td>$ {{ '{:,.0f}'.format(nv.total) }}</td>
    </tr>
  </table>
</div>

<!-- NOTA -->
{% if nv.nota %}
<div class="nota-block">
  <div class="nota-label">Observaciones</div>
  <div>{{ nv.nota }}</div>
</div>
{% endif %}

<div class="footer">
  Documento generado el {{ nv.fecha.strftime('%d/%m/%Y') if nv.fecha else '' }} · {{ config.empresa_nombre or '' }}
</div>

</body>
</html>
```

- [ ] **Step 2: Add `generar_pdf_nota_venta` to `backend/app/services/pdf.py`**

Append to the existing file:
```python

def generar_pdf_nota_venta(nv, config: dict) -> bytes:
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    template = env.get_template("nota_venta.html")
    html_str = template.render(nv=nv, config=config)
    return HTML(string=html_str, base_url=TEMPLATES_DIR).write_pdf()
```

- [ ] **Step 3: Add `enviar_nota_venta` to `backend/app/services/email.py`**

Append to the existing file:
```python


def enviar_nota_venta(nv, pdf_bytes: bytes) -> None:
    cfg = _get_smtp_config()

    empresa_nombre = "Conico"
    to_addr = nv.correo or ""
    if not to_addr:
        raise ValueError("La nota de venta no tiene correo de destino")

    numero_str = f"NV-{nv.numero:05d}"
    fecha_str = nv.fecha.strftime("%d/%m/%Y") if nv.fecha else ""
    cliente_nombre = nv.cliente.nombre if nv.cliente else ""

    msg = MIMEMultipart()
    msg["From"] = cfg["from"]
    msg["To"] = to_addr
    msg["Subject"] = f"Nota de Venta {numero_str} — {empresa_nombre}"

    body = (
        f"Estimado/a {nv.contacto or cliente_nombre},\n\n"
        f"Adjuntamos la nota de venta {numero_str} de fecha {fecha_str}.\n\n"
        f"Cliente: {cliente_nombre}\n"
        f"Total: $ {nv.total:,.0f}\n\n"
        f"Quedamos a su disposición para cualquier consulta.\n\n"
        f"Saludos,\n{empresa_nombre}"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    filename = f"{numero_str} {fecha_str}.{nv.contacto or cliente_nombre}.pdf"
    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(attachment)

    with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
        server.ehlo()
        server.starttls()
        server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from"], to_addr, msg.as_string())
```

- [ ] **Step 4: Run all nota_ventas tests — expect all to pass**

```bash
cd backend && python -m pytest tests/test_nota_ventas.py -v
```
Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd backend && python -m pytest --tb=short -q
```
Expected: no new failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/templates/nota_venta.html backend/app/services/pdf.py backend/app/services/email.py
git commit -m "feat: add PDF template and email service for nota_venta"
```

---

### Task 8: Frontend Types + Router

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Add types to `frontend/src/types/index.ts`**

Append at the end of the file:
```typescript
export interface NotaVentaLinea {
  id?: number
  orden: number
  producto_id: number | null
  sku: string | null
  descripcion: string
  formato: string | null
  cantidad: number
  valor_neto: number
  total_neto: number
  iva: number
  total: number
  margen: number | null
}

export interface NotaVenta {
  id: number
  numero: number
  cotizacion_id: number | null
  cliente_id: number
  vendedor_id: number | null
  empresa_id: number | null
  empresa?: EmpresaRef | null
  contacto: string | null
  fecha: string
  estado: 'pendiente' | 'despachada' | 'entregada' | 'pagada' | 'cancelada'
  nota: string | null
  correo: string | null
  total_neto: number
  total_iva: number
  total: number
  created_at: string
  updated_at: string
  cliente?: { id: number; nombre: string; rut: string | null; email: string | null; telefono: string | null }
  vendedor?: { id: number; name: string; email: string }
  cotizacion?: { id: number; numero: number } | null
  lineas?: NotaVentaLinea[]
}
```

- [ ] **Step 2: Add routes to `frontend/src/router.tsx`**

Add imports at the top:
```typescript
import NotaVentas from './pages/NotaVentas'
import NotaVentaDetalle from './pages/NotaVentaDetalle'
```

Add routes inside the children array after the cotizaciones routes:
```typescript
{ path: 'notas-venta', element: <NotaVentas /> },
{ path: 'notas-venta/nueva', element: <NotaVentaDetalle /> },
{ path: 'notas-venta/:id', element: <NotaVentaDetalle /> },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: errors only about missing page files (NotaVentas, NotaVentaDetalle not created yet) — that's OK, fixed in Tasks 9 and 10.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/router.tsx
git commit -m "feat: add NotaVenta types and routes"
```

---

### Task 9: NotaVentas List Page

**Files:**
- Create: `frontend/src/pages/NotaVentas.tsx`
- Create: `frontend/src/pages/NotaVentas.test.tsx`

- [ ] **Step 1: Write the failing test first**

`frontend/src/pages/NotaVentas.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import NotaVentas from './NotaVentas'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

const { api } = await import('../lib/api')

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue({ data: [] })
})

describe('NotaVentas', () => {
  it('renderiza título', async () => {
    wrap(<NotaVentas />)
    expect(await screen.findByText('Notas de Venta')).toBeTruthy()
  })

  it('muestra mensaje cuando no hay NVs', async () => {
    wrap(<NotaVentas />)
    expect(await screen.findByText(/sin notas de venta/i)).toBeTruthy()
  })

  it('renderiza NV de la lista', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{
        id: 1, numero: 1, cotizacion_id: null,
        cliente_id: 1, vendedor_id: null, empresa_id: null,
        contacto: null, fecha: '2026-04-18',
        estado: 'pendiente', nota: null, correo: null,
        total_neto: 1000, total_iva: 190, total: 1190,
        created_at: '2026-04-18T00:00:00Z', updated_at: '2026-04-18T00:00:00Z',
        cliente: { id: 1, nombre: 'Empresa ABC', rut: null, email: null, telefono: null },
      }],
    })
    wrap(<NotaVentas />)
    expect(await screen.findByText('Empresa ABC')).toBeTruthy()
    expect(await screen.findByText('NV-00001')).toBeTruthy()
  })

  it('muestra badge de estado', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{
        id: 1, numero: 1, cotizacion_id: null,
        cliente_id: 1, vendedor_id: null, empresa_id: null,
        contacto: null, fecha: '2026-04-18',
        estado: 'despachada', nota: null, correo: null,
        total_neto: 0, total_iva: 0, total: 0,
        created_at: '2026-04-18T00:00:00Z', updated_at: '2026-04-18T00:00:00Z',
        cliente: { id: 1, nombre: 'X', rut: null, email: null, telefono: null },
      }],
    })
    wrap(<NotaVentas />)
    expect(await screen.findByText('Despachada')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify test fails (component doesn't exist yet)**

```bash
cd frontend && npx vitest run src/pages/NotaVentas.test.tsx 2>&1 | head -20
```
Expected: error — module not found.

- [ ] **Step 3: Write `NotaVentas.tsx`**

`frontend/src/pages/NotaVentas.tsx`:
```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Eye, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import type { NotaVenta } from '../types'

const ESTADO_LABELS: Record<string, string> = {
  pendiente:  'Pendiente',
  despachada: 'Despachada',
  entregada:  'Entregada',
  pagada:     'Pagada',
  cancelada:  'Cancelada',
}

const ESTADO_COLORS: Record<string, string> = {
  pendiente:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  despachada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  entregada:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  pagada:     'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelada:  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export default function NotaVentas() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [estado, setEstado] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)

  const { data: nvs = [], isLoading } = useQuery<NotaVenta[]>({
    queryKey: ['nota_ventas', estado, fechaDesde, fechaHasta],
    queryFn: () => api.get(`/api/nota_ventas/?${params.toString()}`).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/nota_ventas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nota_ventas'] }); setDeleteId(null); setDeleteError('') },
    onError: (err: any) => setDeleteError(err?.response?.data?.detail || 'Error al eliminar'),
  })

  function fmtMoney(n: number) {
    return `$ ${Math.round(n).toLocaleString('es-CL')}`
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Notas de Venta</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('/api/nota_ventas/export/excel', '_blank')}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Excel
          </button>
          <button
            onClick={() => navigate('/notas-venta/nueva')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nueva NV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={estado}
          onChange={e => setEstado(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
      </div>

      {isLoading ? (
        <div className="text-gray-500 py-8 text-center">Cargando...</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                {['Nº', 'Fecha', 'Cliente', 'Contacto', 'Total', 'Estado', 'Encargado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {nvs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin notas de venta</td></tr>
              )}
              {nvs.map(nv => (
                <tr key={nv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    NV-{String(nv.numero).padStart(5, '0')}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(nv.fecha + 'T00:00:00').toLocaleDateString('es-CL')}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{nv.cliente?.nombre ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{nv.contacto ?? '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {fmtMoney(nv.total)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[nv.estado] ?? ''}`}>
                      {ESTADO_LABELS[nv.estado] ?? nv.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{nv.vendedor?.name ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/notas-venta/${nv.id}`)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="Ver/Editar"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => window.open(`/api/nota_ventas/${nv.id}/pdf`, '_blank')}
                        className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
                        title="PDF"
                      >
                        <FileText size={15} />
                      </button>
                      {nv.estado === 'pendiente' && (
                        <button
                          onClick={() => { setDeleteId(nv.id); setDeleteError('') }}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">¿Eliminar nota de venta?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Esta acción no se puede deshacer.</p>
            {deleteError && <p className="text-sm text-red-500 mb-3">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDeleteId(null); setDeleteError('') }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Cancelar
              </button>
              <button onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                {deleteMut.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
cd frontend && npx vitest run src/pages/NotaVentas.test.tsx
```
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/NotaVentas.tsx frontend/src/pages/NotaVentas.test.tsx
git commit -m "feat: add NotaVentas list page with tests"
```

---

### Task 10: NotaVentaDetalle Page

**Files:**
- Create: `frontend/src/pages/NotaVentaDetalle.tsx`

- [ ] **Step 1: Write the component**

`frontend/src/pages/NotaVentaDetalle.tsx`:
```typescript
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, FileText, Mail, ArrowLeft, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { NotaVenta, NotaVentaLinea, Cliente, User, Producto, Empresa } from '../types'

type LineaLocal = Omit<NotaVentaLinea, 'id'> & { id?: number; _key: string }

const ESTADO_LABELS: Record<string, string> = {
  pendiente:  'Pendiente',
  despachada: 'Despachada',
  entregada:  'Entregada',
  pagada:     'Pagada',
  cancelada:  'Cancelada',
}

const ESTADO_COLORS: Record<string, string> = {
  pendiente:  'bg-gray-100 text-gray-700',
  despachada: 'bg-blue-100 text-blue-700',
  entregada:  'bg-yellow-100 text-yellow-700',
  pagada:     'bg-green-100 text-green-700',
  cancelada:  'bg-red-100 text-red-700',
}

// Valid transitions per role
function getValidTransitions(estado: string, isAdmin: boolean): string[] {
  const adminOnly = ['pagada', 'cancelada']
  const all: Record<string, string[]> = {
    pendiente:  ['despachada', 'cancelada'],
    despachada: ['entregada', 'cancelada'],
    entregada:  ['pagada', 'cancelada'],
  }
  const targets = all[estado] ?? []
  return isAdmin ? targets : targets.filter(t => !adminOnly.includes(t))
}

function newLinea(orden: number): LineaLocal {
  return {
    _key: `${Date.now()}-${orden}`,
    orden,
    producto_id: null,
    sku: null,
    descripcion: '',
    formato: null,
    cantidad: 1,
    valor_neto: 0,
    total_neto: 0,
    iva: 0,
    total: 0,
    margen: null,
  }
}

function calcLinea(l: LineaLocal): LineaLocal {
  const total_neto = l.cantidad * l.valor_neto
  const iva = Math.round(total_neto * 0.19 * 100) / 100
  const total = total_neto + iva
  return { ...l, total_neto, iva, total }
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

export default function NotaVentaDetalle() {
  const { id } = useParams<{ id?: string }>()
  const isNew = !id || id === 'nueva'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'subadmin'

  const [clienteId, setClienteId] = useState<number | ''>('')
  const [vendedorId, setVendedorId] = useState<number | ''>(currentUser?.id ?? '')
  const [contacto, setContacto] = useState('')
  const [correo, setCorreo] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [nota, setNota] = useState('')
  const [lineas, setLineas] = useState<LineaLocal[]>([newLinea(1)])
  const [empresaId, setEmpresaId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [showEstadoMenu, setShowEstadoMenu] = useState(false)

  const [autocompleteIdx, setAutocompleteIdx] = useState<number | null>(null)
  const [autocompleteResults, setAutocompleteResults] = useState<Producto[]>([])

  const { data: nv } = useQuery<NotaVenta>({
    queryKey: ['nota_venta', id],
    queryFn: () => api.get(`/api/nota_ventas/${id}`).then(r => r.data),
    enabled: !isNew,
  })

  useEffect(() => {
    if (nv) {
      setClienteId(nv.cliente_id)
      setVendedorId(nv.vendedor_id ?? '')
      setContacto(nv.contacto ?? '')
      setCorreo(nv.correo ?? '')
      setFecha(nv.fecha)
      setNota(nv.nota ?? '')
      setEmpresaId(nv.empresa_id ?? '')
      setLineas(
        (nv.lineas ?? []).map((l, i) => ({
          ...l,
          _key: `${l.id ?? i}`,
          producto_id: l.producto_id ?? null,
          sku: l.sku ?? null,
          formato: l.formato ?? null,
          margen: l.margen ?? null,
        }))
      )
    }
  }, [nv])

  const { data: clientes = [] } = useQuery<Cliente[]>({
    queryKey: ['clientes'],
    queryFn: () => api.get('/api/clientes/').then(r => r.data),
  })

  const { data: usuarios = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users').then(r => r.data),
    enabled: isAdmin,
  })

  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ['empresas'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
  })

  function handleClienteChange(cid: number | '') {
    setClienteId(cid)
    if (cid) {
      const c = clientes.find(cl => cl.id === cid)
      if (c) {
        if (!contacto) setContacto(c.nombre)
        if (!correo && c.email) setCorreo(c.email)
        if (c.empresa_id && !empresaId) setEmpresaId(c.empresa_id)
      }
    }
  }

  const fetchAutocomplete = useCallback(async (q: string) => {
    if (q.length < 2) { setAutocompleteResults([]); return }
    try {
      const res = await api.get<Producto[]>(`/api/productos/buscar?q=${encodeURIComponent(q)}`)
      setAutocompleteResults(res.data)
    } catch { setAutocompleteResults([]) }
  }, [])

  function handleDescripcionChange(idx: number, value: string) {
    setAutocompleteIdx(idx)
    fetchAutocomplete(value)
    updateLinea(idx, { descripcion: value })
  }

  function selectProducto(idx: number, producto: Producto) {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const updated: LineaLocal = {
        ...l,
        producto_id: producto.id,
        sku: producto.sku ?? null,
        descripcion: producto.nombre,
        formato: producto.formato ?? null,
        valor_neto: producto.precio_venta,
        margen: producto.precio_venta > 0
          ? (producto.precio_venta - producto.precio_costo) / producto.precio_venta
          : null,
      }
      return calcLinea(updated)
    }))
    setAutocompleteIdx(null)
    setAutocompleteResults([])
  }

  function updateLinea(idx: number, patch: Partial<LineaLocal>) {
    setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, ...patch })))
  }

  function addLinea() {
    setLineas(prev => [...prev, newLinea(prev.length + 1)])
  }

  function removeLinea(idx: number) {
    setLineas(prev => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, orden: i + 1 })))
  }

  const totalNeto = lineas.reduce((s, l) => s + l.total_neto, 0)
  const totalIva = lineas.reduce((s, l) => s + l.iva, 0)
  const total = lineas.reduce((s, l) => s + l.total, 0)

  async function handleSave() {
    if (!clienteId) { setError('Selecciona un cliente'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        cliente_id: clienteId,
        vendedor_id: vendedorId || currentUser?.id,
        contacto: contacto || null,
        correo: correo || null,
        fecha,
        nota: nota || null,
        empresa_id: empresaId || null,
      }
      const lineasPayload = lineas.map((l, i) => ({
        orden: i + 1,
        producto_id: l.producto_id,
        sku: l.sku,
        descripcion: l.descripcion,
        formato: l.formato,
        cantidad: l.cantidad,
        valor_neto: l.valor_neto,
      }))
      let nvId: number
      if (isNew) {
        const res = await api.post<NotaVenta>('/api/nota_ventas/', { ...payload, lineas: lineasPayload })
        nvId = res.data.id
      } else {
        await api.patch(`/api/nota_ventas/${id}`, payload)
        await api.put(`/api/nota_ventas/${id}/lineas`, lineasPayload)
        nvId = Number(id)
      }
      qc.invalidateQueries({ queryKey: ['nota_ventas'] })
      navigate(`/notas-venta/${nvId}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const estadoMut = useMutation({
    mutationFn: (nuevoEstado: string) =>
      api.patch(`/api/nota_ventas/${id}/estado`, { estado: nuevoEstado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nota_venta', id] })
      setShowEstadoMenu(false)
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Error al cambiar estado')
      setShowEstadoMenu(false)
    },
  })

  const emailMut = useMutation({
    mutationFn: () => api.post(`/api/nota_ventas/${id}/email`),
    onSuccess: () => {
      setEmailToast({ msg: 'Email enviado correctamente', ok: true })
      setTimeout(() => setEmailToast(null), 3500)
    },
    onError: (err: any) => {
      setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false })
      setTimeout(() => setEmailToast(null), 4000)
    },
  })

  const validTransitions = !isNew && nv ? getValidTransitions(nv.estado, isAdmin) : []

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/notas-venta')}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isNew ? 'Nueva nota de venta' : `NV-${String(nv?.numero ?? '').padStart(5, '0')}`}
          </h1>
          {!isNew && nv && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_COLORS[nv.estado] ?? ''}`}>
              {ESTADO_LABELS[nv.estado] ?? nv.estado}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && nv && validTransitions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowEstadoMenu(v => !v)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cambiar estado
              </button>
              {showEstadoMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[160px]">
                  {validTransitions.map(t => (
                    <button key={t} onClick={() => estadoMut.mutate(t)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg text-gray-700 dark:text-gray-300">
                      → {ESTADO_LABELS[t]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!isNew && (
            <>
              <button
                onClick={() => window.open(`/api/nota_ventas/${id}/pdf`, '_blank')}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <FileText size={15} />
                PDF
              </button>
              <button
                onClick={() => emailMut.mutate()}
                disabled={emailMut.isPending}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <Mail size={15} />
                {emailMut.isPending ? 'Enviando...' : 'Email'}
              </button>
            </>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Cotizacion reference badge */}
      {!isNew && nv?.cotizacion_id && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Originada desde cotización:</span>
          <button
            onClick={() => navigate(`/cotizaciones/${nv.cotizacion_id}`)}
            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            COT-{String(nv.cotizacion?.numero ?? nv.cotizacion_id).padStart(5, '0')}
            <ExternalLink size={11} />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Header form */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cliente *</label>
            <select value={clienteId} onChange={e => handleClienteChange(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Seleccionar cliente...</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}{c.rut ? ` · ${c.rut}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Empresa</label>
            <select value={empresaId} onChange={e => setEmpresaId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">— Sin empresa —</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Contacto</label>
            <input type="text" value={contacto} onChange={e => setContacto(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nombre del contacto" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Correo</label>
            <input type="email" value={correo} onChange={e => setCorreo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="email@ejemplo.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Encargado</label>
              <select value={vendedorId} onChange={e => setVendedorId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nota / Observaciones</label>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Notas internas o para el cliente..." />
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto mb-4">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 font-medium text-center w-10">Nº</th>
              <th className="px-3 py-3 font-medium w-24">SKU</th>
              <th className="px-3 py-3 font-medium">Descripción</th>
              <th className="px-3 py-3 font-medium w-28">Formato</th>
              <th className="px-3 py-3 font-medium text-right w-20">Cant.</th>
              <th className="px-3 py-3 font-medium text-right w-28">Valor Neto</th>
              <th className="px-3 py-3 font-medium text-right w-28">Total Neto</th>
              <th className="px-3 py-3 font-medium text-right w-24">IVA</th>
              <th className="px-3 py-3 font-medium text-right w-28">Total</th>
              <th className="px-3 py-3 font-medium text-right w-20">Margen</th>
              <th className="px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {lineas.map((linea, idx) => (
              <tr key={linea._key}>
                <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">{idx + 1}</td>
                <td className="px-3 py-2">
                  <input type="text" value={linea.sku ?? ''} onChange={e => updateLinea(idx, { sku: e.target.value || null })}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="SKU" />
                </td>
                <td className="px-3 py-2 relative">
                  <input type="text" value={linea.descripcion}
                    onChange={e => handleDescripcionChange(idx, e.target.value)}
                    onBlur={() => setTimeout(() => { setAutocompleteIdx(null); setAutocompleteResults([]) }, 200)}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Descripción..." />
                  {autocompleteIdx === idx && autocompleteResults.length > 0 && (
                    <div className="absolute z-20 left-3 right-3 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                      {autocompleteResults.slice(0, 8).map(p => (
                        <button key={p.id} type="button" onMouseDown={() => selectProducto(idx, p)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                          <div className="font-medium text-gray-900 dark:text-white">{p.nombre}</div>
                          <div className="text-gray-500">{p.sku ? `SKU: ${p.sku}` : ''}{p.formato ? ` · ${p.formato}` : ''} · $ {p.precio_venta.toLocaleString('es-CL')}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input type="text" value={linea.formato ?? ''} onChange={e => updateLinea(idx, { formato: e.target.value || null })}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Formato" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="1" value={linea.cantidad}
                    onChange={e => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="0" value={linea.valor_neto}
                    onChange={e => updateLinea(idx, { valor_neto: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right" />
                </td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 text-xs font-medium">{fmtMoney(linea.total_neto)}</td>
                <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 text-xs">{fmtMoney(linea.iva)}</td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-white text-xs font-medium">{fmtMoney(linea.total)}</td>
                <td className="px-3 py-2 text-right text-xs">
                  {linea.margen !== null
                    ? <span className={linea.margen >= 0.15 ? 'text-green-600 dark:text-green-400' : 'text-orange-500'}>{(linea.margen * 100).toFixed(1)}%</span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => removeLinea(idx)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" disabled={lineas.length === 1}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-start justify-between">
        <button onClick={addLinea}
          className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
          <Plus size={15} />
          Agregar línea
        </button>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 min-w-[260px]">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Total Neto</span><span className="font-medium">{fmtMoney(totalNeto)}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>IVA (19%)</span><span className="font-medium">{fmtMoney(totalIva)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5 font-bold text-gray-900 dark:text-white text-base">
              <span>Total</span><span>{fmtMoney(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {emailToast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${emailToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {emailToast.msg}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/NotaVentaDetalle.tsx
git commit -m "feat: add NotaVentaDetalle page"
```

---

### Task 11: CotizacionDetalle — Add "Crear NV" Button

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Add the mutation and button**

In `CotizacionDetalle.tsx`, add a mutation after the `emailMut` declaration (around line 232):

```typescript
const crearNvMut = useMutation({
  mutationFn: () => api.post<NotaVenta>(`/api/nota_ventas/from_cotizacion/${id}`),
  onSuccess: (res) => {
    qc.invalidateQueries({ queryKey: ['cotizacion', id] })
    navigate(`/notas-venta/${res.data.id}`)
  },
  onError: (err: any) => {
    setError(err?.response?.data?.detail || 'Error al crear nota de venta')
  },
})
```

Add `NotaVenta` to the existing type imports at the top:
```typescript
import type { Cotizacion, CotizacionLinea, Cliente, User, Producto, Empresa, NotaVenta } from '../types'
```

In the header buttons section (inside the `!isNew` block, after the Email button, around line 263), add:
```typescript
<button
  onClick={() => crearNvMut.mutate()}
  disabled={crearNvMut.isPending}
  className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors"
>
  {crearNvMut.isPending ? 'Creando...' : 'Crear NV'}
</button>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 3: Run full frontend test suite**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: all existing tests pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: add 'Crear NV' button to CotizacionDetalle"
```

---

## Final Verification

- [ ] Run all backend tests: `cd backend && python -m pytest -q`
- [ ] Run all frontend tests: `cd frontend && npx vitest run -q`
- [ ] TypeScript clean: `cd frontend && npx tsc --noEmit`
