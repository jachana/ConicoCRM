# Fase 4b-2: Factura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Factura module — DB model, API (10 endpoints), PDF/email, and React frontend — completing the Cotización → NV → Factura sales cycle.

**Architecture:** Factura mirrors NotaVenta in structure but with payment tracking fields and stricter role restrictions. NotaVenta gains a `factura` back-reference. Estado machine: `emitida → pagada → anulada` (or `emitida → anulada`). One Factura per NV maximum.

**Tech Stack:** FastAPI, SQLAlchemy 2.x mapped columns, Alembic, Pydantic v2, WeasyPrint, openpyxl, React + TypeScript + React Query + Tailwind

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/migrations/versions/a1b2c3d4e5f6_add_facturas.py` | Create | DB tables facturas + factura_lineas |
| `backend/app/models/factura.py` | Create | Factura + FacturaLinea SQLAlchemy models |
| `backend/app/models/nota_venta.py` | Modify | Add `factura` back-reference |
| `backend/app/models/__init__.py` | Modify | Import Factura, FacturaLinea |
| `backend/app/schemas/factura.py` | Create | All Factura Pydantic schemas |
| `backend/app/schemas/nota_venta.py` | Modify | Add `factura_id: int | None` to NotaVentaOut + NotaVentaListOut |
| `backend/app/api/facturas.py` | Create | 10 API endpoints |
| `backend/app/templates/factura.html` | Create | PDF template |
| `backend/app/services/pdf.py` | Modify | Add `generar_pdf_factura` |
| `backend/app/services/email.py` | Modify | Add `enviar_factura` |
| `backend/app/main.py` | Modify | Register facturas router |
| `backend/tests/conftest.py` | Modify | Import factura model in setup_test_db |
| `backend/tests/test_facturas.py` | Create | Backend test suite |
| `frontend/src/types/index.ts` | Modify | Add FacturaLinea, Factura interfaces |
| `frontend/src/router.tsx` | Modify | Add /facturas routes |
| `frontend/src/components/Sidebar.tsx` | Modify | Add Facturas nav item |
| `frontend/src/pages/Facturas.tsx` | Create | List page |
| `frontend/src/pages/Facturas.test.tsx` | Create | List page test |
| `frontend/src/pages/FacturaDetalle.tsx` | Create | Detail/edit page |
| `frontend/src/pages/NotaVentaDetalle.tsx` | Modify | Add "Generar Factura" button + factura badge |

---

## Task 1: DB Migration + Factura Models

**Files:**
- Create: `backend/migrations/versions/a1b2c3d4e5f6_add_facturas.py`
- Create: `backend/app/models/factura.py`
- Modify: `backend/app/models/nota_venta.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Write the migration**

Create `backend/migrations/versions/a1b2c3d4e5f6_add_facturas.py`:

```python
"""add facturas

Revision ID: a1b2c3d4e5f6
Revises: f6a3b0c1d2e5
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "f6a3b0c1d2e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "facturas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("cotizacion_id", sa.Integer(), sa.ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nv_id", sa.Integer(), sa.ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cliente_id", sa.Integer(), sa.ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vendedor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contacto", sa.String(255), nullable=True),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("fecha_vencimiento", sa.Date(), nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="emitida"),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("correo", sa.String(255), nullable=True),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_iva", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("fecha_pago", sa.Date(), nullable=True),
        sa.Column("monto_pagado", sa.Numeric(12, 2), nullable=True),
        sa.Column("metodo_pago", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_facturas_numero", "facturas", ["numero"], unique=True)

    op.create_table(
        "factura_lineas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factura_id", sa.Integer(), sa.ForeignKey("facturas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("producto_id", sa.Integer(), sa.ForeignKey("productos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("descripcion", sa.String(500), nullable=False),
        sa.Column("formato", sa.String(50), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("valor_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("iva", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("margen", sa.Numeric(10, 8), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("factura_lineas")
    op.drop_index("ix_facturas_numero", "facturas")
    op.drop_table("facturas")
```

- [ ] **Step 2: Create Factura + FacturaLinea models**

Create `backend/app/models/factura.py`:

```python
from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Factura(Base):
    __tablename__ = "facturas"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True
    )
    nv_id: Mapped[int | None] = mapped_column(
        ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True
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
    fecha_vencimiento: Mapped[date | None] = mapped_column(Date, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="emitida")
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    fecha_pago: Mapped[date | None] = mapped_column(Date, nullable=True)
    monto_pagado: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    metodo_pago: Mapped[str | None] = mapped_column(String(50), nullable=True)
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
    nv: Mapped["NotaVenta | None"] = relationship("NotaVenta", back_populates="factura")
    lineas: Mapped[list["FacturaLinea"]] = relationship(
        "FacturaLinea",
        back_populates="factura",
        cascade="all, delete-orphan",
        order_by="FacturaLinea.orden",
    )


class FacturaLinea(Base):
    __tablename__ = "factura_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    factura_id: Mapped[int] = mapped_column(ForeignKey("facturas.id", ondelete="CASCADE"))
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

    factura: Mapped["Factura"] = relationship("Factura", back_populates="lineas")
    producto: Mapped["Producto | None"] = relationship("Producto")
```

- [ ] **Step 3: Add `factura` back-reference to NotaVenta**

In `backend/app/models/nota_venta.py`, after the `lineas` relationship, add:

```python
    factura: Mapped["Factura | None"] = relationship(
        "Factura", back_populates="nv", uselist=False
    )
```

- [ ] **Step 4: Update models/__init__.py**

Add to `backend/app/models/__init__.py`:
```python
from app.models.factura import Factura, FacturaLinea  # noqa: F401
```

- [ ] **Step 5: Update conftest.py**

In `backend/tests/conftest.py`, inside `setup_test_db`, add after the nota_venta import:
```python
    import app.models.factura  # noqa: F401
```

- [ ] **Step 6: Run tests to ensure no regressions**

```bash
cd backend && python -m pytest tests/ -x -q
```
Expected: all 157 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/migrations/versions/a1b2c3d4e5f6_add_facturas.py \
        backend/app/models/factura.py \
        backend/app/models/nota_venta.py \
        backend/app/models/__init__.py \
        backend/tests/conftest.py
git commit -m "feat: add Factura and FacturaLinea models with migration"
```

---

## Task 2: Factura Schemas + Update NotaVentaOut

**Files:**
- Create: `backend/app/schemas/factura.py`
- Modify: `backend/app/schemas/nota_venta.py`

- [ ] **Step 1: Create schemas/factura.py**

Create `backend/app/schemas/factura.py`:

```python
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel
from app.schemas.empresa import EmpresaRef


class FacturaLineaCreate(BaseModel):
    orden: int
    producto_id: int | None = None
    sku: str | None = None
    descripcion: str
    formato: str | None = None
    cantidad: int = 1
    valor_neto: Decimal = Decimal("0")


class FacturaLineaOut(FacturaLineaCreate):
    id: int
    total_neto: Decimal
    iva: Decimal
    total: Decimal
    margen: Decimal | None = None
    model_config = {"from_attributes": True}


class FacturaCreate(BaseModel):
    cliente_id: int
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    fecha_vencimiento: date | None = None
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    lineas: list[FacturaLineaCreate] = []


