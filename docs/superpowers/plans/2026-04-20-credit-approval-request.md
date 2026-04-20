# Credit Approval Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin-password-in-modal block with an async approval request flow: vendor requests approval, admin approves/denies from a dedicated tab, NV auto-creates on approval.

**Architecture:** New `AprobacionCredito` DB model stores request state and NV payload. New `/api/aprobaciones/` router handles CRUD. Frontend modal transitions to a polling waiting state. New admin-only Aprobaciones page for approve/deny actions.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, React, TypeScript, Axios, TanStack Query, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/api/auth.py` | Modify | Remove verify-admin endpoint |
| `backend/app/schemas/auth.py` | Modify | Remove VerifyAdminRequest class |
| `backend/app/models/aprobacion_credito.py` | **Create** | AprobacionCredito ORM model |
| `backend/migrations/versions/l2m3n4o5p6q7_aprobaciones_credito.py` | **Create** | DB migration |
| `backend/app/schemas/aprobacion.py` | **Create** | Pydantic schemas for aprobaciones |
| `backend/app/api/aprobaciones.py` | **Create** | CRUD router for approval requests |
| `backend/app/main.py` | Modify | Register aprobaciones router |
| `frontend/src/components/CreditWarningModal.tsx` | Modify | Replace block mode with request mode + polling |
| `frontend/src/pages/CotizacionDetalle.tsx` | Modify | Crear NV → request mode; update checkCredit |
| `frontend/src/pages/NotaVentaDetalle.tsx` | Modify | Save → request mode; update checkCredit |
| `frontend/src/pages/Aprobaciones.tsx` | **Create** | Admin approve/deny page |
| `frontend/src/router.tsx` | Modify | Add /aprobaciones route |
| `frontend/src/components/layout/Sidebar.tsx` | Modify | Add Aprobaciones link (admin/subadmin only, badge) |

---

## Task 1: Remove verify-admin from previous implementation

**Files:**
- Modify: `backend/app/api/auth.py`
- Modify: `backend/app/schemas/auth.py`

- [ ] **Step 1: Remove VerifyAdminRequest from auth schemas**

Open `backend/app/schemas/auth.py`. Remove the `VerifyAdminRequest` class. File should only contain `Token` and `RefreshRequest`:

```python
from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
```

- [ ] **Step 2: Remove verify-admin endpoint from auth.py**

Open `backend/app/api/auth.py`. Remove:
- `VerifyAdminRequest` from the import line (line 6): `from app.schemas.auth import Token, RefreshRequest`
- The entire `verify_admin` endpoint function (the `@router.post("/verify-admin", ...)` block)

- [ ] **Step 3: Verify server starts**

```bash
cd backend && uvicorn app.main:app --reload
```

Expected: starts cleanly. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/auth.py backend/app/schemas/auth.py
git commit -m "refactor: remove verify-admin endpoint (replaced by approval request flow)"
```

---

## Task 2: AprobacionCredito model and migration

**Files:**
- Create: `backend/app/models/aprobacion_credito.py`
- Create: `backend/migrations/versions/l2m3n4o5p6q7_aprobaciones_credito.py`

- [ ] **Step 1: Create the model**

Create `backend/app/models/aprobacion_credito.py`:

```python
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class AprobacionCredito(Base):
    __tablename__ = "aprobaciones_credito"

    id: Mapped[int] = mapped_column(primary_key=True)
    vendedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    origen: Mapped[str] = mapped_column(String(20))
    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True
    )
    nv_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    nv_id: Mapped[int | None] = mapped_column(
        ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True
    )
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
    empresa: Mapped["Empresa | None"] = relationship("Empresa")
```

Note: `nv_payload` is stored as JSON-serialized `Text` (not SQLAlchemy JSON type) for SQLite compatibility. The router serializes/deserializes with `json.dumps`/`json.loads`.

- [ ] **Step 2: Create the migration**

Create `backend/migrations/versions/l2m3n4o5p6q7_aprobaciones_credito.py`:

```python
"""add aprobaciones_credito table

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-04-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "l2m3n4o5p6q7"
down_revision: Union[str, None] = "k1l2m3n4o5p6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "aprobaciones_credito",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("vendedor_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("empresa_id", sa.Integer, sa.ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, default=0),
        sa.Column("nota", sa.Text, nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, default="pendiente"),
        sa.Column("origen", sa.String(20), nullable=False),
        sa.Column("cotizacion_id", sa.Integer, sa.ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nv_payload", sa.Text, nullable=True),
        sa.Column("nv_id", sa.Integer, sa.ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("aprobaciones_credito")
```

