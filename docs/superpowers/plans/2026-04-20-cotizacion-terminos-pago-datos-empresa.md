# Cotización: Términos de Pago y Datos de Empresa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add payment terms (términos de pago) with an approval workflow to cotizaciones, and display company banking data in the PDF; also add an admin config page for company/banking settings.

**Architecture:** Two new nullable columns on the `cotizaciones` table (`terminos_pago`, `terminos_pago_estado`). Admin-only `/configuracion` page manages `SystemConfig` banking keys. PDF template gains a terms row and a banking info section. Approval flow mirrors margin approval: vendedor can't extend credit terms without admin approval, admin approves inline on the cotización detail page and via the Aprobaciones page.

**Tech Stack:** Python/FastAPI (SQLAlchemy ORM, Alembic, Pydantic), React/TypeScript (TanStack Query, Tailwind CSS), Jinja2 + WeasyPrint (PDF).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/migrations/versions/n4o5p6q7r8s9_add_terminos_pago_datos_bancarios.py` | Create | DB migration: 2 new columns |
| `backend/app/models/cotizacion.py` | Modify | Add `terminos_pago`, `terminos_pago_estado` fields |
| `backend/app/schemas/cotizacion.py` | Modify | Add fields to Create/Update/Out schemas |
| `backend/app/api/cotizaciones.py` | Modify | `_parse_dias` helper, estado logic, PDF/email block, list filter |
| `backend/app/api/config.py` | Modify | Add banking keys to `INITIAL_CONFIG` |
| `backend/app/templates/cotizacion.html` | Modify | RUT labels, terms row, banking section |
| `frontend/src/types/index.ts` | Modify | Add fields to `Cotizacion` interface |
| `frontend/src/pages/CotizacionDetalle.tsx` | Modify | State, auto-fill, field UI, approval banner, PDF/email block |
| `frontend/src/pages/Configuracion.tsx` | Create | Admin config page for company + banking data |
| `frontend/src/router.tsx` | Modify | Add `/configuracion` route |
| `frontend/src/components/layout/Sidebar.tsx` | Modify | Add Configuracion nav item (admin only) |
| `frontend/src/pages/Aprobaciones.tsx` | Modify | Add pending terminos pago section |
| `backend/tests/test_cotizacion_terminos.py` | Create | Tests for `_parse_dias` and terminos_pago_estado logic |

---

## Task 1: Backend Migration

**Files:**
- Create: `backend/migrations/versions/n4o5p6q7r8s9_add_terminos_pago_datos_bancarios.py`

- [ ] **Step 1: Write the migration file**

```python
"""add terminos_pago and datos_bancarios to cotizaciones/config

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-04-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "n4o5p6q7r8s9"
down_revision: Union[str, None] = "m3n4o5p6q7r8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cotizaciones",
        sa.Column("terminos_pago", sa.String(255), nullable=True),
    )
    op.add_column(
        "cotizaciones",
        sa.Column(
            "terminos_pago_estado",
            sa.String(20),
            nullable=False,
            server_default="aprobado",
        ),
    )


def downgrade() -> None:
    op.drop_column("cotizaciones", "terminos_pago_estado")
    op.drop_column("cotizaciones", "terminos_pago")
```

- [ ] **Step 2: Apply migration**

From `backend/` directory:
```bash
alembic upgrade head
```
Expected: `Running upgrade m3n4o5p6q7r8 -> n4o5p6q7r8s9, add terminos_pago and datos_bancarios`

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/versions/n4o5p6q7r8s9_add_terminos_pago_datos_bancarios.py
git commit -m "feat: add migration for terminos_pago fields on cotizaciones"
```

---

## Task 2: Backend Model

**Files:**
- Modify: `backend/app/models/cotizacion.py`

- [ ] **Step 1: Add two fields to `Cotizacion` class**

In `backend/app/models/cotizacion.py`, after the `nota` field (line 21), add:

```python
    terminos_pago: Mapped[str | None] = mapped_column(String(255), nullable=True)
    terminos_pago_estado: Mapped[str] = mapped_column(String(20), default="aprobado")
```

The full `Cotizacion` class field block should now read (lines 11–36):

```python
    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id", ondelete="RESTRICT"))
    vendedor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    estado: Mapped[str] = mapped_column(String(20), default="no_definido")
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    terminos_pago: Mapped[str | None] = mapped_column(String(255), nullable=True)
    terminos_pago_estado: Mapped[str] = mapped_column(String(20), default="aprobado")
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
```

- [ ] **Step 2: Verify model imports (no changes needed)**

`String` is already imported from `sqlalchemy`. No additional imports required.

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/cotizacion.py
git commit -m "feat: add terminos_pago fields to Cotizacion model"
```

---

## Task 3: Backend Schemas

**Files:**
- Modify: `backend/app/schemas/cotizacion.py`

- [ ] **Step 1: Add fields to `CotizacionCreate`**

After `empresa_id: int | None = None` (line 34), add:
```python
    terminos_pago: str | None = None
```

- [ ] **Step 2: Add fields to `CotizacionUpdate`**

After `empresa_id: int | None = None` (line 47), add:
```python
    terminos_pago: str | None = None
    terminos_pago_estado: str | None = None
```

- [ ] **Step 3: Add fields to `CotizacionOut`**

After `nota: str | None = None` (line 73), add:
```python
    terminos_pago: str | None = None
    terminos_pago_estado: str = "aprobado"
```

- [ ] **Step 4: Add fields to `CotizacionListOut`**

After `correo: str | None = None` (line 95), add:
```python
    terminos_pago: str | None = None
    terminos_pago_estado: str = "aprobado"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/cotizacion.py
git commit -m "feat: add terminos_pago fields to cotizacion schemas"
```

---

## Task 4: Backend API — cotizaciones.py

**Files:**
- Modify: `backend/app/api/cotizaciones.py`

- [ ] **Step 1: Add imports**

At the top of the file, after the existing imports, add:
```python
import re
from app.models.empresa import Empresa
```

The full import block at the top should look like:
```python
import re
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
from app.models.aprobacion_margen import AprobacionMargen
from app.models.cotizacion import Cotizacion, CotizacionLinea
from app.models.empresa import Empresa
from app.models.producto import Producto
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.cotizacion import (
    CotizacionCreate,
    CotizacionListOut,
    CotizacionOut,
    CotizacionUpdate,
    CotizacionLineaCreate,
)
from app.services.email import EmailNotConfiguredError, enviar_cotizacion
from app.services.pdf import generar_pdf_cotizacion
```

- [ ] **Step 2: Add `_parse_dias` helper**

After the `_can_edit` function (after line 90), add:

```python
def _parse_dias(plazo: str | None) -> int:
    if not plazo:
        return 0
    lower = plazo.lower()
    if "contado" in lower:
        return 0
    m = re.search(r'(\d+)', lower)
    return int(m.group(1)) if m else 0


def _calc_terminos_estado(
    terminos_pago: str | None,
    empresa_id: int | None,
    db: Session,
    current_user: User,
) -> str:
    if current_user.role in ("admin", "subadmin"):
        return "aprobado"
    if not terminos_pago or not empresa_id:
        return "aprobado"
    empresa = db.get(Empresa, empresa_id)
    default_dias = _parse_dias(empresa.plazo_credito if empresa else None)
    nuevo_dias = _parse_dias(terminos_pago)
    return "pendiente" if nuevo_dias > default_dias else "aprobado"
```

- [ ] **Step 3: Update `crear_cotizacion` to include `terminos_pago`**

In `crear_cotizacion` (around line 230), replace the `Cotizacion(...)` constructor call:

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
        terminos_pago=body.terminos_pago,
        terminos_pago_estado=_calc_terminos_estado(
            body.terminos_pago, body.empresa_id, db, current_user
        ),
    )
```

- [ ] **Step 4: Update `actualizar_cotizacion` to handle terminos_pago_estado logic**

In `actualizar_cotizacion` (around line 287), replace the simple `for field, value in ...` loop with:

```python
    update_data = body.model_dump(exclude_unset=True)

    # Handle terminos_pago: auto-set estado based on comparison to empresa default
    if "terminos_pago" in update_data:
        new_plazo = update_data.pop("terminos_pago")
        cot.terminos_pago = new_plazo
        empresa_id = update_data.get("empresa_id", cot.empresa_id)
        auto_estado = _calc_terminos_estado(new_plazo, empresa_id, db, current_user)
        cot.terminos_pago_estado = auto_estado
        update_data.pop("terminos_pago_estado", None)

    # Allow admin to approve/reject directly
    if "terminos_pago_estado" in update_data:
        if current_user.role in ("admin", "subadmin"):
            cot.terminos_pago_estado = update_data.pop("terminos_pago_estado")
        else:
            update_data.pop("terminos_pago_estado")

    for field, value in update_data.items():
        setattr(cot, field, value)
```

- [ ] **Step 5: Add `terminos_pago_estado` filter to `listar_cotizaciones`**

In `listar_cotizaciones`, add the parameter and filter:

```python
@router.get("/", response_model=list[CotizacionListOut])
def listar_cotizaciones(
    estado: list[str] | None = Query(None),
    vendedor_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    terminos_pago_estado: str | None = Query(None),
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    _, db = perms
    q = db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
    )
    if estado:
        q = q.filter(Cotizacion.estado.in_(estado))
    if vendedor_id:
        q = q.filter(Cotizacion.vendedor_id == vendedor_id)
    if cliente_id:
        q = q.filter(Cotizacion.cliente_id == cliente_id)
    if fecha_desde:
        q = q.filter(Cotizacion.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Cotizacion.fecha <= fecha_hasta)
    if terminos_pago_estado:
        q = q.filter(Cotizacion.terminos_pago_estado == terminos_pago_estado)
    return q.order_by(Cotizacion.numero.desc()).all()
```

- [ ] **Step 6: Update PDF/email endpoints to block on pending terminos_pago**

In `generar_pdf` (around line 370), after the existing margin check, add:

```python
    if current_user.role not in ("admin", "subadmin") and cot.terminos_pago_estado == "pendiente":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere aprobación de términos de pago",
        )
```

Do the same in `enviar_email` (around line 403), after the margin check:

```python
    if current_user.role not in ("admin", "subadmin") and cot.terminos_pago_estado == "pendiente":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere aprobación de términos de pago",
        )
```

- [ ] **Step 7: Add `joinedload(Cotizacion.empresa)` to PDF/email queries**

In `generar_pdf`, the query currently loads `cliente`, `vendedor`, `lineas` but NOT `empresa`. Update it:

```python
    cot = db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
        joinedload(Cotizacion.lineas),
    ).filter(Cotizacion.id == cotizacion_id).first()
```

Do the same for `enviar_email`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/cotizaciones.py
git commit -m "feat: add terminos_pago approval logic and banking filter to cotizaciones API"
```

---

## Task 5: Backend Config — Banking Keys

**Files:**
- Modify: `backend/app/api/config.py`

- [ ] **Step 1: Add banking keys to `INITIAL_CONFIG`**

Replace the existing `INITIAL_CONFIG` dict (lines 12–19) with:

```python
INITIAL_CONFIG = {
    "cotizacion_last_id": "12250",
    "orden_compra_last_id": "0",
    "empresa_nombre": "Distribuidora Conico Ltda.",
    "empresa_rut": "82.638.800-5",
    "empresa_direccion": "",
    "empresa_logo_url": "",
    "empresa_banco": "",
    "empresa_tipo_cuenta": "",
    "empresa_numero_cuenta": "",
    "empresa_nombre_titular": "",
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/config.py
git commit -m "feat: add banking keys to SystemConfig initial config"
```

---

## Task 6: PDF Template

**Files:**
- Modify: `backend/app/templates/cotizacion.html`

- [ ] **Step 1: Add CSS for banking section**

In the `<style>` block, after the `.footer` rule (line 41), add:

```css
  .terminos-pago { margin-top: 8px; font-size: 10px; color: #555; }
  .terminos-pago span { font-weight: 600; color: #333; }

  .banking-section { margin-top: 20px; padding: 12px; border: 1px solid #e9ecef; border-radius: 4px; background: #f8f9fa; }
  .banking-title { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 8px; }
  .banking-grid { display: grid; grid-template-columns: 140px 1fr; gap: 3px 8px; font-size: 10px; color: #555; }
  .banking-grid .label { color: #888; }
  .banking-grid .value { font-weight: 600; color: #333; }
```

- [ ] **Step 2: Update the client block to show empresa RUT**

Replace the client RUT block (lines 67–69):

```html
    {% if cotizacion.empresa and cotizacion.empresa.rut %}
    <div><strong>RUT:</strong> {{ cotizacion.empresa.rut }}</div>
    {% elif cotizacion.cliente and cotizacion.cliente.rut %}
    <div><strong>RUT:</strong> {{ cotizacion.cliente.rut }}</div>
    {% endif %}
```

- [ ] **Step 3: Add términos de pago row after totals table**

After the closing `</div>` of the `.totales` div (after line 127), add:

```html
{% if cotizacion.terminos_pago %}
<div class="totales">
  <div class="terminos-pago" style="width:260px; padding: 4px 8px;">
    Términos de pago: <span>{{ cotizacion.terminos_pago }}</span>
  </div>
</div>
{% endif %}
```

- [ ] **Step 4: Add banking section before the footer**

Replace the `<!-- NOTA -->` block and footer (lines 129–139) with:

```html
<!-- NOTA -->
{% if cotizacion.nota %}
<div class="nota-block">
  <div class="nota-label">Observaciones</div>
  <div>{{ cotizacion.nota }}</div>
</div>
{% endif %}

<!-- DATOS BANCARIOS -->
{% if config.empresa_banco or config.empresa_numero_cuenta %}
<div class="banking-section">
  <div class="banking-title">Datos para Transferencia / Cheque</div>
  <div class="banking-grid">
    {% if config.empresa_banco %}
    <div class="label">Banco</div>
    <div class="value">{{ config.empresa_banco }}</div>
    {% endif %}
    {% if config.empresa_tipo_cuenta %}
    <div class="label">Tipo de cuenta</div>
    <div class="value">{{ config.empresa_tipo_cuenta }}</div>
    {% endif %}
    {% if config.empresa_numero_cuenta %}
    <div class="label">N° de cuenta</div>
    <div class="value">{{ config.empresa_numero_cuenta }}</div>
    {% endif %}
    {% if config.empresa_nombre_titular %}
    <div class="label">Titular</div>
    <div class="value">{{ config.empresa_nombre_titular }}</div>
    {% endif %}
    {% if config.empresa_rut %}
    <div class="label">RUT</div>
    <div class="value">{{ config.empresa_rut }}</div>
    {% endif %}
  </div>
</div>
{% endif %}

<div class="footer">
  Documento generado el {{ cotizacion.fecha.strftime('%d/%m/%Y') if cotizacion.fecha else '' }} · {{ config.empresa_nombre or '' }}
</div>
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/templates/cotizacion.html
git commit -m "feat: add terminos_pago, empresa RUT, and banking section to cotizacion PDF"
```

---

## Task 7: Backend Tests

**Files:**
- Create: `backend/tests/test_cotizacion_terminos.py`

- [ ] **Step 1: Write tests for `_parse_dias`**

```python
import pytest
from datetime import date
from decimal import Decimal


def test_parse_dias_contado():
    from app.api.cotizaciones import _parse_dias
    assert _parse_dias("Al contado") == 0
    assert _parse_dias("Contado") == 0


def test_parse_dias_numeric():
    from app.api.cotizaciones import _parse_dias
    assert _parse_dias("30 Días") == 30
    assert _parse_dias("60 días") == 60
    assert _parse_dias("90 Días") == 90


def test_parse_dias_none():
    from app.api.cotizaciones import _parse_dias
    assert _parse_dias(None) == 0
    assert _parse_dias("") == 0
    assert _parse_dias("Sin definir") == 0
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_cotizacion_terminos.py -v
```

Expected output:
```
PASSED tests/test_cotizacion_terminos.py::test_parse_dias_contado
PASSED tests/test_cotizacion_terminos.py::test_parse_dias_numeric
PASSED tests/test_cotizacion_terminos.py::test_parse_dias_none
3 passed
```

- [ ] **Step 3: Write integration test for terminos_pago_estado auto-set**

Add to `test_cotizacion_terminos.py`:

```python
def _make_empresa(db, plazo_credito="30 Días"):
    from app.models.empresa import Empresa
    emp = Empresa(nombre="Test Empresa", plazo_credito=plazo_credito)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def test_vendedor_extending_terms_sets_pendiente(client, vendedor_token, vendedor_user, db):
    emp = _make_empresa(db, plazo_credito="30 Días")
    payload = {
        "cliente_id": 1,
        "empresa_id": emp.id,
        "terminos_pago": "60 Días",
        "fecha": str(date.today()),
        "lineas": [],
    }
    resp = client.post(
        "/api/cotizaciones/",
        json=payload,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["terminos_pago_estado"] == "pendiente"


def test_vendedor_reducing_terms_stays_aprobado(client, vendedor_token, vendedor_user, db):
    emp = _make_empresa(db, plazo_credito="60 Días")
    payload = {
        "cliente_id": 1,
        "empresa_id": emp.id,
        "terminos_pago": "30 Días",
        "fecha": str(date.today()),
        "lineas": [],
    }
    resp = client.post(
        "/api/cotizaciones/",
        json=payload,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["terminos_pago_estado"] == "aprobado"


def test_admin_can_approve_terminos(client, admin_token, vendedor_token, vendedor_user, db):
    emp = _make_empresa(db, plazo_credito="30 Días")
    create_resp = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": 1,
            "empresa_id": emp.id,
            "terminos_pago": "60 Días",
            "fecha": str(date.today()),
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    cot_id = create_resp.json()["id"]

    approve_resp = client.patch(
        f"/api/cotizaciones/{cot_id}",
        json={"terminos_pago_estado": "aprobado"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["terminos_pago_estado"] == "aprobado"


def test_vendedor_cannot_self_approve_terminos(client, vendedor_token, vendedor_user, db):
    emp = _make_empresa(db, plazo_credito="30 Días")
    create_resp = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": 1,
            "empresa_id": emp.id,
            "terminos_pago": "60 Días",
            "fecha": str(date.today()),
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    cot_id = create_resp.json()["id"]

    resp = client.patch(
        f"/api/cotizaciones/{cot_id}",
        json={"terminos_pago_estado": "aprobado"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["terminos_pago_estado"] == "pendiente"
```

- [ ] **Step 4: Run all new tests**

```bash
cd backend && pytest tests/test_cotizacion_terminos.py -v
```

Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_cotizacion_terminos.py
git commit -m "test: add terminos_pago business logic tests"
```

---

## Task 8: Frontend Types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add fields to `Cotizacion` interface**

In `frontend/src/types/index.ts`, add two fields to the `Cotizacion` interface (after `nota: string | null`, currently around line 139):

```typescript
  terminos_pago: string | null
  terminos_pago_estado: string
```

The updated `Cotizacion` interface:

```typescript
export interface Cotizacion {
  id: number
  numero: number
  cliente_id: number
  vendedor_id: number
  empresa_id: number | null
  empresa?: EmpresaRef | null
  contacto: string | null
  fecha: string
  estado: 'no_definido' | 'abierta' | 'cerrada_fv' | 'rechazada'
  nota: string | null
  terminos_pago: string | null
  terminos_pago_estado: string
  correo: string | null
  total_neto: number
  total_iva: number
  total: number
  created_at: string
  updated_at: string
  cliente?: { id: number; nombre: string; rut: string | null; email: string | null; telefono: string | null }
  vendedor?: { id: number; name: string; email: string }
  lineas?: CotizacionLinea[]
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add terminos_pago fields to Cotizacion TypeScript type"
```

---

## Task 9: Frontend CotizacionDetalle

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

This is the largest frontend task. Follow each step carefully.

- [ ] **Step 1: Add state variables**

In the state declarations section (after `const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)`, around line 133), add:

```tsx
  const [terminosPago, setTerminosPago] = useState('')
  const [terminosPagoEstado, setTerminosPagoEstado] = useState('aprobado')
```

- [ ] **Step 2: Add `parseDias` helper**

Add this function before the `CotizacionDetalle` component (after `fmtMoney`, around line 52):

```tsx
function parseDias(plazo: string | null | undefined): number {
  if (!plazo) return 0
  const lower = plazo.toLowerCase()
  if (lower.includes('contado')) return 0
  const m = lower.match(/(\d+)/)
  return m ? parseInt(m[1]) : 0
}
```

- [ ] **Step 3: Add `approveTerminosPagoMut` mutation**

After the `crearNvMut` mutation (around line 558), add:

```tsx
  const approveTerminosPagoMut = useMutation({
    mutationFn: (estado: 'aprobado' | 'rechazado') =>
      api.patch(`/api/cotizaciones/${id}`, { terminos_pago_estado: estado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizacion', id] })
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Error al actualizar términos de pago')
    },
  })
```

- [ ] **Step 4: Update `cotizacionSnapshot` to include `terminos_pago`**

Replace `cotizacionSnapshot` function (lines 62–81):

```tsx
function cotizacionSnapshot(cot: Cotizacion): string {
  return JSON.stringify({
    clienteId: cot.cliente_id,
    vendedorId: cot.vendedor_id ?? '',
    contacto: cot.contacto ?? '',
    correo: cot.correo ?? '',
    fecha: cot.fecha,
    estado: cot.estado,
    nota: cot.nota ?? '',
    empresaId: cot.empresa_id ?? '',
    terminosPago: cot.terminos_pago ?? '',
    lineas: (cot.lineas ?? []).map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descripcion: l.descripcion ?? '',
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  })
}
```

- [ ] **Step 5: Update `currentSnapshot` to include `terminosPago`**

Replace the `currentSnapshot` useMemo (lines 137–148):

```tsx
  const currentSnapshot = useMemo(() => JSON.stringify({
    clienteId, vendedorId, contacto, correo, fecha, estado, nota, empresaId,
    terminosPago,
    lineas: lineas.map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descripcion: l.descripcion ?? '',
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  }), [clienteId, vendedorId, contacto, correo, fecha, estado, nota, empresaId, terminosPago, lineas])
```

- [ ] **Step 6: Update `useEffect` that loads cotizacion to populate new state**

In the `useEffect` that runs when `cotizacion` changes (lines 182–206), add after `setEmpresaId(...)`:

```tsx
      setTerminosPago(cotizacion.terminos_pago ?? '')
      setTerminosPagoEstado(cotizacion.terminos_pago_estado ?? 'aprobado')
```

- [ ] **Step 7: Update `handleClienteChange` to auto-fill terminos_pago from empresa**

Replace `handleClienteChange` (lines 229–241):

```tsx
  function handleClienteChange(cid: number | '') {
    withRevokeGuard(() => {
      setClienteId(cid)
      if (cid) {
        const c = clientes.find(cl => cl.id === cid)
        if (c) {
          setContacto(c.nombre)
          setCorreo(c.email ?? '')
          if (c.empresa_id) {
            setEmpresaId(c.empresa_id)
            const emp = empresas.find(e => e.id === c.empresa_id)
            if (emp?.plazo_credito) setTerminosPago(emp.plazo_credito)
          }
        }
      }
    })
  }
```

- [ ] **Step 8: Add `handleEmpresaChange` to auto-fill terminos_pago when empresa is changed directly**

After `handleClienteChange`, add:

```tsx
  function handleEmpresaChange(eid: number | '') {
    setEmpresaId(eid)
    if (eid) {
      const emp = empresas.find(e => e.id === eid)
      if (emp?.plazo_credito) setTerminosPago(emp.plazo_credito)
    }
  }
```

- [ ] **Step 9: Update empresa select to use `handleEmpresaChange`**

In the empresa `<select>` (around line 711), change:
```tsx
onChange={e => setEmpresaId(e.target.value ? Number(e.target.value) : '')}
```
to:
```tsx
onChange={e => handleEmpresaChange(e.target.value ? Number(e.target.value) : '')}
```

- [ ] **Step 10: Update `handleDiscardAndContinue` to restore terminos_pago**

In `handleDiscardAndContinue` (lines 507–534), after `setEmpresaId(cotizacion.empresa_id ?? '')`, add:

```tsx
      setTerminosPago(cotizacion.terminos_pago ?? '')
      setTerminosPagoEstado(cotizacion.terminos_pago_estado ?? 'aprobado')
```

- [ ] **Step 11: Update `doSave` to include `terminos_pago` in payload**

In `doSave` (around line 454), add `terminos_pago` to the payload:

```tsx
      const payload = {
        cliente_id: clienteId,
        vendedor_id: vendedorId || currentUser?.id,
        contacto: contacto || null,
        correo: correo || null,
        fecha,
        estado,
        nota: nota || null,
        empresa_id: empresaId || null,
        terminos_pago: terminosPago || null,
      }
```

- [ ] **Step 12: Add computed values for blocking**

After `const isDirty = ...` (line 149), add:

```tsx
  const selectedEmpresa = empresas.find(e => e.id === empresaId) ?? null
  const terminosPagoNeedsApproval = !isAdmin
    && !!terminosPago
    && !!selectedEmpresa?.plazo_credito
    && parseDias(terminosPago) > parseDias(selectedEmpresa.plazo_credito)
  const tpBlocked = !isAdmin && (terminosPagoNeedsApproval || terminosPagoEstado === 'pendiente')
```

- [ ] **Step 13: Update PDF and Email button disabled conditions**

Replace `disabled={(!isAdmin && !!marginStatus?.blocked) || lineasErrors.length > 0}` on the PDF button with:

```tsx
disabled={(!isAdmin && !!marginStatus?.blocked) || tpBlocked || lineasErrors.length > 0}
```

Update the title prop accordingly:
```tsx
title={
  lineasErrors.length > 0 ? lineasErrors.join(' | ')
  : (!isAdmin && marginStatus?.blocked) ? 'Requiere aprobación de márgenes'
  : tpBlocked ? 'Requiere aprobación de términos de pago'
  : undefined
}
```

Do the same for the Email button.

- [ ] **Step 14: Add terminos_pago status banner for vendedor**

After the existing `marginStatus?.blocked` banner (around line 693), add:

```tsx
      {!isAdmin && !isNew && tpBlocked && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
          {terminosPagoEstado === 'pendiente'
            ? 'Términos de pago extendidos — pendiente de aprobación. PDF y email deshabilitados.'
            : 'Los términos de pago requieren aprobación antes de generar PDF o enviar email.'}
        </div>
      )}
      {!isAdmin && !isNew && terminosPagoEstado === 'rechazado' && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
          Términos de pago rechazados por el administrador. Actualiza los términos y guarda.
        </div>
      )}
```

- [ ] **Step 15: Add admin approval banner with Aprobar/Rechazar buttons**

After the vendedor banner above, add:

```tsx
      {isAdmin && !isNew && cotizacion?.terminos_pago_estado === 'pendiente' && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 flex items-center justify-between gap-3">
          <span>Términos de pago extendidos requieren aprobación: <strong>{cotizacion.terminos_pago}</strong></span>
          <div className="flex gap-2">
            <button
              onClick={() => approveTerminosPagoMut.mutate('aprobado')}
              disabled={approveTerminosPagoMut.isPending}
              className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              Aprobar
            </button>
            <button
              onClick={() => approveTerminosPagoMut.mutate('rechazado')}
              disabled={approveTerminosPagoMut.isPending}
              className="px-3 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              Rechazar
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 16: Add Términos de Pago field to the form**

In the form grid (the `<div className="grid cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">` section), after the `nota/observaciones` textarea block (after line 772), add:

```tsx
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Términos de Pago
              {terminosPagoNeedsApproval && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">
                  Requiere aprobación
                </span>
              )}
            </label>
            <input
              type="text"
              value={terminosPago}
              onChange={e => setTerminosPago(e.target.value)}
              placeholder="Ej: 30 Días, Al contado, 60 Días..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
```

- [ ] **Step 17: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: add terminos_pago field, auto-fill, and approval flow to CotizacionDetalle"
```

---

## Task 10: Admin Configuracion Page

**Files:**
- Create: `frontend/src/pages/Configuracion.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { SystemConfig } from '../types'

const COMPANY_FIELDS = [
  { key: 'empresa_nombre', label: 'Nombre empresa' },
  { key: 'empresa_rut', label: 'RUT empresa' },
  { key: 'empresa_direccion', label: 'Dirección' },
  { key: 'empresa_logo_url', label: 'URL del logo' },
]

const BANKING_FIELDS = [
  { key: 'empresa_banco', label: 'Banco' },
  { key: 'empresa_tipo_cuenta', label: 'Tipo de cuenta' },
  { key: 'empresa_numero_cuenta', label: 'N° de cuenta' },
  { key: 'empresa_nombre_titular', label: 'Nombre titular' },
]

export default function Configuracion() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />

  const { data: config = [], isLoading } = useQuery<SystemConfig[]>({
    queryKey: ['config'],
    queryFn: () => api.get('/api/config/').then(r => r.data),
  })

  const [form, setForm] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (config.length === 0) return
    const map = Object.fromEntries(config.map(c => [c.key, c.value]))
    setForm({
      empresa_nombre: map.empresa_nombre ?? '',
      empresa_rut: map.empresa_rut ?? '',
      empresa_direccion: map.empresa_direccion ?? '',
      empresa_logo_url: map.empresa_logo_url ?? '',
      empresa_banco: map.empresa_banco ?? '',
      empresa_tipo_cuenta: map.empresa_tipo_cuenta ?? '',
      empresa_numero_cuenta: map.empresa_numero_cuenta ?? '',
      empresa_nombre_titular: map.empresa_nombre_titular ?? '',
    })
  }, [config])

  const saveMut = useMutation({
    mutationFn: (updates: Record<string, string>) =>
      api.patch('/api/config/', { updates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      setToast({ msg: 'Configuración guardada', ok: true })
      setTimeout(() => setToast(null), 3000)
    },
    onError: () => {
      setToast({ msg: 'Error al guardar', ok: false })
      setTimeout(() => setToast(null), 3000)
    },
  })

  function handleSave() {
    saveMut.mutate(form)
  }

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Cargando...</div>

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Configuración del Sistema</h1>

      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          toast.ok
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Datos de la Empresa</h2>
        <div className="grid grid-cols-1 gap-4">
          {COMPANY_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{f.label}</label>
              <input
                type="text"
                value={form[f.key] ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Datos Bancarios</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Aparecen en el PDF de cotizaciones como información para transferencias y cheques.</p>
        <div className="grid grid-cols-1 gap-4">
          {BANKING_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{f.label}</label>
              <input
                type="text"
                value={form[f.key] ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
        >
          {saveMut.isPending ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Configuracion.tsx
git commit -m "feat: add admin Configuracion page for company and banking data"
```

---

## Task 11: Router and Sidebar

**Files:**
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add route to router.tsx**

Add the import at the top (with other page imports):
```tsx
import Configuracion from './pages/Configuracion'
```

Add the route inside the children array (after the `usuarios` route):
```tsx
      { path: 'configuracion', element: <Configuracion /> },
```

- [ ] **Step 2: Add nav item to Sidebar.tsx**

Add the `Settings` icon import to the lucide-react import line (after `ClipboardList`):
```tsx
import {
  LayoutDashboard, FileText, Users, Package, ShoppingCart,
  Warehouse, Receipt, Truck, UserCog, Building2, CreditCard,
  ChevronLeft, ChevronRight, LogOut, Sun, Moon, X, ClipboardList, Settings,
} from 'lucide-react'
```

In the `NAV` array, add an entry after `/usuarios`:
```tsx
  { to: '/configuracion', icon: Settings, label: 'Configuración' },
```

In the sidebar render logic, show Configuración only for admins. The current code filters items by `myPermissions`. For `configuracion`, there's no module permission, so it needs to be shown based on `isAdminUser`. The simplest approach: add an `adminOnly?: boolean` field to the NAV type and filter accordingly.

Replace the `NAV` type:
```tsx
const NAV: { to: string; icon: React.ElementType; label: string; module?: Module; adminOnly?: boolean }[] = [
  { to: '/',               icon: LayoutDashboard, label: 'Dashboard',         module: 'dashboard' },
  { to: '/cotizaciones',   icon: FileText,        label: 'Cotizaciones',      module: 'cotizaciones' },
  { to: '/clientes',       icon: Users,           label: 'Clientes',          module: 'clientes' },
  { to: '/empresas',       icon: Building2,       label: 'Empresas',          module: 'empresas' },
  { to: '/catalogo',       icon: Package,         label: 'Catálogo',          module: 'catalogo' },
  { to: '/notas-venta',    icon: ShoppingCart,    label: 'Notas de Venta',    module: 'nota_venta' },
  { to: '/facturas',       icon: Receipt,         label: 'Facturas',          module: 'facturas' },
  { to: '/pagos',          icon: CreditCard,      label: 'Pagos' },
  { to: '/inventario',     icon: Warehouse,       label: 'Inventario',        module: 'inventario' },
  { to: '/ordenes-compra', icon: ShoppingCart,    label: 'Órdenes de Compra', module: 'ordenes_compra' },
  { to: '/proveedores',    icon: Truck,           label: 'Proveedores',       module: 'proveedores' },
  { to: '/rrhh',           icon: UserCog,         label: 'RRHH',              module: 'rrhh' },
  { to: '/usuarios',       icon: Users,           label: 'Usuarios',          module: 'usuarios' },
  { to: '/configuracion',  icon: Settings,        label: 'Configuración',     adminOnly: true },
]
```

In the render loop where NAV items are filtered, find the code that checks `myPermissions` and add an `adminOnly` filter. Look for where NAV items are rendered (they use `NavLink`). Add an early return/filter:

```tsx
// Before rendering each nav item, add this check:
if (item.adminOnly && !isAdminUser) return null
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/router.tsx frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: add /configuracion route and sidebar nav item (admin only)"
```

---

## Task 12: Aprobaciones Page — Términos Pendientes

**Files:**
- Modify: `frontend/src/pages/Aprobaciones.tsx`

- [ ] **Step 1: Add query for cotizaciones with pending terminos_pago**

In `Aprobaciones.tsx`, after the existing `margenes` query (around line 71), add:

```tsx
  const { data: terminosPendientes = [], isLoading: loadingTerminos } = useQuery<{
    id: number
    numero: number
    terminos_pago: string | null
    empresa?: { id: number; nombre: string } | null
    vendedor?: { id: number; name: string; email: string } | null
  }[]>({
    queryKey: ['cotizaciones-terminos-pendientes'],
    queryFn: () =>
      api.get('/api/cotizaciones/?terminos_pago_estado=pendiente').then(r => r.data),
    enabled: isAdminUser,
  })
```

- [ ] **Step 2: Add mutation for approving/rejecting terminos_pago**

After the `margenMutation` (around line 97), add:

```tsx
  const terminosMutation = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'aprobado' | 'rechazado' }) =>
      api.patch(`/api/cotizaciones/${id}`, { terminos_pago_estado: accion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones-terminos-pendientes'] })
      setActingKey(null)
    },
    onError: () => setActingKey(null),
  })
```

- [ ] **Step 3: Add terminos pending section to the render**

Find the end of the render return (before the final `</div>` closing the page). Add a new section after the existing approval cards, just before the closing `</div>`:

```tsx
      {/* Términos de Pago Pendientes */}
      {terminosPendientes.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Términos de Pago — Pendientes ({terminosPendientes.length})
          </h2>
          <div className="space-y-3">
            {terminosPendientes.map(cot => {
              const key = `terminos-${cot.id}`
              return (
                <div key={cot.id} className="bg-white dark:bg-gray-900 rounded-xl border border-amber-200 dark:border-amber-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        COT-{String(cot.numero).padStart(5, '0')}
                        {cot.empresa && <span className="ml-2 text-gray-500 font-normal">— {cot.empresa.nombre}</span>}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Términos solicitados: <strong className="text-amber-700 dark:text-amber-400">{cot.terminos_pago}</strong>
                      </div>
                      {cot.vendedor && (
                        <div className="text-xs text-gray-400 mt-0.5">Vendedor: {cot.vendedor.name}</div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setActingKey(key)
                          terminosMutation.mutate({ id: cot.id, accion: 'aprobado' })
                        }}
                        disabled={actingKey === key}
                        className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => {
                          setActingKey(key)
                          terminosMutation.mutate({ id: cot.id, accion: 'rechazado' })
                        }}
                        disabled={actingKey === key}
                        className="px-3 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Aprobaciones.tsx
git commit -m "feat: add pending terminos_pago approval section to Aprobaciones page"
```

---

## Final Verification

- [ ] **Step 1: Run backend tests**

```bash
cd backend && pytest -v
```
Expected: All tests pass including the new `test_cotizacion_terminos.py`.

- [ ] **Step 2: Run frontend type check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No type errors.

- [ ] **Step 3: Start dev servers and manually verify**

Test the following scenarios:
1. Create a cotización with empresa that has `plazo_credito = "30 Días"` → terms auto-fill to "30 Días"
2. Vendedor changes terms to "60 Días" → badge "Requiere aprobación" appears, PDF button disabled
3. Save → cotización has `terminos_pago_estado = "pendiente"`
4. Admin sees approval banner in cotización detail → clicks Aprobar → estado changes to "aprobado"
5. Aprobaciones page shows the pending cotización with Aprobar/Rechazar
6. Generate PDF → shows banking section (after admin sets banking data in /configuracion)
7. PDF shows empresa RUT (not cliente RUT) when empresa is set
8. `/configuracion` page visible only to admin in sidebar

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete cotización payment terms and company data implementation"
```