class FacturaUpdate(BaseModel):
    cliente_id: int | None = None
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    fecha_vencimiento: date | None = None
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None


class FacturaEstadoCambio(BaseModel):
    estado: str
    fecha_pago: date | None = None
    monto_pagado: Decimal | None = None
    metodo_pago: str | None = None


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


class NVRef(BaseModel):
    id: int
    numero: int
    model_config = {"from_attributes": True}


class CotizacionRef(BaseModel):
    id: int
    numero: int
    model_config = {"from_attributes": True}


class FacturaOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    nv_id: int | None = None
    cliente_id: int
    vendedor_id: int | None = None
    empresa_id: int | None = None
    contacto: str | None = None
    fecha: date
    fecha_vencimiento: date | None = None
    estado: str
    nota: str | None = None
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    fecha_pago: date | None = None
    monto_pagado: Decimal | None = None
    metodo_pago: str | None = None
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    nv: NVRef | None = None
    cotizacion: CotizacionRef | None = None
    lineas: list[FacturaLineaOut] = []
    model_config = {"from_attributes": True}


class FacturaListOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    nv_id: int | None = None
    cliente_id: int
    vendedor_id: int | None = None
    empresa_id: int | None = None
    contacto: str | None = None
    fecha: date
    fecha_vencimiento: date | None = None
    estado: str
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    fecha_pago: date | None = None
    monto_pagado: Decimal | None = None
    metodo_pago: str | None = None
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Add factura_id to NotaVentaOut and NotaVentaListOut**

In `backend/app/schemas/nota_venta.py`, in `NotaVentaOut` after `cotizacion_id: int | None = None`, add:
```python
    factura_id: int | None = None
```

In `NotaVentaListOut` after `cotizacion_id: int | None = None`, add:
```python
    factura_id: int | None = None
```

Note: `factura_id` is a property computed from the relationship, not a DB column. In the API `_load_nv` function, we'll need to populate it from `nv.factura.id if nv.factura else None`. The schema will have `factura_id` as a plain field; the API layer will set it explicitly. Alternatively, we can add a `@property` to the NotaVenta model. The simplest approach: add a `factura_id` property to NotaVenta model that returns `self.factura.id if self.factura else None`, then Pydantic `from_attributes=True` picks it up.

In `backend/app/models/nota_venta.py`, add after the `factura` relationship:
```python
    @property
    def factura_id(self) -> int | None:
        return self.factura.id if self.factura else None
```

- [ ] **Step 3: Verify schemas import cleanly**

```bash
cd backend && python -c "from app.schemas.factura import FacturaOut; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/factura.py \
        backend/app/schemas/nota_venta.py \
        backend/app/models/nota_venta.py
git commit -m "feat: add Factura schemas and factura_id back-reference on NotaVentaOut"
```

---

## Task 3: Factura API

**Files:**
- Create: `backend/app/api/facturas.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the failing tests** (see Task 6 for full test file — write the test file first, then verify collection)

Actually, we'll write the API first and test in Task 6. (Tests require the API to exist to collect properly.) Skip to Step 2.

- [ ] **Step 2: Create the Factura API**

Create `backend/app/api/facturas.py`:

```python
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.api.deps import require_permission
from app.database import get_db
from app.models.factura import Factura, FacturaLinea
from app.models.nota_venta import NotaVenta
from app.models.producto import Producto
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.factura import (
    FacturaCreate,
    FacturaEstadoCambio,
    FacturaLineaCreate,
    FacturaListOut,
    FacturaOut,
    FacturaUpdate,
)
from app.services.email import EmailNotConfiguredError, enviar_factura
from app.services.pdf import generar_pdf_factura

router = APIRouter()

_TRANSITIONS: dict[tuple[str, str], str] = {
    ("emitida", "pagada"):  "admin",
    ("emitida", "anulada"): "admin",
    ("pagada",  "anulada"): "admin_only",
}

_METODOS_PAGO = {"efectivo", "transferencia", "cheque", "debito", "credito", "deposito"}


def _get_config_dict(db: Session) -> dict:
    return {r.key: r.value for r in db.query(SystemConfig).all()}


def _asignar_numero_factura(db: Session) -> int:
    config = (
        db.query(SystemConfig)
        .filter_by(key="factura_last_id")
        .with_for_update()
        .first()
    )
    if not config:
        config = SystemConfig(key="factura_last_id", value="0")
        db.add(config)
        db.flush()
    numero = int(config.value) + 1
    config.value = str(numero)
    return numero