- [ ] **Step 3: Run migration**

```bash
cd backend && alembic upgrade head
```

Expected: `Running upgrade k1l2m3n4o5p6 -> l2m3n4o5p6q7, add aprobaciones_credito table`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/aprobacion_credito.py backend/migrations/versions/l2m3n4o5p6q7_aprobaciones_credito.py
git commit -m "feat: add AprobacionCredito model and migration"
```

---

## Task 3: AprobacionCredito schemas

**Files:**
- Create: `backend/app/schemas/aprobacion.py`

- [ ] **Step 1: Create schemas**

Create `backend/app/schemas/aprobacion.py`:

```python
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class VendedorMinOut(BaseModel):
    id: int
    name: str
    email: str
    model_config = {"from_attributes": True}


class EmpresaMinOut(BaseModel):
    id: int
    nombre: str
    model_config = {"from_attributes": True}


class AprobacionCreate(BaseModel):
    empresa_id: int
    total: Decimal
    nota: str | None = None
    origen: str  # "cotizacion" | "directa"
    cotizacion_id: int | None = None
    nv_payload: dict | None = None


class AprobacionAccion(BaseModel):
    accion: str  # "aprobar" | "denegar"


class AprobacionOut(BaseModel):
    id: int
    vendedor_id: int | None = None
    empresa_id: int | None = None
    total: Decimal
    nota: str | None = None
    estado: str
    origen: str
    cotizacion_id: int | None = None
    nv_id: int | None = None
    created_at: datetime
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaMinOut | None = None
    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/aprobacion.py
git commit -m "feat: add AprobacionCredito Pydantic schemas"
```

---

## Task 4: Aprobaciones API router

**Files:**
- Create: `backend/app/api/aprobaciones.py`

Four endpoints: create (vendor), list (admin sees all, vendor sees own), get by id (for polling), patch (admin approve/deny).

On approve, the router reuses helper functions from `nota_ventas.py` by importing them directly.

- [ ] **Step 1: Create the router**

Create `backend/app/api/aprobaciones.py`:

```python
import json
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.database import get_db
from app.models.aprobacion_credito import AprobacionCredito
from app.models.cotizacion import Cotizacion
from app.models.nota_venta import NotaVenta, NotaVentaLinea
from app.models.user import User
from app.schemas.aprobacion import AprobacionAccion, AprobacionCreate, AprobacionOut
from app.schemas.nota_venta import NotaVentaCreate, NotaVentaLineaCreate

router = APIRouter()


def _load_aprobacion(db: Session, aprobacion_id: int) -> AprobacionCredito:
    a = db.query(AprobacionCredito).options(
        joinedload(AprobacionCredito.vendedor),
        joinedload(AprobacionCredito.empresa),
    ).filter(AprobacionCredito.id == aprobacion_id).first()
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    return a


