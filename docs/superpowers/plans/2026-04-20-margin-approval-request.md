# Margin Approval Request — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow vendors to propose margin changes on a cotización and submit them as a single approval request; admins approve/deny in the existing Aprobaciones page; on approval the cotización lines update automatically.

**Architecture:** New `aprobaciones_margen` table + API mirrors the existing credit approval pattern. Frontend adds a `propuestas` state in `CotizacionDetalle` for local vendor proposals; banners replace the polling loop for both credit and margin flows. `Aprobaciones.tsx` merges both approval types in one list.

**Tech Stack:** Python/FastAPI/SQLAlchemy (backend), React/TypeScript/TanStack Query (frontend), SQLite (tests), Alembic migrations.

---

## File Map

**Create:**
- `backend/app/models/aprobacion_margen.py`
- `backend/app/schemas/aprobacion_margen.py`
- `backend/app/api/aprobaciones_margen.py`
- `backend/migrations/versions/m3n4o5p6q7r8_add_aprobaciones_margen.py`
- `backend/tests/test_aprobaciones_margen.py`

**Modify:**
- `backend/app/models/__init__.py` — register new model
- `backend/app/main.py` — register new router
- `backend/app/api/aprobaciones.py` — add `cotizacion_id` filter to GET list
- `backend/tests/conftest.py` — import new model in `setup_test_db`
- `frontend/src/components/CreditWarningModal.tsx` — remove polling, add `onSubmitted` callback
- `frontend/src/pages/CotizacionDetalle.tsx` — banners, vendor proposal state, restrict price input, margin modal
- `frontend/src/pages/Aprobaciones.tsx` — merge both approval types, tipo badge, margin detail rows

---

## Task 1: Backend model + migration

**Files:**
- Create: `backend/app/models/aprobacion_margen.py`
- Create: `backend/migrations/versions/m3n4o5p6q7r8_add_aprobaciones_margen.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Create model file**

```python
# backend/app/models/aprobacion_margen.py
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class AprobacionMargen(Base):
    __tablename__ = "aprobaciones_margen"

    id: Mapped[int] = mapped_column(primary_key=True)
    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="CASCADE"), nullable=True
    )
    vendedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    lineas_propuestas: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
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

    vendedor: Mapped["User | None"] = relationship("User", foreign_keys=[vendedor_id])
    cotizacion: Mapped["Cotizacion | None"] = relationship("Cotizacion", foreign_keys=[cotizacion_id])