def _calcular_lineas(db: Session, lineas_data: list[FacturaLineaCreate]) -> list[FacturaLinea]:
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
        lineas.append(FacturaLinea(
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


def _recalcular_totales(factura: Factura) -> None:
    factura.total_neto = sum(l.total_neto for l in factura.lineas)
    factura.total_iva = sum(l.iva for l in factura.lineas)
    factura.total = sum(l.total for l in factura.lineas)


def _load_factura(db: Session, factura_id: int) -> Factura:
    factura = db.query(Factura).options(
        joinedload(Factura.cliente),
        joinedload(Factura.vendedor),
        joinedload(Factura.empresa),
        joinedload(Factura.cotizacion),
        joinedload(Factura.nv),
        joinedload(Factura.lineas),
    ).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    return factura


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    facturas = (
        db.query(Factura)
        .options(joinedload(Factura.cliente), joinedload(Factura.vendedor))
        .order_by(Factura.numero.desc())
        .all()
    )
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Facturas"
    ws.append(["Nº FAC", "Fecha", "Vencimiento", "Cliente", "Contacto", "Total Neto", "IVA", "Total", "Estado", "Encargado"])
    for f in facturas:
        ws.append([
            f.numero,
            f.fecha.strftime("%d/%m/%Y") if f.fecha else "",
            f.fecha_vencimiento.strftime("%d/%m/%Y") if f.fecha_vencimiento else "",
            f.cliente.nombre if f.cliente else "",
            f.contacto or "",
            float(f.total_neto),
            float(f.total_iva),
            float(f.total),
            f.estado,
            f.vendedor.name if f.vendedor else "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=facturas.xlsx"},
    )


@router.get("/", response_model=list[FacturaListOut])
def listar_facturas(
    estado: str | None = Query(None),
    cliente_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    q = db.query(Factura).options(
        joinedload(Factura.cliente),
        joinedload(Factura.vendedor),
        joinedload(Factura.empresa),
    )
    if estado:
        q = q.filter(Factura.estado == estado)
    if cliente_id:
        q = q.filter(Factura.cliente_id == cliente_id)
    if fecha_desde:
        q = q.filter(Factura.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Factura.fecha <= fecha_hasta)
    return q.order_by(Factura.numero.desc()).all()


@router.post("/", response_model=FacturaOut, status_code=status.HTTP_201_CREATED)
def crear_factura(
    body: FacturaCreate,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede crear facturas")
    numero = _asignar_numero_factura(db)
    factura = Factura(
        numero=numero,
        cliente_id=body.cliente_id,
        vendedor_id=body.vendedor_id,
        contacto=body.contacto,
        fecha=body.fecha or date.today(),
        fecha_vencimiento=body.fecha_vencimiento,
        nota=body.nota,
        correo=body.correo,
        empresa_id=body.empresa_id,
    )
    db.add(factura)
    db.flush()
    factura.lineas = _calcular_lineas(db, body.lineas)
    for linea in factura.lineas:
        linea.factura_id = factura.id
    _recalcular_totales(factura)
    db.commit()
    return _load_factura(db, factura.id)


@router.post("/from_nv/{nv_id}", response_model=FacturaOut, status_code=status.HTTP_201_CREATED)
def crear_factura_desde_nv(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede crear facturas")

    nv = db.query(NotaVenta).options(
        joinedload(NotaVenta.lineas),
        joinedload(NotaVenta.factura),
    ).filter(NotaVenta.id == nv_id).first()
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    if nv.factura is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta nota de venta ya tiene una factura generada",
        )

    numero = _asignar_numero_factura(db)
    factura = Factura(
        numero=numero,
        nv_id=nv.id,
        cotizacion_id=nv.cotizacion_id,
        cliente_id=nv.cliente_id,
        empresa_id=nv.empresa_id,
        vendedor_id=nv.vendedor_id,
        contacto=nv.contacto,
        fecha=date.today(),
        nota=nv.nota,
        correo=nv.correo,
    )
    db.add(factura)
    db.flush()

    lineas = []
    for nl in nv.lineas:
        lineas.append(FacturaLinea(
            factura_id=factura.id,
            orden=nl.orden,
            producto_id=nl.producto_id,
            sku=nl.sku,
            descripcion=nl.descripcion,
            formato=nl.formato,
            cantidad=nl.cantidad,
            valor_neto=nl.valor_neto,
            total_neto=nl.total_neto,
            iva=nl.iva,
            total=nl.total,
            margen=nl.margen,
        ))
    factura.lineas = lineas
    _recalcular_totales(factura)
    db.commit()
    return _load_factura(db, factura.id)


@router.get("/{factura_id}", response_model=FacturaOut)
def obtener_factura(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    return _load_factura(db, factura_id)


@router.patch("/{factura_id}", response_model=FacturaOut)
def actualizar_factura(
    factura_id: int,
    body: FacturaUpdate,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede editar facturas")
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(factura, field, value)
    db.commit()
    return _load_factura(db, factura_id)


@router.put("/{factura_id}/lineas", response_model=FacturaOut)
def reemplazar_lineas(
    factura_id: int,
    lineas_data: list[FacturaLineaCreate],
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    current_user, db = perms
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede editar líneas de factura")
    factura = db.query(Factura).options(joinedload(Factura.lineas)).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    for linea in list(factura.lineas):
        db.delete(linea)
    db.flush()
    nuevas = _calcular_lineas(db, lineas_data)
    for linea in nuevas:
        linea.factura_id = factura_id
        db.add(linea)
    db.flush()
    factura.lineas = nuevas
    _recalcular_totales(factura)
    factura.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _load_factura(db, factura_id)


@router.patch("/{factura_id}/estado", response_model=FacturaOut)
def cambiar_estado(
    factura_id: int,
    body: FacturaEstadoCambio,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede cambiar estado")
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")

    transition = (factura.estado, body.estado)
    allowed = _TRANSITIONS.get(transition)
    if allowed is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Transición '{factura.estado}' → '{body.estado}' no permitida",
        )
    if allowed == "admin_only" and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede hacer esta transición")

    if body.estado == "pagada":
        if not body.fecha_pago or body.monto_pagado is None or not body.metodo_pago:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Para marcar como pagada se requiere fecha_pago, monto_pagado y metodo_pago",
            )
        if body.metodo_pago not in _METODOS_PAGO:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"metodo_pago inválido. Valores: {', '.join(sorted(_METODOS_PAGO))}",
            )
        factura.fecha_pago = body.fecha_pago
        factura.monto_pagado = body.monto_pagado
        factura.metodo_pago = body.metodo_pago

    factura.estado = body.estado
    db.commit()
    return _load_factura(db, factura_id)


@router.delete("/{factura_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_factura(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "delete"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede eliminar facturas")
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    if factura.estado != "emitida":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se pueden eliminar facturas en estado 'emitida'",
        )
    db.delete(factura)
    db.commit()


@router.get("/{factura_id}/pdf")
def generar_pdf(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    factura = _load_factura(db, factura_id)
    config = _get_config_dict(db)
    pdf_bytes = generar_pdf_factura(factura, config)
    cliente_nombre = factura.cliente.nombre if factura.cliente else "cliente"
    raw_filename = f"FAC - {factura.numero} {factura.fecha}.{factura.contacto or ''}. {cliente_nombre}.pdf"
    filename = re.sub(r'[^\w\s\-.]', '_', raw_filename)
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{factura_id}/email")
def enviar_email(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    factura = _load_factura(db, factura_id)
    config = _get_config_dict(db)
    try:
        pdf_bytes = generar_pdf_factura(factura, config)
        enviar_factura(factura, pdf_bytes)
    except EmailNotConfiguredError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error al enviar email: {e}")
    return {"detail": "Email enviado correctamente"}
```

- [ ] **Step 3: Register router in main.py**

In `backend/app/main.py`, add after the nota_ventas import line:
```python
from app.api import facturas
```

And after the nota_ventas router include:
```python
app.include_router(facturas.router, prefix="/api/facturas", tags=["facturas"])
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/facturas.py backend/app/main.py
git commit -m "feat: add Factura API with 10 endpoints"
```

---

## Task 4: PDF Template + Services

**Files:**
- Create: `backend/app/templates/factura.html`
- Modify: `backend/app/services/pdf.py`
- Modify: `backend/app/services/email.py`

- [ ] **Step 1: Create factura.html template**

Create `backend/app/templates/factura.html` (copy from nota_venta.html, change branding to blue/indigo for Factura):

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #333; padding: 20px; }
  @page { size: A4; margin: 15mm; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #4f46e5; padding-bottom: 16px; }
  .header-left { flex: 1; }
  .header-right { text-align: right; }
  .logo { max-height: 60px; max-width: 180px; margin-bottom: 8px; }
  .empresa-nombre { font-size: 14px; font-weight: bold; color: #1e3a5f; }
  .empresa-info { font-size: 10px; color: #666; margin-top: 2px; }
  .doc-numero { font-size: 22px; font-weight: bold; color: #4f46e5; }
  .doc-fecha { font-size: 11px; color: #555; margin-top: 4px; }

  .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 4px; }
  .cliente-block { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 12px; margin-bottom: 20px; }
  .cliente-nombre { font-size: 13px; font-weight: bold; color: #1e3a5f; margin-bottom: 4px; }
  .cliente-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px; color: #555; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead th { background: #4f46e5; color: white; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th.right { text-align: right; }
  tbody tr:nth-child(even) { background: #f8f9fb; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 10px; vertical-align: top; }
  tbody td.right { text-align: right; white-space: nowrap; }
  tbody td.center { text-align: center; }

  .totales { display: flex; justify-content: flex-end; margin-top: 8px; }
  .totales-tabla { width: 260px; }
  .totales-tabla td { padding: 4px 8px; font-size: 11px; }
  .totales-tabla td:last-child { text-align: right; font-weight: 600; }
  .totales-tabla tr:last-child td { border-top: 2px solid #4f46e5; font-size: 13px; font-weight: bold; color: #4f46e5; }

  .nota-block { margin-top: 20px; padding: 10px 12px; border-left: 3px solid #4f46e5; background: #eef2ff; font-size: 10px; color: #444; }
  .nota-label { font-weight: bold; color: #4f46e5; margin-bottom: 4px; }

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
    <div class="empresa-nombre">{{ config.empresa_nombre or 'Conico' }}</div>
    {% if config.empresa_rut %}<div class="empresa-info">RUT: {{ config.empresa_rut }}</div>{% endif %}
    {% if config.empresa_direccion %}<div class="empresa-info">{{ config.empresa_direccion }}</div>{% endif %}
    {% if config.empresa_telefono %}<div class="empresa-info">Tel: {{ config.empresa_telefono }}</div>{% endif %}
  </div>
  <div class="header-right">
    <div class="doc-numero">FACTURA FAC-{{ '%05d' % factura.numero }}</div>
    <div class="doc-fecha">Fecha: {{ factura.fecha.strftime('%d/%m/%Y') if factura.fecha else '' }}</div>
    {% if factura.fecha_vencimiento %}
    <div class="doc-fecha">Vencimiento: {{ factura.fecha_vencimiento.strftime('%d/%m/%Y') }}</div>
    {% endif %}
    <div class="doc-fecha" style="margin-top:6px; font-weight:bold;">Estado: {{ factura.estado | upper }}</div>
  </div>
</div>

<!-- CLIENTE -->
<div class="cliente-block">
  <div class="section-title">Cliente</div>
  <div class="cliente-nombre">{{ factura.cliente.nombre if factura.cliente else '' }}</div>
  <div class="cliente-grid">
    {% if factura.cliente and factura.cliente.rut %}<span>RUT: {{ factura.cliente.rut }}</span>{% endif %}
    {% if factura.contacto %}<span>Contacto: {{ factura.contacto }}</span>{% endif %}
    {% if factura.correo %}<span>Email: {{ factura.correo }}</span>{% endif %}
    {% if factura.empresa %}<span>Empresa: {{ factura.empresa.nombre }}</span>{% endif %}
  </div>
</div>

<!-- LINEAS -->
<table>
  <thead>
    <tr>
      <th style="width:40px">#</th>
      <th style="width:70px">SKU</th>
      <th>Descripción</th>
      <th style="width:60px">Formato</th>
      <th class="right" style="width:50px">Cant.</th>
      <th class="right" style="width:80px">P. Neto</th>
      <th class="right" style="width:90px">Total Neto</th>
    </tr>
  </thead>
  <tbody>
    {% for linea in factura.lineas %}
    <tr>
      <td class="center">{{ loop.index }}</td>
      <td>{{ linea.sku or '' }}</td>
      <td>{{ linea.descripcion }}</td>
      <td class="center">{{ linea.formato or '' }}</td>
      <td class="right">{{ linea.cantidad }}</td>
      <td class="right">$ {{ '{:,.0f}'.format(linea.valor_neto) }}</td>
      <td class="right">$ {{ '{:,.0f}'.format(linea.total_neto) }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>

<!-- TOTALES -->
<div class="totales">
  <table class="totales-tabla">
    <tr><td>Neto</td><td>$ {{ '{:,.0f}'.format(factura.total_neto) }}</td></tr>
    <tr><td>IVA (19%)</td><td>$ {{ '{:,.0f}'.format(factura.total_iva) }}</td></tr>
    <tr><td><strong>Total</strong></td><td>$ {{ '{:,.0f}'.format(factura.total) }}</td></tr>
  </table>
</div>

{% if factura.nota %}
<div class="nota-block">
  <div class="nota-label">Nota</div>
  {{ factura.nota }}
</div>
{% endif %}

<div class="footer">
  Documento generado por {{ config.empresa_nombre or 'Conico' }}
</div>
</body>
</html>
```

- [ ] **Step 2: Add generar_pdf_factura to services/pdf.py**

In `backend/app/services/pdf.py`, add:
```python
def generar_pdf_factura(factura, config: dict) -> bytes:
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    template = env.get_template("factura.html")
    html_str = template.render(factura=factura, config=config)
    return HTML(string=html_str, base_url=TEMPLATES_DIR).write_pdf()
```

- [ ] **Step 3: Add enviar_factura to services/email.py**

In `backend/app/services/email.py`, add:
```python
def enviar_factura(factura, pdf_bytes: bytes) -> None:
    cfg = _get_smtp_config()

    empresa_nombre = "Conico"
    to_addr = factura.correo or ""
    if not to_addr:
        raise ValueError("La factura no tiene correo de destino")

    numero_str = f"FAC-{factura.numero:05d}"
    fecha_str = factura.fecha.strftime("%d/%m/%Y") if factura.fecha else ""
    cliente_nombre = factura.cliente.nombre if factura.cliente else ""

    msg = MIMEMultipart()
    msg["From"] = cfg["from"]
    msg["To"] = to_addr
    msg["Subject"] = f"Factura {numero_str} — {empresa_nombre}"

    body = (
        f"Estimado/a {factura.contacto or cliente_nombre},\n\n"
        f"Adjuntamos la factura {numero_str} de fecha {fecha_str}.\n\n"
        f"Cliente: {cliente_nombre}\n"
        f"Total: $ {factura.total:,.0f}\n\n"
        f"Quedamos a su disposición para cualquier consulta.\n\n"
        f"Saludos,\n{empresa_nombre}"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    filename = f"{numero_str} {fecha_str}.{factura.contacto or cliente_nombre}.pdf"
    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(attachment)

    with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
        server.ehlo()
        server.starttls()
        server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from"], to_addr, msg.as_string())
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/templates/factura.html \
        backend/app/services/pdf.py \
        backend/app/services/email.py
git commit -m "feat: add Factura PDF template and email/pdf services"
```

---

## Task 5: Backend Tests

**Files:**
- Create: `backend/tests/test_facturas.py`

- [ ] **Step 1: Write test_facturas.py**

Create `backend/tests/test_facturas.py`:

```python
import pytest
from decimal import Decimal


def _create_cliente(client, admin_token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Cliente Factura", "rut": "11.111.111-1"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    return r.json()["id"]


def _create_factura(client, admin_token, cliente_id, lineas=None):
    if lineas is None:
        lineas = [{"orden": 0, "descripcion": "Item A", "cantidad": 2, "valor_neto": 1000}]
    r = client.post(
        "/api/facturas/",
        json={"cliente_id": cliente_id, "correo": "test@test.com", "lineas": lineas},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_nv(client, admin_token, cliente_id):
    r = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": cliente_id, "correo": "nv@test.com",
              "lineas": [{"orden": 0, "descripcion": "Prod", "cantidad": 1, "valor_neto": 500}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


# --- Auth ---

def test_sin_auth_lista_401(client):
    r = client.get("/api/facturas/")
    assert r.status_code == 401


def test_sin_auth_crear_401(client):
    r = client.post("/api/facturas/", json={})
    assert r.status_code == 401


# --- CRUD básico ---

def test_crear_factura_standalone(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    assert f["numero"] >= 1
    assert f["estado"] == "emitida"
    assert len(f["lineas"]) == 1
    assert float(f["total_neto"]) == pytest.approx(2000.0)
    assert float(f["total_iva"]) == pytest.approx(380.0)
    assert float(f["total"]) == pytest.approx(2380.0)


def test_numero_correlativo(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f1 = _create_factura(client, admin_token, cid)
    f2 = _create_factura(client, admin_token, cid)
    assert f2["numero"] == f1["numero"] + 1


def test_listar_facturas(client, admin_token):
    cid = _create_cliente(client, admin_token)
    _create_factura(client, admin_token, cid)
    r = client.get("/api/facturas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_obtener_factura(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.get(f"/api/facturas/{f['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["id"] == f["id"]


def test_obtener_factura_404(client, admin_token):
    r = client.get("/api/facturas/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


def test_actualizar_header(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}",
        json={"contacto": "Juan Test"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["contacto"] == "Juan Test"


# --- Desde NV ---

def test_crear_desde_nv_copia_lineas(client, admin_token):
    cid = _create_cliente(client, admin_token)
    nv = _create_nv(client, admin_token, cid)
    r = client.post(
        f"/api/facturas/from_nv/{nv['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nv_id"] == nv["id"]
    assert data["estado"] == "emitida"
    assert len(data["lineas"]) == 1


def test_crear_desde_nv_409_si_ya_tiene_factura(client, admin_token):
    cid = _create_cliente(client, admin_token)
    nv = _create_nv(client, admin_token, cid)
    client.post(
        f"/api/facturas/from_nv/{nv['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r = client.post(
        f"/api/facturas/from_nv/{nv['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 409


def test_nv_expone_factura_id_tras_crear_factura(client, admin_token):
    cid = _create_cliente(client, admin_token)
    nv = _create_nv(client, admin_token, cid)
    r_nv_antes = client.get(f"/api/nota_ventas/{nv['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r_nv_antes.json()["factura_id"] is None

    client.post(f"/api/facturas/from_nv/{nv['id']}", headers={"Authorization": f"Bearer {admin_token}"})

    r_nv_despues = client.get(f"/api/nota_ventas/{nv['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r_nv_despues.json()["factura_id"] is not None


# --- Permisos ---

def test_vendedor_no_puede_crear_factura(client, vendedor_token, admin_token):
    cid = _create_cliente(client, admin_token)
    r = client.post(
        "/api/facturas/",
        json={"cliente_id": cid, "lineas": []},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


def test_vendedor_puede_ver_facturas(client, vendedor_token, admin_token):
    cid = _create_cliente(client, admin_token)
    _create_factura(client, admin_token, cid)
    r = client.get("/api/facturas/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


# --- Líneas ---

def test_subadmin_no_puede_editar_lineas(client, subadmin_token, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.put(
        f"/api/facturas/{f['id']}/lineas",
        json=[{"orden": 0, "descripcion": "Nueva", "cantidad": 1, "valor_neto": 100}],
        headers={"Authorization": f"Bearer {subadmin_token}"},
    )
    assert r.status_code == 403


def test_admin_puede_editar_lineas(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.put(
        f"/api/facturas/{f['id']}/lineas",
        json=[{"orden": 0, "descripcion": "Nueva", "cantidad": 3, "valor_neto": 200}],
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["lineas"]) == 1
    assert float(data["total_neto"]) == pytest.approx(600.0)


# --- Estado ---

def test_transicion_invalida_422(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "pendiente"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_emitida_a_pagada_requiere_campos(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "pagada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_emitida_a_pagada_ok(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "pagada", "fecha_pago": "2026-04-18", "monto_pagado": 2380, "metodo_pago": "transferencia"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["estado"] == "pagada"
    assert data["fecha_pago"] == "2026-04-18"
    assert data["metodo_pago"] == "transferencia"


def test_emitida_a_anulada(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "anulada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["estado"] == "anulada"


def test_pagada_a_anulada_solo_admin(client, admin_token, subadmin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "pagada", "fecha_pago": "2026-04-18", "monto_pagado": 100, "metodo_pago": "efectivo"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r_sub = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "anulada"},
        headers={"Authorization": f"Bearer {subadmin_token}"},
    )
    assert r_sub.status_code == 403

    r_admin = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "anulada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r_admin.status_code == 200


def test_vendedor_no_puede_cambiar_estado(client, admin_token, vendedor_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "anulada"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


# --- Eliminar ---

def test_eliminar_emitida(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.delete(f"/api/facturas/{f['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 204


def test_eliminar_pagada_409(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "pagada", "fecha_pago": "2026-04-18", "monto_pagado": 100, "metodo_pago": "efectivo"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r = client.delete(f"/api/facturas/{f['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409


# --- PDF / Excel ---

def test_pdf_200(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.get(f"/api/facturas/{f['id']}/pdf", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"


def test_excel_export(client, admin_token):
    cid = _create_cliente(client, admin_token)
    _create_factura(client, admin_token, cid)
    r = client.get("/api/facturas/export/excel", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
```

- [ ] **Step 2: Run tests**

```bash
cd backend && python -m pytest tests/test_facturas.py -v
```
Expected: all tests pass.

- [ ] **Step 3: Run full suite**

```bash
cd backend && python -m pytest tests/ -q
```
Expected: all tests pass (157 + ~25 new = ~182 tests).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_facturas.py
git commit -m "test: add full Factura backend test suite"
```

---

## Task 6: Frontend Types + Router + Sidebar

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Add Factura types**

In `frontend/src/types/index.ts`, add after `NotaVenta`:

```typescript
export interface FacturaLinea {
  id: number;
  orden: number;
  producto_id: number | null;
  sku: string | null;
  descripcion: string;
  formato: string | null;
  cantidad: number;
  valor_neto: number;
  total_neto: number;
  iva: number;
  total: number;
  margen: number | null;
}

export interface Factura {
  id: number;
  numero: number;
  cotizacion_id: number | null;
  nv_id: number | null;
  cliente_id: number;
  vendedor_id: number | null;
  empresa_id: number | null;
  contacto: string | null;
  fecha: string;
  fecha_vencimiento: string | null;
  estado: string;
  nota: string | null;
  correo: string | null;
  total_neto: number;
  total_iva: number;
  total: number;
  fecha_pago: string | null;
  monto_pagado: number | null;
  metodo_pago: string | null;
  created_at: string;
  updated_at: string;
  cliente: { id: number; nombre: string; rut: string | null } | null;
  vendedor: { id: number; name: string; email: string } | null;
  empresa: { id: number; nombre: string } | null;
  nv: { id: number; numero: number } | null;
  cotizacion: { id: number; numero: number } | null;
  lineas: FacturaLinea[];
}
```

Also add `factura_id: number | null` to `NotaVenta` interface (after `cotizacion_id`):
```typescript
  factura_id: number | null;
```

- [ ] **Step 2: Add Factura routes to router.tsx**

In `frontend/src/router.tsx`, after the nota_ventas imports/routes, add:
```tsx
import Facturas from './pages/Facturas';
import FacturaDetalle from './pages/FacturaDetalle';
```

And in the routes array (after nota_ventas routes):
```tsx
{ path: '/facturas', element: <Facturas /> },
{ path: '/facturas/nueva', element: <FacturaDetalle /> },
{ path: '/facturas/:id', element: <FacturaDetalle /> },
```

- [ ] **Step 3: Add Facturas to Sidebar**

In `frontend/src/components/Sidebar.tsx`, after the Notas de Venta nav item, add a "Facturas" item.

Look for the pattern for existing items. The nav items use icons from lucide-react. Add:
```tsx
import { Receipt } from 'lucide-react';
```
(if not already imported)

And add the nav item after Notas de Venta:
```tsx
<NavItem to="/facturas" icon={<Receipt size={18} />} label="Facturas" />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts \
        frontend/src/router.tsx \
        frontend/src/components/Sidebar.tsx
git commit -m "feat: add Factura TypeScript types, routes, and sidebar navigation"
```

---

## Task 7: Facturas List Page + Test

**Files:**
- Create: `frontend/src/pages/Facturas.tsx`
- Create: `frontend/src/pages/Facturas.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/Facturas.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Facturas from './Facturas';

vi.mock('../api', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          numero: 1,
          fecha: '2026-04-18',
          fecha_vencimiento: '2026-05-18',
          estado: 'emitida',
          total: 2380,
          total_neto: 2000,
          total_iva: 380,
          cliente: { id: 1, nombre: 'Cliente Test', rut: '11.111.111-1' },
          vendedor: null,
          empresa: null,
          nv_id: null,
          cotizacion_id: null,
        },
      ],
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

test('renders facturas table with data', async () => {
  render(<Facturas />, { wrapper });
  await waitFor(() => expect(screen.getByText('FAC-00001')).toBeInTheDocument());
  expect(screen.getByText('Cliente Test')).toBeInTheDocument();
});

test('shows estado badge emitida', async () => {
  render(<Facturas />, { wrapper });
  await waitFor(() => expect(screen.getByText('emitida')).toBeInTheDocument());
});

test('shows nueva factura button', async () => {
  render(<Facturas />, { wrapper });
  expect(screen.getByText(/nueva factura/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/Facturas.test.tsx 2>&1 | head -20
```
Expected: FAIL — `Facturas` component not found.

- [ ] **Step 3: Create Facturas.tsx**

Create `frontend/src/pages/Facturas.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import { apiClient } from '../api';
import type { Factura } from '../types';

const ESTADO_COLORS: Record<string, string> = {
  emitida:  'bg-blue-100 text-blue-800',
  pagada:   'bg-green-100 text-green-800',
  anulada:  'bg-red-100 text-red-800',
};

export default function Facturas() {
  const [estado, setEstado] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const params: Record<string, string> = {};
  if (estado) params.estado = estado;
  if (fechaDesde) params.fecha_desde = fechaDesde;
  if (fechaHasta) params.fecha_hasta = fechaHasta;

  const { data: facturas = [], isLoading } = useQuery<Factura[]>({
    queryKey: ['facturas', params],
    queryFn: () =>
      apiClient.get('/api/facturas/', { params }).then((r) => r.data),
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
        <div className="flex gap-2">
          <a
            href="/api/facturas/export/excel"
            className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <Download size={16} /> Excel
          </a>
          <Link
            to="/facturas/nueva"
            className="flex items-center gap-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <Plus size={16} /> Nueva Factura
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="emitida">Emitida</option>
          <option value="pagada">Pagada</option>
          <option value="anulada">Anulada</option>
        </select>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          placeholder="Desde"
        />
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          placeholder="Hasta"
        />
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nº</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Vencimiento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/facturas/${f.id}`} className="text-indigo-600 hover:underline font-mono font-medium">
                      FAC-{String(f.numero).padStart(5, '0')}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {f.fecha ? new Date(f.fecha + 'T00:00:00').toLocaleDateString('es-CL') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {f.fecha_vencimiento
                      ? new Date(f.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-CL')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {f.cliente?.nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[f.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {f.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ${f.total.toLocaleString('es-CL')}
                  </td>
                </tr>
              ))}
              {facturas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No hay facturas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/Facturas.test.tsx
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Facturas.tsx frontend/src/pages/Facturas.test.tsx
git commit -m "feat: add Facturas list page with estado badges and filters"
```

---

## Task 8: FacturaDetalle Page

**Files:**
- Create: `frontend/src/pages/FacturaDetalle.tsx`

- [ ] **Step 1: Create FacturaDetalle.tsx**

Create `frontend/src/pages/FacturaDetalle.tsx`. This is a large page — model it on `NotaVentaDetalle.tsx` but with these differences:
- Header fields include `fecha_vencimiento`
- Lines table is read-only by default; Admin gets "Editar líneas" button
- Estado dropdown only shows valid transitions: emitida→pagada, emitida→anulada, pagada→anulada
- Payment panel visible when estado=pagada or when transitioning to pagada
- References panel shows NV origin + Cotización origin (read-only badges)
- Color scheme uses indigo instead of green

```tsx
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Mail, Trash2, Edit2, Save, X, ChevronDown } from 'lucide-react';
import { apiClient } from '../api';
import type { Factura, FacturaLinea } from '../types';

const ESTADO_COLORS: Record<string, string> = {
  emitida:  'bg-blue-100 text-blue-800 border-blue-200',
  pagada:   'bg-green-100 text-green-800 border-green-200',
  anulada:  'bg-red-100 text-red-800 border-red-200',
};

const NEXT_STATES: Record<string, string[]> = {
  emitida: ['pagada', 'anulada'],
  pagada:  ['anulada'],
  anulada: [],
};

interface LineaEdit {
  orden: number;
  descripcion: string;
  cantidad: number;
  valor_neto: number;
  sku: string;
  formato: string;
}

export default function FacturaDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = !id || id === 'nueva';

  const [editing, setEditing] = useState(isNew);
  const [editingLines, setEditingLines] = useState(false);
  const [showEstadoMenu, setShowEstadoMenu] = useState(false);
  const [showPagoModal, setShowPagoModal] = useState(false);

  const [header, setHeader] = useState({
    cliente_id: '',
    contacto: '',
    correo: '',
    fecha: new Date().toISOString().split('T')[0],
    fecha_vencimiento: '',
    nota: '',
    empresa_id: '',
    vendedor_id: '',
  });

  const [lines, setLines] = useState<LineaEdit[]>([
    { orden: 0, descripcion: '', cantidad: 1, valor_neto: 0, sku: '', formato: '' },
  ]);

  const [pagoForm, setPagoForm] = useState({
    fecha_pago: new Date().toISOString().split('T')[0],
    monto_pagado: '',
    metodo_pago: 'transferencia',
  });

  const { data: factura, isLoading } = useQuery<Factura>({
    queryKey: ['facturas', id],
    queryFn: () => apiClient.get(`/api/facturas/${id}`).then((r) => r.data),
    enabled: !isNew,
    onSuccess: (data) => {
      setHeader({
        cliente_id: String(data.cliente_id),
        contacto: data.contacto ?? '',
        correo: data.correo ?? '',
        fecha: data.fecha,
        fecha_vencimiento: data.fecha_vencimiento ?? '',
        nota: data.nota ?? '',
        empresa_id: data.empresa_id ? String(data.empresa_id) : '',
        vendedor_id: data.vendedor_id ? String(data.vendedor_id) : '',
      });
      setLines(
        data.lineas.map((l) => ({
          orden: l.orden,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          valor_neto: l.valor_neto,
          sku: l.sku ?? '',
          formato: l.formato ?? '',
        }))
      );
    },
  });

  const createMut = useMutation({
    mutationFn: (data: object) => apiClient.post('/api/facturas/', data),
    onSuccess: (res) => navigate(`/facturas/${res.data.id}`),
  });

  const updateMut = useMutation({
    mutationFn: (data: object) => apiClient.patch(`/api/facturas/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas', id] }); setEditing(false); },
  });

  const linesMut = useMutation({
    mutationFn: (data: object[]) => apiClient.put(`/api/facturas/${id}/lineas`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas', id] }); setEditingLines(false); },
  });

  const estadoMut = useMutation({
    mutationFn: (data: object) => apiClient.patch(`/api/facturas/${id}/estado`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facturas', id] });
      setShowEstadoMenu(false);
      setShowPagoModal(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/api/facturas/${id}`),
    onSuccess: () => navigate('/facturas'),
  });

  const pdfUrl = `/api/facturas/${id}/pdf`;

  const totalNeto = lines.reduce((s, l) => s + l.cantidad * l.valor_neto, 0);
  const totalIva = totalNeto * 0.19;
  const total = totalNeto + totalIva;

  const handleSave = () => {
    const body = {
      cliente_id: Number(header.cliente_id),
      contacto: header.contacto || null,
      correo: header.correo || null,
      fecha: header.fecha,
      fecha_vencimiento: header.fecha_vencimiento || null,
      nota: header.nota || null,
      empresa_id: header.empresa_id ? Number(header.empresa_id) : null,
      vendedor_id: header.vendedor_id ? Number(header.vendedor_id) : null,
      lineas: lines.map((l, i) => ({ ...l, orden: i })),
    };
    if (isNew) {
      createMut.mutate(body);
    } else {
      updateMut.mutate({ ...body, lineas: undefined });
    }
  };

  const handleSaveLines = () => {
    linesMut.mutate(lines.map((l, i) => ({ ...l, orden: i })));
  };

  const handleEstadoChange = (nuevoEstado: string) => {
    if (nuevoEstado === 'pagada') {
      setShowPagoModal(true);
      setShowEstadoMenu(false);
    } else {
      estadoMut.mutate({ estado: nuevoEstado });
    }
  };

  const handleConfirmarPago = () => {
    estadoMut.mutate({
      estado: 'pagada',
      fecha_pago: pagoForm.fecha_pago,
      monto_pagado: Number(pagoForm.monto_pagado),
      metodo_pago: pagoForm.metodo_pago,
    });
  };

  if (!isNew && isLoading) {
    return <div className="p-6 text-center text-gray-500">Cargando...</div>;
  }

  const nextStates = factura ? NEXT_STATES[factura.estado] ?? [] : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate('/facturas')} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm">
          <ArrowLeft size={16} /> Facturas
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-900 font-medium">
          {isNew ? 'Nueva Factura' : `FAC-${String(factura?.numero).padStart(5, '0')}`}
        </span>
      </div>

      {/* Header row */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? 'Nueva Factura' : `FAC-${String(factura?.numero).padStart(5, '0')}`}
          </h1>
          {/* References */}
          {factura?.nv && (
            <Link to={`/notas-venta/${factura.nv.id}`} className="inline-flex items-center gap-1 mt-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full hover:bg-green-200">
              NV-{String(factura.nv.numero).padStart(5, '0')}
            </Link>
          )}
          {factura?.cotizacion && (
            <Link to={`/cotizaciones/${factura.cotizacion.id}`} className="inline-flex items-center gap-1 mt-1 ml-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full hover:bg-gray-200">
              COT-{String(factura.cotizacion.numero).padStart(5, '0')}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Estado badge + dropdown */}
          {factura && (
            <div className="relative">
              <button
                onClick={() => nextStates.length > 0 && setShowEstadoMenu(!showEstadoMenu)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border ${ESTADO_COLORS[factura.estado]} ${nextStates.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {factura.estado}
                {nextStates.length > 0 && <ChevronDown size={14} />}
              </button>
              {showEstadoMenu && (
                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  {nextStates.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleEstadoChange(s)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      → {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          {!isNew && (
            <>
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
                <FileText size={15} /> PDF
              </a>
              <button
                onClick={() => apiClient.post(`/api/facturas/${id}/email`)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <Mail size={15} /> Email
              </button>
              {factura?.estado === 'emitida' && (
                <button
                  onClick={() => { if (confirm('¿Eliminar esta factura?')) deleteMut.mutate(); }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Payment info panel (when pagada) */}
      {factura?.estado === 'pagada' && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-sm">
          <div className="font-medium text-green-800 mb-1">Información de Pago</div>
          <div className="text-green-700 space-y-0.5">
            <div>Fecha: {factura.fecha_pago}</div>
            <div>Monto: ${factura.monto_pagado?.toLocaleString('es-CL')}</div>
            <div>Método: {factura.metodo_pago}</div>
          </div>
        </div>
      )}

      {/* Header form */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Información General</h2>
          {!isNew && !editing && (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
              <Edit2 size={14} /> Editar
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cliente ID</label>
            {editing ? (
              <input
                type="number"
                value={header.cliente_id}
                onChange={(e) => setHeader({ ...header, cliente_id: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            ) : (
              <div className="text-sm text-gray-900">{factura?.cliente?.nombre ?? '—'}</div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Contacto</label>
            {editing ? (
              <input
                value={header.contacto}
                onChange={(e) => setHeader({ ...header, contacto: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            ) : (
              <div className="text-sm text-gray-900">{factura?.contacto ?? '—'}</div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
            {editing ? (
              <input
                type="date"
                value={header.fecha}
                onChange={(e) => setHeader({ ...header, fecha: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            ) : (
              <div className="text-sm text-gray-900">{factura?.fecha ?? '—'}</div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fecha Vencimiento</label>
            {editing ? (
              <input
                type="date"
                value={header.fecha_vencimiento}
                onChange={(e) => setHeader({ ...header, fecha_vencimiento: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            ) : (
              <div className="text-sm text-gray-900">{factura?.fecha_vencimiento ?? '—'}</div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Correo</label>
            {editing ? (
              <input
                type="email"
                value={header.correo}
                onChange={(e) => setHeader({ ...header, correo: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            ) : (
              <div className="text-sm text-gray-900">{factura?.correo ?? '—'}</div>
            )}
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Nota</label>
            {editing ? (
              <textarea
                value={header.nota}
                onChange={(e) => setHeader({ ...header, nota: e.target.value })}
                rows={2}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
            ) : (
              <div className="text-sm text-gray-900">{factura?.nota ?? '—'}</div>
            )}
          </div>
        </div>

        {editing && (
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
              <X size={14} /> Cancelar
            </button>
            <button onClick={handleSave} className="flex items-center gap-1 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
              <Save size={14} /> Guardar
            </button>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Líneas</h2>
          {!isNew && !editingLines && (
            <button onClick={() => setEditingLines(true)} className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
              <Edit2 size={14} /> Editar líneas
            </button>
          )}
        </div>

        <table className="w-full text-sm">
          <thead className="border-b border-gray-200">
            <tr>
              <th className="text-left py-2 text-xs font-medium text-gray-500">Descripción</th>
              <th className="text-left py-2 text-xs font-medium text-gray-500 w-16">SKU</th>
              <th className="text-right py-2 text-xs font-medium text-gray-500 w-16">Cant.</th>
              <th className="text-right py-2 text-xs font-medium text-gray-500 w-24">P. Neto</th>
              <th className="text-right py-2 text-xs font-medium text-gray-500 w-24">Total Neto</th>
              {editingLines && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {(editingLines || isNew ? lines : factura?.lineas ?? []).map((linea, idx) => (
              <tr key={idx} className="border-b border-gray-50">
                <td className="py-2">
                  {(editingLines || isNew) ? (
                    <input
                      value={(linea as LineaEdit).descripcion}
                      onChange={(e) => {
                        const nl = [...lines];
                        nl[idx] = { ...nl[idx], descripcion: e.target.value };
                        setLines(nl);
                      }}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                    />
                  ) : (
                    (linea as FacturaLinea).descripcion
                  )}
                </td>
                <td className="py-2">
                  {(editingLines || isNew) ? (
                    <input
                      value={(linea as LineaEdit).sku}
                      onChange={(e) => {
                        const nl = [...lines];
                        nl[idx] = { ...nl[idx], sku: e.target.value };
                        setLines(nl);
                      }}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                    />
                  ) : (
                    (linea as FacturaLinea).sku ?? ''
                  )}
                </td>
                <td className="py-2 text-right">
                  {(editingLines || isNew) ? (
                    <input
                      type="number"
                      value={(linea as LineaEdit).cantidad}
                      onChange={(e) => {
                        const nl = [...lines];
                        nl[idx] = { ...nl[idx], cantidad: Number(e.target.value) };
                        setLines(nl);
                      }}
                      className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-right"
                    />
                  ) : (
                    (linea as FacturaLinea).cantidad
                  )}
                </td>
                <td className="py-2 text-right">
                  {(editingLines || isNew) ? (
                    <input
                      type="number"
                      value={(linea as LineaEdit).valor_neto}
                      onChange={(e) => {
                        const nl = [...lines];
                        nl[idx] = { ...nl[idx], valor_neto: Number(e.target.value) };
                        setLines(nl);
                      }}
                      className="w-24 border border-gray-300 rounded px-2 py-1 text-xs text-right"
                    />
                  ) : (
                    `$${(linea as FacturaLinea).valor_neto.toLocaleString('es-CL')}`
                  )}
                </td>
                <td className="py-2 text-right text-gray-700">
                  {(editingLines || isNew)
                    ? `$${((linea as LineaEdit).cantidad * (linea as LineaEdit).valor_neto).toLocaleString('es-CL')}`
                    : `$${(linea as FacturaLinea).total_neto.toLocaleString('es-CL')}`}
                </td>
                {(editingLines || isNew) && (
                  <td className="py-2 pl-2">
                    <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                      <X size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {(editingLines || isNew) && (
          <button
            onClick={() => setLines([...lines, { orden: lines.length, descripcion: '', cantidad: 1, valor_neto: 0, sku: '', formato: '' }])}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-800"
          >
            + Agregar línea
          </button>
        )}

        {editingLines && (
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setEditingLines(false)} className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
              <X size={14} /> Cancelar
            </button>
            <button onClick={handleSaveLines} className="flex items-center gap-1 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
              <Save size={14} /> Guardar líneas
            </button>
          </div>
        )}

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-60 text-sm space-y-1">
            <div className="flex justify-between text-gray-600">
              <span>Neto</span>
              <span>${(editingLines || isNew ? totalNeto : (factura?.total_neto ?? 0)).toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>IVA (19%)</span>
              <span>${(editingLines || isNew ? totalIva : (factura?.total_iva ?? 0)).toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between font-bold text-indigo-700 border-t pt-1">
              <span>Total</span>
              <span>${(editingLines || isNew ? total : (factura?.total ?? 0)).toLocaleString('es-CL')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save button for new */}
      {isNew && (
        <div className="flex justify-end">
          <button onClick={handleSave} className="flex items-center gap-1 px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            <Save size={16} /> Crear Factura
          </button>
        </div>
      )}

      {/* Pago Modal */}
      {showPagoModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h3 className="font-semibold text-gray-900 mb-4">Registrar Pago</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fecha de Pago</label>
                <input type="date" value={pagoForm.fecha_pago} onChange={(e) => setPagoForm({ ...pagoForm, fecha_pago: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Monto Pagado</label>
                <input type="number" value={pagoForm.monto_pagado} onChange={(e) => setPagoForm({ ...pagoForm, monto_pagado: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Método de Pago</label>
                <select value={pagoForm.metodo_pago} onChange={(e) => setPagoForm({ ...pagoForm, metodo_pago: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                  <option value="debito">Débito</option>
                  <option value="credito">Crédito</option>
                  <option value="deposito">Depósito</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowPagoModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleConfirmarPago} className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700">
                Confirmar Pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors related to Factura files.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/FacturaDetalle.tsx
git commit -m "feat: add FacturaDetalle page with estado transitions and payment modal"
```

---

## Task 9: NotaVentaDetalle — "Generar Factura" Button

**Files:**
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

- [ ] **Step 1: Add "Generar Factura" button and factura badge**

In `frontend/src/pages/NotaVentaDetalle.tsx`:

1. Add a `genFacturaMut` mutation:
```tsx
const genFacturaMut = useMutation({
  mutationFn: () => apiClient.post(`/api/facturas/from_nv/${id}`),
  onSuccess: (res) => navigate(`/facturas/${res.data.id}`),
});
```

2. In the action buttons area, add (after the Email button, visible only when `nv.factura_id` is null):
```tsx
{nv?.factura_id == null && (
  <button
    onClick={() => genFacturaMut.mutate()}
    disabled={genFacturaMut.isPending}
    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
  >
    <Receipt size={15} /> Generar Factura
  </button>
)}
{nv?.factura_id != null && (
  <Link
    to={`/facturas/${nv.factura_id}`}
    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200"
  >
    <Receipt size={15} /> Ver Factura
  </Link>
)}
```

3. Import `Receipt` from `lucide-react` and `Link` from `react-router-dom` if not already imported.

4. Import `navigate` from `useNavigate` if not already present.

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```
Expected: all tests pass (including existing NotaVentas tests).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/NotaVentaDetalle.tsx
git commit -m "feat: add Generar Factura button to NotaVentaDetalle"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -q
```
Expected: all tests pass.

- [ ] **Step 2: Run full frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -15
```
Expected: all tests pass.

- [ ] **Step 3: TypeScript clean**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
```
Verify only expected files. Then commit if anything remains:
```bash
git commit -m "feat: complete Fase 4b-2 Factura implementation"
```

- [ ] **Step 5: Update PROGRESS.md**

Mark Fase 4b-2 (Factura) as complete in `docs/PROGRESS.md` or equivalent tracking file.