@router.post("/", response_model=AprobacionOut, status_code=status.HTTP_201_CREATED)
def crear_aprobacion(
    body: AprobacionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    aprobacion = AprobacionCredito(
        vendedor_id=current_user.id,
        empresa_id=body.empresa_id,
        total=body.total,
        nota=body.nota,
        estado="pendiente",
        origen=body.origen,
        cotizacion_id=body.cotizacion_id,
        nv_payload=json.dumps(body.nv_payload) if body.nv_payload else None,
    )
    db.add(aprobacion)
    db.commit()
    return _load_aprobacion(db, aprobacion.id)


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


@router.get("/{aprobacion_id}", response_model=AprobacionOut)
def obtener_aprobacion(
    aprobacion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = _load_aprobacion(db, aprobacion_id)
    if current_user.role not in ("admin", "subadmin") and a.vendedor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return a


@router.patch("/{aprobacion_id}", response_model=AprobacionOut)
def accionar_aprobacion(
    aprobacion_id: int,
    body: AprobacionAccion,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administradores pueden aprobar")
    a = _load_aprobacion(db, aprobacion_id)
    if a.estado != "pendiente":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud ya fue procesada")

    if body.accion == "denegar":
        a.estado = "denegada"
        db.commit()
        return _load_aprobacion(db, a.id)

    if body.accion != "aprobar":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Acción inválida")

    # Import NV helpers here to avoid circular imports
    from app.api.nota_ventas import (
        _asignar_numero_nv,
        _calcular_lineas,
        _recalcular_totales,
        _registrar_movimientos_salida,
        _load_nv,
    )

    if a.origen == "cotizacion":
        cot = db.query(Cotizacion).options(
            __import__("sqlalchemy.orm", fromlist=["joinedload"]).joinedload(Cotizacion.lineas)
        ).filter(Cotizacion.id == a.cotizacion_id).first()
        if not cot:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
        if cot.estado == "cerrada_fv":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La cotización ya fue convertida a NV")

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
        _registrar_movimientos_salida(db, nv.id, nv.lineas, current_user.id)

    else:  # directa
        payload_dict = json.loads(a.nv_payload)
        body_nv = NotaVentaCreate.model_validate(payload_dict)
        numero = _asignar_numero_nv(db)
        nv = NotaVenta(
            numero=numero,
            cliente_id=body_nv.cliente_id,
            vendedor_id=body_nv.vendedor_id or a.vendedor_id,
            contacto=body_nv.contacto,
            fecha=body_nv.fecha or date.today(),
            nota=body_nv.nota,
            correo=body_nv.correo,
            empresa_id=body_nv.empresa_id,
        )
        db.add(nv)
        db.flush()
        nv.lineas = _calcular_lineas(db, body_nv.lineas)
        for linea in nv.lineas:
            linea.nv_id = nv.id
        _recalcular_totales(nv)
        _registrar_movimientos_salida(db, nv.id, nv.lineas, current_user.id)

    a.estado = "aprobada"
    a.nv_id = nv.id
    db.commit()
    return _load_aprobacion(db, a.id)
```

- [ ] **Step 2: Verify server starts**

```bash
cd backend && uvicorn app.main:app --reload
```

Expected: no import errors (note: router not registered yet, that's Task 5). Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/aprobaciones.py
git commit -m "feat: add aprobaciones API router"
```

---

## Task 5: Register aprobaciones router in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add import and router registration**

In `backend/app/main.py`, add after the pagos import (line 19):

```python
from app.api import aprobaciones
```

And after `app.include_router(pagos.router, ...)` (line 47), add:

```python
app.include_router(aprobaciones.router, prefix="/api/aprobaciones", tags=["aprobaciones"])
```

- [ ] **Step 2: Verify server starts and endpoint is visible**

```bash
cd backend && uvicorn app.main:app --reload
```

Expected: server starts. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: register aprobaciones router"
```

---

## Task 6: Rewrite CreditWarningModal (request mode replaces block mode)

**Files:**
- Modify: `frontend/src/components/CreditWarningModal.tsx`

Replace "block" mode entirely with "request" mode. Warning mode is unchanged.

Request mode states: `"form"` (note + submit button) → `"waiting"` (spinner, polls every 3s).

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `frontend/src/components/CreditWarningModal.tsx` with:

```tsx
import { useState, useEffect } from 'react'
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
  // warning mode only:
  onConfirm?: () => void
  // request mode only:
  aprobacionPayload?: AprobacionPayload
  onApproved?: (nvId: number) => void
  onDenied?: () => void
  // both modes:
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
  onApproved,
  onDenied,
  onCancel,
}: CreditWarningModalProps) {
  const [requestState, setRequestState] = useState<'form' | 'waiting'>('form')
  const [aprobacionId, setAprobacionId] = useState<number | null>(null)
  const [nota, setNota] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (requestState !== 'waiting' || !aprobacionId) return
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/aprobaciones/${aprobacionId}`)
        const { estado, nv_id } = res.data
        if (estado === 'aprobada' && nv_id) {
          clearInterval(interval)
          onApproved?.(nv_id)
        } else if (estado === 'denegada') {
          clearInterval(interval)
          onDenied?.()
        }
      } catch {
        // ignore poll errors, keep waiting
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [requestState, aprobacionId, onApproved, onDenied])

  async function handleSolicitar() {
    if (!aprobacionPayload) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await api.post('/api/aprobaciones/', {
        ...aprobacionPayload,
        nota: nota || null,
      })
      setAprobacionId(res.data.id)
      setRequestState('waiting')
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
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium"
            >
              Guardar de todas formas
            </button>
          </div>
        )}

        {mode === 'request' && requestState === 'form' && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Se enviará una solicitud de aprobación al administrador.
            </p>
            <textarea
              placeholder="Nota opcional para el administrador..."
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
            />
            {submitError && (
              <p className="text-xs text-red-600 dark:text-red-400 mb-2">{submitError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSolicitar}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                {submitting ? 'Enviando...' : 'Solicitar Aprobación'}
              </button>
            </div>
          </div>
        )}

        {mode === 'request' && requestState === 'waiting' && (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
              <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Esperando aprobación del administrador...
            </div>
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CreditWarningModal.tsx
git commit -m "feat: rewrite CreditWarningModal with async approval request mode"
```

---

## Task 7: Update CotizacionDetalle

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

Changes from current implementation:
1. Import `AprobacionPayload` from CreditWarningModal
2. Update `creditModal` state type (remove `mode` field from onConfirm, add `aprobacionPayload`, `onApproved`, `onDenied`)
3. Update `checkCredit` signature to handle both warning and request modes
4. Update Crear NV button to pass request payload
5. Update modal JSX to pass new props

- [ ] **Step 1: Update import to include AprobacionPayload**

Find the import line (line 10):
```tsx
import CreditWarningModal, { type CreditoInfo } from '../components/CreditWarningModal'
```

Replace with:
```tsx
import CreditWarningModal, { type CreditoInfo, type AprobacionPayload } from '../components/CreditWarningModal'
```

- [ ] **Step 2: Update creditModal state type**

Find the creditModal useState (around line 78):
```tsx
const [creditModal, setCreditModal] = useState<{
  mode: 'warning' | 'block'
  credito: CreditoInfo
  onConfirm: () => void
} | null>(null)
```

Replace with:
```tsx
const [creditModal, setCreditModal] = useState<{
  mode: 'warning' | 'request'
  credito: CreditoInfo
  onConfirm?: () => void
  aprobacionPayload?: AprobacionPayload
  onApproved?: (nvId: number) => void
  onDenied?: () => void
} | null>(null)
```

- [ ] **Step 3: Update checkCredit function**

Find the `checkCredit` function (around line 211) and replace entirely with:

```tsx
async function checkCredit(
  saleTotal: number,
  mode: 'warning' | 'request',
  onProceed: (() => void) | null,
  aprobacionPayload?: AprobacionPayload,
) {
  if (!empresaId) { onProceed?.(); return }
  const empresa = empresas.find(e => e.id === empresaId)
  if (!empresa?.limite_credito) { onProceed?.(); return }
  try {
    const res = await api.get<CreditoInfo>(`/api/empresas/${empresaId}/credito`)
    const credito = res.data
    if (credito.credito_disponible !== null && Number(credito.credito_disponible) < saleTotal) {
      if (mode === 'warning') {
        setCreditModal({
          mode: 'warning',
          credito,
          onConfirm: () => { setCreditModal(null); onProceed?.() },
        })
      } else {
        setCreditModal({
          mode: 'request',
          credito,
          aprobacionPayload,
          onApproved: (nvId) => { setCreditModal(null); navigate(`/notas-venta/${nvId}`) },
          onDenied: () => { setCreditModal(null); setError('Solicitud denegada por el administrador') },
        })
      }
    } else {
      onProceed?.()
    }
  } catch {
    onProceed?.()
  }
}
```

- [ ] **Step 4: Update handleSave call (warning mode — no change needed)**

`handleSave` already calls `checkCredit(total, 'warning', doSave)` — this still works with the new signature.

- [ ] **Step 5: Update Crear NV button onClick**

Find the Crear NV button (around line 332):
```tsx
onClick={() => checkCredit(total, 'block', () => crearNvMut.mutate())}
```

Replace with:
```tsx
onClick={() => checkCredit(
  total,
  'request',
  null,
  { empresa_id: Number(empresaId), total, origen: 'cotizacion', cotizacion_id: Number(id) }
)}
```

- [ ] **Step 6: Update CreditWarningModal JSX**

Find the modal render at the end of JSX (around line 564) and replace with:

```tsx
{creditModal && (
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
)}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: update CotizacionDetalle to use approval request flow for NV creation"
```

---

## Task 8: Update NotaVentaDetalle

**Files:**
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

Same changes as CotizacionDetalle but save is always 'request' mode.

- [ ] **Step 1: Update import**

Find:
```tsx
import CreditWarningModal, { type CreditoInfo } from '../components/CreditWarningModal'
```

Replace with:
```tsx
import CreditWarningModal, { type CreditoInfo, type AprobacionPayload } from '../components/CreditWarningModal'
```

- [ ] **Step 2: Update creditModal state type**

Find the creditModal useState (around line 90):
```tsx
const [creditModal, setCreditModal] = useState<{
  credito: CreditoInfo
  onConfirm: () => void
} | null>(null)
```

Replace with:
```tsx
const [creditModal, setCreditModal] = useState<{
  credito: CreditoInfo
  aprobacionPayload: AprobacionPayload
  onApproved: (nvId: number) => void
  onDenied: () => void
} | null>(null)
```

- [ ] **Step 3: Update checkCredit function**

Find the `checkCredit` function (around line 204) and replace entirely with:

```tsx
async function checkCredit(saleTotal: number, aprobacionPayload: AprobacionPayload, onProceed: () => void) {
  if (!empresaId) { onProceed(); return }
  const empresa = empresas.find(e => e.id === empresaId)
  if (!empresa?.limite_credito) { onProceed(); return }
  try {
    const res = await api.get<CreditoInfo>(`/api/empresas/${empresaId}/credito`)
    const credito = res.data
    if (credito.credito_disponible !== null && Number(credito.credito_disponible) < saleTotal) {
      setCreditModal({
        credito,
        aprobacionPayload,
        onApproved: (nvId) => { setCreditModal(null); navigate(`/notas-venta/${nvId}`) },
        onDenied: () => { setCreditModal(null); setError('Solicitud denegada por el administrador') },
      })
    } else {
      onProceed()
    }
  } catch {
    onProceed()
  }
}
```

- [ ] **Step 4: Update handleSave**

Find `handleSave` (around line 224):
```tsx
async function handleSave() {
  if (!clienteId) { setError('Selecciona un cliente'); return }
  checkCredit(total, doSave)
}
```

Replace with:
```tsx
async function handleSave() {
  if (!clienteId) { setError('Selecciona un cliente'); return }
  const aprobacionPayload: AprobacionPayload = {
    empresa_id: Number(empresaId),
    total,
    origen: 'directa',
    nv_payload: {
      cliente_id: clienteId,
      vendedor_id: vendedorId || currentUser?.id,
      contacto: contacto || null,
      correo: correo || null,
      fecha,
      nota: nota || null,
      empresa_id: empresaId || null,
      lineas: lineas.map((l, i) => ({
        orden: i + 1,
        producto_id: l.producto_id,
        sku: l.sku,
        descripcion: l.descripcion,
        formato: l.formato,
        cantidad: l.cantidad,
        valor_neto: l.valor_neto,
      })),
    },
  }
  checkCredit(total, aprobacionPayload, doSave)
}
```

- [ ] **Step 5: Update CreditWarningModal JSX**

Find the modal render at end of JSX and replace with:

```tsx
{creditModal && (
  <CreditWarningModal
    mode="request"
    empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
    credito={creditModal.credito}
    saleTotal={total}
    aprobacionPayload={creditModal.aprobacionPayload}
    onApproved={creditModal.onApproved}
    onDenied={creditModal.onDenied}
    onCancel={() => setCreditModal(null)}
  />
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/NotaVentaDetalle.tsx
git commit -m "feat: update NotaVentaDetalle to use approval request flow"
```

---

## Task 9: Aprobaciones admin page, route, and sidebar link

**Files:**
- Create: `frontend/src/pages/Aprobaciones.tsx`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create Aprobaciones page**

Create `frontend/src/pages/Aprobaciones.tsx`:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

interface Aprobacion {
  id: number
  empresa: { id: number; nombre: string } | null
  vendedor: { id: number; name: string; email: string } | null
  total: number
  nota: string | null
  estado: string
  origen: string
  cotizacion_id: number | null
  nv_id: number | null
  created_at: string
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Aprobaciones() {
  const currentUser = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    if (currentUser && currentUser.role === 'vendedor') navigate('/', { replace: true })
  }, [currentUser, navigate])

  const { data: pendientes = [], isLoading } = useQuery<Aprobacion[]>({
    queryKey: ['aprobaciones', 'pendiente'],
    queryFn: () => api.get('/api/aprobaciones/?estado=pendiente').then(r => r.data),
    refetchInterval: 5000,
  })

  const accionMut = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: string }) =>
      api.patch(`/api/aprobaciones/${id}`, { accion }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aprobaciones'] })
    },
  })

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Cargando...</div>
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Aprobaciones de Crédito</h1>

      {pendientes.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay solicitudes pendientes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendientes.map(a => (
            <div key={a.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">{a.empresa?.nombre ?? '—'}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">·</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{fmtMoney(a.total)}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Vendedor: {a.vendedor?.name ?? '—'} · {fmtDate(a.created_at)}
                  </p>
                  {a.nota && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 italic">"{a.nota}"</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => accionMut.mutate({ id: a.id, accion: 'denegar' })}
                    disabled={accionMut.isPending}
                    className="px-3 py-1.5 text-sm border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                  >
                    Denegar
                  </button>
                  <button
                    onClick={() => accionMut.mutate({ id: a.id, accion: 'aprobar' })}
                    disabled={accionMut.isPending}
                    className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add route in router.tsx**

In `frontend/src/router.tsx`, add import after the Pagos import:
```tsx
import Aprobaciones from './pages/Aprobaciones'
```

Add route inside the children array after the pagos route:
```tsx
{ path: 'aprobaciones', element: <Aprobaciones /> },
```

- [ ] **Step 3: Add sidebar link with pending badge**

In `frontend/src/components/layout/Sidebar.tsx`:

Add `CheckCircle` to the lucide-react import (replace the existing import line):
```tsx
import {
  LayoutDashboard, FileText, Users, Package, ShoppingCart,
  Warehouse, Receipt, Truck, UserCog, Building2, CreditCard,
  ChevronLeft, ChevronRight, LogOut, Sun, Moon, X, CheckCircle,
} from 'lucide-react'
```

Add a query for pending approvals count after the `stockBajoCount` lines (around line 45):
```tsx
const { data: aprobacionesPendientes = [] } = useQuery<{ id: number }[]>({
  queryKey: ['aprobaciones', 'pendiente'],
  queryFn: () => api.get('/api/aprobaciones/?estado=pendiente').then(r => r.data),
  enabled: !!user && user.role !== 'vendedor',
  staleTime: 10_000,
  refetchInterval: 15_000,
})
const aprobacionesCount = aprobacionesPendientes.length
```

Add the Aprobaciones entry to the NAV array (after the Pagos entry, admin/subadmin only — handle via conditional rendering, not in the static NAV array). Instead of adding to NAV, render it separately in the nav list just before the bottom section. Find where NAV items are rendered (the `.map()` call) and add after it:

```tsx
{user && user.role !== 'vendedor' && (
  <NavLink
    to="/aprobaciones"
    end={false}
    onClick={onClose}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative
       ${isActive ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`
    }
  >
    <CheckCircle size={18} className="flex-shrink-0" />
    {!collapsed && (
      <>
        <span className="flex-1 truncate">Aprobaciones</span>
        {aprobacionesCount > 0 && (
          <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {aprobacionesCount}
          </span>
        )}
      </>
    )}
    {collapsed && aprobacionesCount > 0 && (
      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
    )}
  </NavLink>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Aprobaciones.tsx frontend/src/router.tsx frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: add Aprobaciones admin page with sidebar link and badge"
```

---

## Task 10: Manual smoke test

- [ ] **Step 1: Set credit limit**

Set `limite_credito` on a test empresa to a small value (e.g., $1,000).

- [ ] **Step 2: Test cotizacion warning (unchanged)**

Create a cotizacion over limit → warning modal appears → "Guardar de todas formas" → saves normally.

- [ ] **Step 3: Test NV approval flow from CotizacionDetalle**

Open saved cotizacion → click "Crear NV" → approval request modal appears → enter optional note → click "Solicitar Aprobación" → modal transitions to waiting spinner. In a different tab (or as admin), open `/aprobaciones` → pending request visible → click "Aprobar" → vendor's tab auto-navigates to the new NV.

- [ ] **Step 4: Test NV denial**

Repeat Step 3 but admin clicks "Denegar" → vendor's tab shows "Solicitud denegada por el administrador", stays on form.

- [ ] **Step 5: Test NV approval flow from NotaVentaDetalle**

Create new NV directly for client over credit limit → on save, request modal appears → same flow.

- [ ] **Step 6: Test no credit limit**

For empresa with `limite_credito = null` → no modal, NV creates normally.

- [ ] **Step 7: Verify sidebar badge**

Log in as admin → sidebar shows "Aprobaciones" link. Create a pending request as vendor → badge count increases within 15 seconds.