```

- [ ] **Step 2: Create migration**

```python
# backend/migrations/versions/m3n4o5p6q7r8_add_aprobaciones_margen.py
"""add aprobaciones_margen table

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-04-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "m3n4o5p6q7r8"
down_revision: Union[str, None] = "l2m3n4o5p6q7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "aprobaciones_margen",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("cotizacion_id", sa.Integer,
                  sa.ForeignKey("cotizaciones.id", ondelete="CASCADE"), nullable=True),
        sa.Column("vendedor_id", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nota", sa.Text, nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("lineas_propuestas", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("aprobaciones_margen")
```

- [ ] **Step 3: Register model in `__init__.py`**

In `backend/app/models/__init__.py`, add after the last line:

```python
from app.models.aprobacion_margen import AprobacionMargen  # noqa: F401
```

- [ ] **Step 4: Run migration**

```bash
cd backend && alembic upgrade head
```

Expected: `Running upgrade l2m3n4o5p6q7 -> m3n4o5p6q7r8, add aprobaciones_margen table`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/aprobacion_margen.py backend/migrations/versions/m3n4o5p6q7r8_add_aprobaciones_margen.py backend/app/models/__init__.py
git commit -m "feat: add AprobacionMargen model and migration"
```

---

## Task 2: Backend schemas

**Files:**
- Create: `backend/app/schemas/aprobacion_margen.py`

- [ ] **Step 1: Create schema file**

```python
# backend/app/schemas/aprobacion_margen.py
import json
from datetime import datetime
from pydantic import BaseModel, field_validator


class LineaPropuestaItem(BaseModel):
    linea_id: int
    descripcion: str
    valor_neto_actual: float
    margen_actual: float | None
    valor_neto_propuesto: float
    margen_propuesto: float


class AprobacionMargenCreate(BaseModel):
    cotizacion_id: int
    nota: str | None = None
    lineas_propuestas: list[LineaPropuestaItem]


class AprobacionMargenAccion(BaseModel):
    accion: str  # "aprobar" | "denegar"


class VendedorMinOut(BaseModel):
    id: int
    name: str
    email: str
    model_config = {"from_attributes": True}


class AprobacionMargenOut(BaseModel):
    id: int
    cotizacion_id: int | None = None
    vendedor_id: int | None = None
    nota: str | None = None
    estado: str
    lineas_propuestas: list[LineaPropuestaItem]
    created_at: datetime
    vendedor: VendedorMinOut | None = None
    model_config = {"from_attributes": True}

    @field_validator("lineas_propuestas", mode="before")
    @classmethod
    def parse_lineas(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/aprobacion_margen.py
git commit -m "feat: add AprobacionMargen schemas"
```

---

## Task 3: Backend API + registration

**Files:**
- Create: `backend/app/api/aprobaciones_margen.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/aprobaciones.py` (add `cotizacion_id` filter)

- [ ] **Step 1: Create API file**

```python
# backend/app/api/aprobaciones_margen.py
import json
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.database import get_db
from app.models.aprobacion_margen import AprobacionMargen
from app.models.cotizacion import Cotizacion
from app.models.user import User
from app.schemas.aprobacion_margen import (
    AprobacionMargenAccion,
    AprobacionMargenCreate,
    AprobacionMargenOut,
)

router = APIRouter()


def _load(db: Session, aprobacion_id: int) -> AprobacionMargen:
    a = (
        db.query(AprobacionMargen)
        .options(joinedload(AprobacionMargen.vendedor))
        .filter(AprobacionMargen.id == aprobacion_id)
        .first()
    )
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    return a


@router.post("/", response_model=AprobacionMargenOut, status_code=status.HTTP_201_CREATED)
def crear_solicitud_margen(
    body: AprobacionMargenCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cot = db.query(Cotizacion).filter(Cotizacion.id == body.cotizacion_id).first()
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if not body.lineas_propuestas:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Debe incluir al menos una línea propuesta")

    # "Latest wins": auto-deny any existing pending request for this cotizacion
    existing = (
        db.query(AprobacionMargen)
        .filter(
            AprobacionMargen.cotizacion_id == body.cotizacion_id,
            AprobacionMargen.estado == "pendiente",
        )
        .first()
    )
    if existing:
        existing.estado = "denegada"
        db.flush()

    aprobacion = AprobacionMargen(
        cotizacion_id=body.cotizacion_id,
        vendedor_id=current_user.id,
        nota=body.nota,
        estado="pendiente",
        lineas_propuestas=json.dumps([lp.model_dump() for lp in body.lineas_propuestas]),
    )
    db.add(aprobacion)
    db.commit()
    return _load(db, aprobacion.id)


@router.get("/", response_model=list[AprobacionMargenOut])
def listar_solicitudes_margen(
    estado: str | None = Query(None),
    cotizacion_id: int | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(AprobacionMargen).options(joinedload(AprobacionMargen.vendedor))
    if current_user.role not in ("admin", "subadmin"):
        q = q.filter(AprobacionMargen.vendedor_id == current_user.id)
    if estado:
        q = q.filter(AprobacionMargen.estado == estado)
    if cotizacion_id:
        q = q.filter(AprobacionMargen.cotizacion_id == cotizacion_id)
    return q.order_by(AprobacionMargen.created_at.desc()).all()


@router.get("/{aprobacion_id}", response_model=AprobacionMargenOut)
def obtener_solicitud_margen(
    aprobacion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = _load(db, aprobacion_id)
    if current_user.role not in ("admin", "subadmin") and a.vendedor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return a


@router.patch("/{aprobacion_id}", response_model=AprobacionMargenOut)
def accionar_solicitud_margen(
    aprobacion_id: int,
    body: AprobacionMargenAccion,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Solo administradores pueden aprobar")
    a = _load(db, aprobacion_id)
    if a.estado != "pendiente":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="La solicitud ya fue procesada")

    if body.accion == "denegar":
        a.estado = "denegada"
        db.commit()
        return _load(db, a.id)

    if body.accion != "aprobar":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Acción inválida")

    cot = (
        db.query(Cotizacion)
        .options(joinedload(Cotizacion.lineas))
        .filter(Cotizacion.id == a.cotizacion_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")

    lineas_data = json.loads(a.lineas_propuestas)
    lineas_by_id = {l.id: l for l in cot.lineas}

    for item in lineas_data:
        linea = lineas_by_id.get(item["linea_id"])
        if not linea:
            continue  # line deleted after request — skip gracefully
        nuevo_vn = Decimal(str(item["valor_neto_propuesto"]))
        linea.valor_neto = nuevo_vn
        linea.total_neto = linea.cantidad * nuevo_vn
        linea.iva = round(linea.total_neto * Decimal("0.19"), 2)
        linea.total = linea.total_neto + linea.iva
        if linea.producto_id and nuevo_vn > 0:
            from app.models.producto import Producto
            prod = db.get(Producto, linea.producto_id)
            if prod:
                linea.margen = (nuevo_vn - prod.precio_costo) / nuevo_vn

    cot.total_neto = sum(l.total_neto for l in cot.lineas)
    cot.total_iva = sum(l.iva for l in cot.lineas)
    cot.total = sum(l.total for l in cot.lineas)

    a.estado = "aprobada"
    db.commit()
    return _load(db, a.id)
```

- [ ] **Step 2: Register router in `backend/app/main.py`**

Add after the existing aprobaciones import and include_router lines:

```python
# after: from app.api import aprobaciones
from app.api import aprobaciones_margen
```

```python
# after: app.include_router(aprobaciones.router, ...)
app.include_router(aprobaciones_margen.router, prefix="/api/aprobaciones_margen", tags=["aprobaciones_margen"])
```

- [ ] **Step 3: Add `cotizacion_id` filter to existing credit aprobaciones list**

In `backend/app/api/aprobaciones.py`, change the `listar_aprobaciones` function signature and query:

```python
# Change:
@router.get("/", response_model=list[AprobacionOut])
def listar_aprobaciones(
    estado: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(AprobacionCredito).options(
        joinedload(AprobacionCredito.vendedor),
        joinedload(AprobacionCredito.empresa),
    )
    if current_user.role not in ("admin", "subadmin"):
        q = q.filter(AprobacionCredito.vendedor_id == current_user.id)
    if estado:
        q = q.filter(AprobacionCredito.estado == estado)
    return q.order_by(AprobacionCredito.created_at.desc()).all()

# To:
@router.get("/", response_model=list[AprobacionOut])
def listar_aprobaciones(
    estado: str | None = Query(None),
    cotizacion_id: int | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(AprobacionCredito).options(
        joinedload(AprobacionCredito.vendedor),
        joinedload(AprobacionCredito.empresa),
    )
    if current_user.role not in ("admin", "subadmin"):
        q = q.filter(AprobacionCredito.vendedor_id == current_user.id)
    if estado:
        q = q.filter(AprobacionCredito.estado == estado)
    if cotizacion_id:
        q = q.filter(AprobacionCredito.cotizacion_id == cotizacion_id)
    return q.order_by(AprobacionCredito.created_at.desc()).all()
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/aprobaciones_margen.py backend/app/main.py backend/app/api/aprobaciones.py
git commit -m "feat: add aprobaciones_margen API, register router, add cotizacion_id filter to credit list"
```

---

## Task 4: Backend tests

**Files:**
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_aprobaciones_margen.py`

- [ ] **Step 1: Add model import to `conftest.py` `setup_test_db` fixture**

In `backend/tests/conftest.py`, in the `setup_test_db` fixture, add after the existing imports:

```python
    import app.models.aprobacion_credito  # noqa: F401
    import app.models.aprobacion_margen  # noqa: F401
```

- [ ] **Step 2: Write failing tests**

```python
# backend/tests/test_aprobaciones_margen.py
import pytest
from decimal import Decimal


def _make_cotizacion(db, vendedor_id: int) -> int:
    from app.models.cotizacion import Cotizacion, CotizacionLinea
    cot = Cotizacion(
        numero=1,
        cliente_id=None,
        vendedor_id=vendedor_id,
        fecha="2026-04-20",
        estado="abierta",
        total_neto=Decimal("45000"),
        total_iva=Decimal("8550"),
        total=Decimal("53550"),
    )
    db.add(cot)
    db.flush()
    linea = CotizacionLinea(
        cotizacion_id=cot.id,
        orden=1,
        descripcion="Aceite Motor",
        cantidad=1,
        valor_neto=Decimal("45000"),
        total_neto=Decimal("45000"),
        iva=Decimal("8550"),
        total=Decimal("53550"),
        margen=Decimal("0.02"),
    )
    db.add(linea)
    db.commit()
    db.refresh(cot)
    return cot.id, linea.id


def _payload(cotizacion_id: int, linea_id: int):
    return {
        "cotizacion_id": cotizacion_id,
        "nota": "cliente muy importante",
        "lineas_propuestas": [
            {
                "linea_id": linea_id,
                "descripcion": "Aceite Motor",
                "valor_neto_actual": 45000,
                "margen_actual": 0.02,
                "valor_neto_propuesto": 40000,
                "margen_propuesto": 0.10,
            }
        ],
    }


def test_vendor_can_create_solicitud(client, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    resp = client.post(
        "/api/aprobaciones_margen/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["estado"] == "pendiente"
    assert data["cotizacion_id"] == cot_id
    assert len(data["lineas_propuestas"]) == 1


def test_latest_wins_auto_denies_previous(client, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    headers = {"Authorization": f"Bearer {vendedor_token}"}
    resp1 = client.post("/api/aprobaciones_margen/", json=_payload(cot_id, linea_id), headers=headers)
    first_id = resp1.json()["id"]
    resp2 = client.post("/api/aprobaciones_margen/", json=_payload(cot_id, linea_id), headers=headers)
    assert resp2.status_code == 201
    # First request should be auto-denied
    check = client.get(f"/api/aprobaciones_margen/{first_id}", headers=headers)
    assert check.json()["estado"] == "denegada"


def test_admin_can_deny(client, admin_token, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    create = client.post(
        "/api/aprobaciones_margen/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    apro_id = create.json()["id"]
    resp = client.patch(
        f"/api/aprobaciones_margen/{apro_id}",
        json={"accion": "denegar"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["estado"] == "denegada"


def test_admin_can_approve_and_lineas_update(client, admin_token, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    create = client.post(
        "/api/aprobaciones_margen/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    apro_id = create.json()["id"]
    resp = client.patch(
        f"/api/aprobaciones_margen/{apro_id}",
        json={"accion": "aprobar"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["estado"] == "aprobada"
    # Cotizacion linea should have updated valor_neto
    from app.models.cotizacion import CotizacionLinea
    linea = db.get(CotizacionLinea, linea_id)
    db.refresh(linea)
    assert linea.valor_neto == Decimal("40000")


def test_vendor_cannot_approve(client, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    create = client.post(
        "/api/aprobaciones_margen/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    apro_id = create.json()["id"]
    resp = client.patch(
        f"/api/aprobaciones_margen/{apro_id}",
        json={"accion": "aprobar"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_cotizacion_id_filter(client, admin_token, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    client.post(
        "/api/aprobaciones_margen/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    resp = client.get(
        f"/api/aprobaciones_margen/?cotizacion_id={cot_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["cotizacion_id"] == cot_id
```

- [ ] **Step 3: Run tests and confirm they fail**

```bash
cd backend && python -m pytest tests/test_aprobaciones_margen.py -v
```

Expected: Several failures like `404` and import errors (router not found yet — but Task 3 should already be done at this point, so expect test failures related to DB schema or logic).

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd backend && python -m pytest tests/test_aprobaciones_margen.py -v
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_aprobaciones_margen.py backend/tests/conftest.py
git commit -m "test: add aprobaciones_margen tests"
```

---

## Task 5: Frontend — simplify CreditWarningModal (remove polling)

**Files:**
- Modify: `frontend/src/components/CreditWarningModal.tsx`

- [ ] **Step 1: Rewrite CreditWarningModal**

Replace the entire file contents:

```tsx
// frontend/src/components/CreditWarningModal.tsx
import { useState } from 'react'
import { api } from '../lib/api'

export interface CreditoInfo {
  limite_credito: number
  credito_usado: number
  credito_disponible: number
}

export interface AprobacionPayload {
  empresa_id: number
  total: number
  origen: 'cotizacion' | 'directa'
  cotizacion_id?: number
  nv_payload?: object
}

interface CreditWarningModalProps {
  mode: 'warning' | 'request'
  empresaNombre: string
  credito: CreditoInfo
  saleTotal: number
  onConfirm?: () => void
  aprobacionPayload?: AprobacionPayload
  onSubmitted?: () => void
  onCancel: () => void
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

export default function CreditWarningModal({
  mode,
  empresaNombre,
  credito,
  saleTotal,
  onConfirm,
  aprobacionPayload,
  onSubmitted,
  onCancel,
}: CreditWarningModalProps) {
  const [nota, setNota] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleSolicitar() {
    if (!aprobacionPayload) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await api.post('/api/aprobaciones/', { ...aprobacionPayload, nota: nota || null })
      onSubmitted?.()
      onCancel()
    } catch (err: any) {
      setSubmitError(err?.response?.data?.detail || 'Error al enviar solicitud')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 text-xl font-bold">
            !
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">Límite de crédito excedido</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{empresaNombre}</p>
          </div>
        </div>

        <div className="space-y-2 mb-5 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Límite de crédito</span>
            <span className="font-medium text-gray-900 dark:text-white">{fmtMoney(credito.limite_credito)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Crédito usado</span>
            <span className="font-medium text-red-600 dark:text-red-400">{fmtMoney(credito.credito_usado)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Disponible</span>
            <span className="font-medium text-gray-900 dark:text-white">{fmtMoney(credito.credito_disponible)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
            <span className="text-gray-600 dark:text-gray-400">Esta venta</span>
            <span className="font-semibold text-gray-900 dark:text-white">{fmtMoney(saleTotal)}</span>
          </div>
        </div>

        {mode === 'warning' && (
          <div className="flex gap-2 justify-end">
            <button onClick={onCancel}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancelar
            </button>
            <button onClick={onConfirm}
              className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium">
              Guardar de todas formas
            </button>
          </div>
        )}

        {mode === 'request' && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Se enviará una solicitud de aprobación al administrador. Podrás revisar el estado desde esta cotización.
            </p>
            <textarea
              placeholder="Nota opcional para el administrador..."
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
            />
            {submitError && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{submitError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={onCancel}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSolicitar} disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium">
                {submitting ? 'Enviando...' : 'Solicitar Aprobación'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/CreditWarningModal.tsx
git commit -m "feat: remove polling from CreditWarningModal, add onSubmitted callback"
```

---

## Task 6: Frontend — CotizacionDetalle credit aprobacion banner

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

This task: (a) updates `creditModal` state to use `onSubmitted` instead of `onApproved`/`onDenied`, (b) adds a query for the latest credit aprobacion per cotización, (c) renders the credit banner.

- [ ] **Step 1: Remove `onApproved`/`onDenied` from creditModal state type and update `checkCredit`**

Find the `creditModal` state declaration (around line 78) and replace it:

```tsx
// Replace:
const [creditModal, setCreditModal] = useState<{
  mode: 'warning' | 'request'
  credito: CreditoInfo
  onConfirm?: () => void
  aprobacionPayload?: AprobacionPayload
  onApproved?: (nvId: number) => void
  onDenied?: () => void
} | null>(null)

// With:
const [creditModal, setCreditModal] = useState<{
  mode: 'warning' | 'request'
  credito: CreditoInfo
  onConfirm?: () => void
  aprobacionPayload?: AprobacionPayload
} | null>(null)
```

Find the `checkCredit` function's `mode === 'request'` branch (around line 263) and replace:

```tsx
// Replace:
setCreditModal({
  mode: 'request',
  credito,
  aprobacionPayload,
  onApproved: (nvId) => { setCreditModal(null); navigate(`/notas-venta/${nvId}`) },
  onDenied: () => { setCreditModal(null); setError('Solicitud denegada por el administrador.') },
})

// With:
setCreditModal({
  mode: 'request',
  credito,
  aprobacionPayload,
})
```

- [ ] **Step 2: Add credit aprobacion query after existing queries**

After the `cotizacion` useQuery block (around line 91), add:

```tsx
const { data: aprobacionCredito, refetch: refetchAprobacionCredito } = useQuery<{
  id: number; estado: string; nv_id: number | null
} | null>({
  queryKey: ['aprobacion-credito', id],
  queryFn: () =>
    api.get(`/api/aprobaciones/?cotizacion_id=${id}`).then(r => r.data[0] ?? null),
  enabled: !isNew,
})
```

- [ ] **Step 3: Update CreditWarningModal usage in JSX to use `onSubmitted`**

Find the `<CreditWarningModal` usage (near the bottom of the JSX, around line 590) and replace:

```tsx
// Replace:
<CreditWarningModal
  mode={creditModal.mode}
  empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
  credito={creditModal.credito}
  saleTotal={total}
  onConfirm={creditModal.onConfirm}
  aprobacionPayload={creditModal.aprobacionPayload}
  onApproved={creditModal.onApproved}
  onDenied={creditModal.onDenied}
  onCancel={() => setCreditModal(null)}
/>

// With:
<CreditWarningModal
  mode={creditModal.mode}
  empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
  credito={creditModal.credito}
  saleTotal={total}
  onConfirm={creditModal.onConfirm}
  aprobacionPayload={creditModal.aprobacionPayload}
  onSubmitted={() => { setCreditModal(null); refetchAprobacionCredito() }}
  onCancel={() => setCreditModal(null)}
/>
```

- [ ] **Step 4: Add credit banner to JSX**

After the `{error && ...}` banner (around line 397), add:

```tsx
{!isNew && aprobacionCredito && (
  <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-3 ${
    aprobacionCredito.estado === 'pendiente'
      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
      : aprobacionCredito.estado === 'aprobada'
      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
      : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
  }`}>
    <span>
      {aprobacionCredito.estado === 'pendiente' && 'Solicitud de crédito enviada — pendiente de aprobación'}
      {aprobacionCredito.estado === 'aprobada' && 'Solicitud de crédito aprobada'}
      {aprobacionCredito.estado === 'denegada' && 'Solicitud de crédito denegada'}
    </span>
    {aprobacionCredito.estado === 'aprobada' && aprobacionCredito.nv_id && (
      <button
        onClick={() => navigate(`/notas-venta/${aprobacionCredito.nv_id}`)}
        className="text-xs font-medium underline whitespace-nowrap"
      >
        Ver nota de venta →
      </button>
    )}
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx frontend/src/components/CreditWarningModal.tsx
git commit -m "feat: replace credit approval polling with banner in CotizacionDetalle"
```

---

## Task 7: Frontend — restrict `valor_neto` input to admins

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Wrap `valor_neto` input in admin check**

Find the precio unitario cell (around line 521–538). Currently it shows an `<input>` unconditionally. Change to:

```tsx
// Replace the td containing the RotateCcw + valor_neto input:
<td className="px-3 py-2">
  <div className="flex items-center justify-end gap-1">
    {linea.producto_id && (
      <button type="button" onClick={() => handleResetPrecio(idx)}
        className="p-0.5 text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
        title="Restablecer precio">
        <RotateCcw size={10} />
      </button>
    )}
    {isAdmin ? (
      <input type="number" min="0" value={linea.valor_neto}
        onChange={e => handleValorNetoChange(idx, e.target.value)}
        className="w-28 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right" />
    ) : (
      <span className="text-sm font-medium text-gray-900 dark:text-white">
        {fmtMoney(linea.valor_neto)}
      </span>
    )}
  </div>
</td>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: restrict valor_neto input to admins in cotizacion table"
```

---

## Task 8: Frontend — vendor proposal state + margin inputs

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Add `propuestas` state**

After the `const [marginOverrideIdx, ...]` line (around line 76), add:

```tsx
const [propuestas, setPropuestas] = useState<Record<number, { margenPropuesto: number; valorNetoPropuesto: number }>>({})
```

- [ ] **Step 2: Add `handleMargenPropuesta` function**

After `handleResetPrecio` (around line 242), add:

```tsx
function handleMargenPropuesta(lineaId: number, pctStr: string) {
  const linea = lineas.find(l => l.id === lineaId)
  if (!linea) return
  const pct = parseFloat(pctStr)
  if (isNaN(pct)) {
    setPropuestas(prev => { const next = { ...prev }; delete next[lineaId]; return next })
    return
  }
  const newMargen = pct / 100
  if (newMargen >= 1 || newMargen < 0) return
  const costo = linea._costo != null
    ? linea._costo
    : (linea.margen != null && Number(linea.margen) < 1 && Number(linea.valor_neto) > 0
        ? Number(linea.valor_neto) * (1 - Number(linea.margen))
        : null)
  if (costo == null || costo <= 0) return
  const valorNetoPropuesto = Math.round(costo / (1 - newMargen))
  setPropuestas(prev => ({ ...prev, [lineaId]: { margenPropuesto: newMargen, valorNetoPropuesto } }))
}
```

- [ ] **Step 3: Update margen column for non-admins to show proposal input**

Find the margen `<td>` (the one with the `isAdmin ? <input> : <span>` block, around line 541). Replace the entire `<td>`:

```tsx
<td className="px-3 py-2">
  <div className="flex items-center justify-end gap-0.5">
    {isAdmin ? (
      <input
        type="number" step="0.1"
        value={linea.margen !== null ? linea.margen * 100 : ''}
        onChange={e => handleMargenChange(idx, e.target.value)}
        placeholder="—"
        className={`w-16 px-1.5 py-1.5 text-xs border rounded-lg text-right focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 ${linea.margen !== null && Number(linea.margen) < 0.15 ? 'border-orange-400 dark:border-orange-500 text-orange-500' : 'border-gray-200 dark:border-gray-700 text-green-600 dark:text-green-400'}`}
      />
    ) : linea.id != null ? (
      <input
        type="number" step="0.1"
        value={linea.id != null && propuestas[linea.id] != null
          ? (propuestas[linea.id].margenPropuesto * 100).toFixed(1)
          : (linea.margen !== null ? (Number(linea.margen) * 100).toFixed(1) : '')}
        onChange={e => linea.id != null && handleMargenPropuesta(linea.id, e.target.value)}
        placeholder="—"
        className={`w-16 px-1.5 py-1.5 text-xs border-2 border-dashed rounded-lg text-right focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white dark:bg-gray-800 ${
          linea.id != null && propuestas[linea.id] != null
            ? 'border-blue-400 text-blue-600 dark:text-blue-400'
            : linea.margen !== null && Number(linea.margen) < 0.15
            ? 'border-orange-300 text-orange-500'
            : 'border-gray-300 dark:border-gray-600 text-green-600 dark:text-green-400'
        }`}
        title="Proponer cambio de margen"
      />
    ) : (
      <span className={`text-xs ${linea.margen !== null && Number(linea.margen) < 0.15 ? 'text-orange-500' : 'text-green-600 dark:text-green-400'}`}>
        {linea.margen !== null ? `${(Number(linea.margen) * 100).toFixed(1)}` : '—'}
      </span>
    )}
    <span className="text-xs text-gray-400">%</span>
  </div>
</td>
```

- [ ] **Step 4: Show proposed price in the valor_neto column for non-admins**

Find the non-admin span in the precio cell from Task 7 and extend it to show the proposed price:

```tsx
// Replace the non-admin span:
<span className="text-sm font-medium text-gray-900 dark:text-white">
  {fmtMoney(linea.valor_neto)}
</span>

// With:
<div className="text-right">
  <span className="text-sm font-medium text-gray-900 dark:text-white">
    {fmtMoney(linea.valor_neto)}
  </span>
  {linea.id != null && propuestas[linea.id] != null && (
    <div className="text-xs text-blue-600 dark:text-blue-400">
      → {fmtMoney(propuestas[linea.id].valorNetoPropuesto)}
    </div>
  )}
</div>
```

- [ ] **Step 5: Clear propuestas when cotizacion reloads**

In the `useEffect` that calls `setLineas` (around line 93), add after `setLineas(...)`:

```tsx
setPropuestas({})
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: add vendor proposal state and margin inputs in cotizacion"
```

---

## Task 9: Frontend — margin request modal + banner

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Add modal state variables**

After the `propuestas` state (from Task 8), add:

```tsx
const [solicitudMargenModal, setSolicitudMargenModal] = useState(false)
const [notaSolicitud, setNotaSolicitud] = useState('')
const [solicitudMargenError, setSolicitudMargenError] = useState('')
const [enviandoSolicitud, setEnviandoSolicitud] = useState(false)
```

- [ ] **Step 2: Add margin aprobacion query**

After the `aprobacionCredito` query (from Task 6), add:

```tsx
const { data: aprobacionMargen, refetch: refetchAprobacionMargen } = useQuery<{
  id: number; estado: string; lineas_propuestas: unknown[]
} | null>({
  queryKey: ['aprobacion-margen', id],
  queryFn: () =>
    api.get(`/api/aprobaciones_margen/?cotizacion_id=${id}`).then(r => r.data[0] ?? null),
  enabled: !isNew,
})
```

- [ ] **Step 3: Add `handleEnviarSolicitudMargen` function**

After `handleMargenPropuesta`, add:

```tsx
async function handleEnviarSolicitudMargen() {
  if (!id || Object.keys(propuestas).length === 0) return
  setEnviandoSolicitud(true)
  setSolicitudMargenError('')
  try {
    const lineasPropuestas = lineas
      .filter(l => l.id != null && propuestas[l.id!] != null)
      .map(l => ({
        linea_id: l.id!,
        descripcion: l.descripcion,
        valor_neto_actual: Number(l.valor_neto),
        margen_actual: l.margen != null ? Number(l.margen) : null,
        valor_neto_propuesto: propuestas[l.id!].valorNetoPropuesto,
        margen_propuesto: propuestas[l.id!].margenPropuesto,
      }))
    await api.post('/api/aprobaciones_margen/', {
      cotizacion_id: Number(id),
      nota: notaSolicitud || null,
      lineas_propuestas: lineasPropuestas,
    })
    setSolicitudMargenModal(false)
    setNotaSolicitud('')
    setPropuestas({})
    refetchAprobacionMargen()
  } catch (err: any) {
    setSolicitudMargenError(err?.response?.data?.detail || 'Error al enviar solicitud')
  } finally {
    setEnviandoSolicitud(false)
  }
}
```

- [ ] **Step 4: Add "Solicitar ajuste" button in header**

Find the header button group (around line 360, the `<div className="flex items-center gap-2">`). Add before the Guardar button:

```tsx
{!isAdmin && !isNew && Object.keys(propuestas).length > 0 && (
  <button
    type="button"
    onClick={() => setSolicitudMargenModal(true)}
    className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors"
  >
    Solicitar ajuste de márgenes
  </button>
)}
```

- [ ] **Step 5: Add margin aprobacion banner**

After the credit banner block (from Task 6), add:

```tsx
{!isNew && aprobacionMargen && (
  <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
    aprobacionMargen.estado === 'pendiente'
      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
      : aprobacionMargen.estado === 'aprobada'
      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
      : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
  }`}>
    {aprobacionMargen.estado === 'pendiente' && 'Solicitud de ajuste de márgenes enviada — pendiente de aprobación'}
    {aprobacionMargen.estado === 'aprobada' && 'Solicitud aprobada — los precios han sido actualizados'}
    {aprobacionMargen.estado === 'denegada' && 'Solicitud de ajuste de márgenes denegada'}
  </div>
)}
```

- [ ] **Step 6: Add margin request modal JSX**

Find the `{creditModal && ...}` block and add directly after it:

```tsx
{solicitudMargenModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-lg mx-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Solicitar ajuste de márgenes
      </h2>
      <table className="w-full text-xs mb-4">
        <thead>
          <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <th className="pb-2 text-left font-medium">Producto</th>
            <th className="pb-2 text-right font-medium">Precio actual</th>
            <th className="pb-2 text-right font-medium">Precio propuesto</th>
            <th className="pb-2 text-right font-medium">Margen prop.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {lineas
            .filter(l => l.id != null && propuestas[l.id!] != null)
            .map(l => (
              <tr key={l._key}>
                <td className="py-2 text-gray-900 dark:text-white truncate max-w-[180px]">{l.descripcion}</td>
                <td className="py-2 text-right text-gray-600 dark:text-gray-400">{fmtMoney(l.valor_neto)}</td>
                <td className="py-2 text-right text-blue-600 dark:text-blue-400 font-medium">
                  {fmtMoney(propuestas[l.id!].valorNetoPropuesto)}
                </td>
                <td className="py-2 text-right text-blue-600 dark:text-blue-400 font-medium">
                  {(propuestas[l.id!].margenPropuesto * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <textarea
        placeholder="Nota para el administrador (opcional)..."
        value={notaSolicitud}
        onChange={e => setNotaSolicitud(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
      />
      {solicitudMargenError && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-2">{solicitudMargenError}</p>
      )}
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => { setSolicitudMargenModal(false); setSolicitudMargenError('') }}
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleEnviarSolicitudMargen}
          disabled={enviandoSolicitud}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
        >
          {enviandoSolicitud ? 'Enviando...' : 'Enviar solicitud'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: add margin request modal and banner in CotizacionDetalle"
```

---

## Task 10: Frontend — Aprobaciones page (tipo badge + margin rows)

**Files:**
- Modify: `frontend/src/pages/Aprobaciones.tsx`

- [ ] **Step 1: Rewrite Aprobaciones.tsx**

Replace the entire file:

```tsx
// frontend/src/pages/Aprobaciones.tsx
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'

interface CreditAprobacion {
  tipo: 'credito'
  id: number
  vendedor: { id: number; name: string; email: string } | null
  empresa: { id: number; nombre: string } | null
  total: number
  nota: string | null
  estado: string
  cotizacion_id: number | null
  nv_id: number | null
  created_at: string
}

interface LineaPropuesta {
  linea_id: number
  descripcion: string
  valor_neto_actual: number
  margen_actual: number | null
  valor_neto_propuesto: number
  margen_propuesto: number
}

interface MargenAprobacion {
  tipo: 'margen'
  id: number
  vendedor: { id: number; name: string; email: string } | null
  cotizacion_id: number | null
  nota: string | null
  estado: string
  lineas_propuestas: LineaPropuesta[]
  created_at: string
}

type AnyAprobacion = CreditAprobacion | MargenAprobacion

const fmtMoney = (n: number) => `$ ${Math.round(n).toLocaleString('es-CL')}`
const fmtFecha = (s: string) => s.split('T')[0]
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`

export default function Aprobaciones() {
  const user = useAuthStore(s => s.user)
  const isAdminUser = !!user && (user.role === 'admin' || user.role === 'subadmin')
  const queryClient = useQueryClient()
  const [actingKey, setActingKey] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: creditos = [], isLoading: loadingCredito } = useQuery<CreditAprobacion[]>({
    queryKey: ['aprobaciones-credito-pendientes'],
    queryFn: () =>
      api.get('/api/aprobaciones/?estado=pendiente').then(r =>
        r.data.map((a: any) => ({ ...a, tipo: 'credito' }))
      ),
    enabled: isAdminUser,
  })

  const { data: margenes = [], isLoading: loadingMargen } = useQuery<MargenAprobacion[]>({
    queryKey: ['aprobaciones-margen-pendientes'],
    queryFn: () =>
      api.get('/api/aprobaciones_margen/?estado=pendiente').then(r =>
        r.data.map((a: any) => ({ ...a, tipo: 'margen' }))
      ),
    enabled: isAdminUser,
  })

  const isLoading = loadingCredito || loadingMargen

  const all: AnyAprobacion[] = [...creditos, ...margenes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const creditMutation = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'aprobar' | 'denegar' }) =>
      api.patch(`/api/aprobaciones/${id}`, { accion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aprobaciones-credito-pendientes'] })
      setActingKey(null)
    },
    onError: () => setActingKey(null),
  })

  const margenMutation = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'aprobar' | 'denegar' }) =>
      api.patch(`/api/aprobaciones_margen/${id}`, { accion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aprobaciones-margen-pendientes'] })
      setActingKey(null)
    },
    onError: () => setActingKey(null),
  })

  function handleAccion(a: AnyAprobacion, accion: 'aprobar' | 'denegar') {
    const key = `${a.tipo}-${a.id}`
    setActingKey(key)
    if (a.tipo === 'credito') creditMutation.mutate({ id: a.id, accion })
    else margenMutation.mutate({ id: a.id, accion })
  }

  if (!isAdminUser) return <Navigate to="/" replace />

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Aprobaciones</h1>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Cargando...</div>
        ) : all.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No hay solicitudes pendientes.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Vendedor</th>
                <th className="px-4 py-3 text-left">Empresa / Cotización</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Nota</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {all.map(a => {
                const key = `${a.tipo}-${a.id}`
                const isExpanded = expanded === key
                const acting = actingKey === key
                return (
                  <>
                    <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          a.tipo === 'credito'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        }`}>
                          {a.tipo === 'credito' ? 'Crédito' : 'Margen'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {a.vendedor?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {a.tipo === 'credito'
                          ? (a.empresa?.nombre ?? '—')
                          : `COT-${String(a.cotizacion_id ?? '').padStart(5, '0')}`}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-medium">
                        {a.tipo === 'credito' ? fmtMoney(a.total) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {a.nota ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {fmtFecha(a.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {a.tipo === 'margen' && (
                            <button
                              onClick={() => setExpanded(isExpanded ? null : key)}
                              className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                              title="Ver detalle"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          )}
                          <button
                            onClick={() => handleAccion(a, 'aprobar')}
                            disabled={acting}
                            className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => handleAccion(a, 'denegar')}
                            disabled={acting}
                            className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                          >
                            Denegar
                          </button>
                        </div>
                      </td>
                    </tr>
                    {a.tipo === 'margen' && isExpanded && (
                      <tr key={`${key}-detail`} className="bg-blue-50/50 dark:bg-blue-900/10">
                        <td colSpan={7} className="px-6 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                <th className="pb-1.5 text-left font-medium">Producto</th>
                                <th className="pb-1.5 text-right font-medium">Precio actual</th>
                                <th className="pb-1.5 text-right font-medium">Margen actual</th>
                                <th className="pb-1.5 text-right font-medium">Precio propuesto</th>
                                <th className="pb-1.5 text-right font-medium">Margen prop.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {a.lineas_propuestas.map((lp, i) => (
                                <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                                  <td className="py-1.5 text-gray-700 dark:text-gray-300">{lp.descripcion}</td>
                                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{fmtMoney(lp.valor_neto_actual)}</td>
                                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                                    {lp.margen_actual != null ? fmtPct(lp.margen_actual) : '—'}
                                  </td>
                                  <td className="py-1.5 text-right font-medium text-blue-700 dark:text-blue-300">{fmtMoney(lp.valor_neto_propuesto)}</td>
                                  <td className="py-1.5 text-right font-medium text-blue-700 dark:text-blue-300">{fmtPct(lp.margen_propuesto)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Aprobaciones.tsx
git commit -m "feat: merge credit and margin approvals in Aprobaciones page with tipo badge and detail rows"
```

---

## Task 11: Final push

- [ ] **Step 1: Run backend tests**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```

Expected: All tests pass.

- [ ] **Step 2: Push**

```bash
git push
```
