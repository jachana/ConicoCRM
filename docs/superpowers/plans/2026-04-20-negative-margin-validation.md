# Negative Margin & Empty Item Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block saving, PDF, and email for any cotización or NV that has a line with negative margin or no item selected — for all users including admins.

**Architecture:** Backend validation helper `_check_lineas_invalidas` added to both `cotizaciones.py` and `nota_ventas.py`, called before DB commit on create/update-lines and before generating PDF/email. Frontend computes `lineasErrors` on render, disables Save/PDF/Email buttons with tooltip, and shows an `UnsavedChangesModal` when PDF/email is triggered with unsaved changes.

**Tech Stack:** FastAPI (backend), React + TypeScript + TanStack Query (frontend), pytest (tests)

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/app/api/cotizaciones.py` |
| Modify | `backend/app/api/nota_ventas.py` |
| Create | `backend/tests/test_negative_margin_validation.py` |
| Modify | `frontend/src/pages/CotizacionDetalle.tsx` |
| Modify | `frontend/src/pages/NotaVentaDetalle.tsx` |
| Create | `frontend/src/components/UnsavedChangesModal.tsx` |

---

## Task 1: Backend validation — cotizaciones

**Files:**
- Modify: `backend/app/api/cotizaciones.py`
- Create: `backend/tests/test_negative_margin_validation.py`

- [ ] **Step 1: Write failing tests for cotizacion save validation**

Create `backend/tests/test_negative_margin_validation.py`:

```python
import pytest


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_producto(client, token, precio_venta=1000, precio_costo=600):
    r = client.post("/api/productos/", json={
        "nombre": "Prod Validation Test",
        "sku": f"SKU-VAL-{precio_venta}-{precio_costo}",
        "precio_venta": precio_venta,
        "precio_costo": precio_costo,
        "unidad": "un",
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _make_cliente(client, token):
    import random
    r = client.post("/api/clientes/", json={"nombre": f"Cliente Val {random.randint(1000,9999)}"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()["id"]


def _make_cotizacion_linea(client, token, cid, producto_id, valor_neto):
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cid,
        "lineas": [{"orden": 1, "descripcion": "Test", "producto_id": producto_id,
                    "cantidad": 1, "valor_neto": valor_neto}],
    }, headers={"Authorization": f"Bearer {token}"})
    return r


# ── cotizacion save ───────────────────────────────────────────────────────────

def test_cot_save_blocked_negative_margin(client, admin_token):
    # precio_venta=500 < precio_costo=1000 → margen = (500-1000)/500 = -1.0
    prod = _make_producto(client, admin_token, precio_venta=500, precio_costo=1000)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod["id"], valor_neto=500)
    assert r.status_code == 422
    assert "margen_negativo" in r.json()["detail"]


def test_cot_save_blocked_empty_item(client, admin_token):
    cid = _make_cliente(client, admin_token)
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cid,
        "lineas": [{"orden": 1, "descripcion": "Texto libre", "producto_id": None,
                    "cantidad": 1, "valor_neto": 1000}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422
    assert "linea_sin_item" in r.json()["detail"]


def test_cot_save_allowed_positive_margin(client, admin_token):
    # precio_venta=1000, precio_costo=600 → margen = (1000-600)/1000 = 0.4
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201


def test_cot_update_lineas_blocked_negative_margin(client, admin_token):
    prod_ok = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    prod_neg = _make_producto(client, admin_token, precio_venta=500, precio_costo=1000)
    cid = _make_cliente(client, admin_token)
    # Create valid cotizacion
    r = _make_cotizacion_linea(client, admin_token, cid, prod_ok["id"], valor_neto=1000)
    assert r.status_code == 201
    cot_id = r.json()["id"]
    # Now update lineas with negative margin
    r2 = client.put(f"/api/cotizaciones/{cot_id}/lineas", json=[
        {"orden": 1, "descripcion": "Test", "producto_id": prod_neg["id"],
         "cantidad": 1, "valor_neto": 500}
    ], headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "margen_negativo" in r2.json()["detail"]


def test_cot_update_lineas_blocked_empty_item(client, admin_token):
    prod_ok = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod_ok["id"], valor_neto=1000)
    assert r.status_code == 201
    cot_id = r.json()["id"]
    r2 = client.put(f"/api/cotizaciones/{cot_id}/lineas", json=[
        {"orden": 1, "descripcion": "Texto libre", "producto_id": None,
         "cantidad": 1, "valor_neto": 1000}
    ], headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "linea_sin_item" in r2.json()["detail"]
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && python -m pytest tests/test_negative_margin_validation.py::test_cot_save_blocked_negative_margin tests/test_negative_margin_validation.py::test_cot_save_blocked_empty_item -v
```

Expected: FAIL — `assert 422 == 201` (save currently succeeds)

- [ ] **Step 3: Add `_check_lineas_invalidas` helper to `cotizaciones.py`**

In `backend/app/api/cotizaciones.py`, add after `_can_edit` (line 90), before `check_margin_approval_required`:

```python
def _check_lineas_invalidas(lineas) -> None:
    errors = []
    if any(l.producto_id is None for l in lineas):
        errors.append("linea_sin_item")
    if any(l.margen is not None and l.margen < 0 for l in lineas):
        errors.append("margen_negativo")
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=" | ".join({
                "linea_sin_item": "Hay líneas sin producto seleccionado",
                "margen_negativo": "Hay líneas con margen negativo",
            }[e] for e in errors),
        )
```

- [ ] **Step 4: Call `_check_lineas_invalidas` in `crear_cotizacion`**

In `crear_cotizacion` (around line 227), add the check after `_calcular_lineas` and before `_recalcular_totales`:

```python
    cotizacion.lineas = _calcular_lineas(db, body.lineas)
    _check_lineas_invalidas(cotizacion.lineas)   # ← add this line
    _recalcular_totales(cotizacion)
    db.commit()
```

- [ ] **Step 5: Call `_check_lineas_invalidas` in `reemplazar_lineas`**

In `reemplazar_lineas` (around line 298), add the check after `_calcular_lineas` and before the loop that adds new lineas:

```python
    nuevas_lineas = _calcular_lineas(db, lineas_data)
    _check_lineas_invalidas(nuevas_lineas)   # ← add this line
    for linea in nuevas_lineas:
        linea.cotizacion_id = cotizacion_id
        db.add(linea)
```

- [ ] **Step 6: Run all cotizacion save tests to verify they pass**

```
cd backend && python -m pytest tests/test_negative_margin_validation.py::test_cot_save_blocked_negative_margin tests/test_negative_margin_validation.py::test_cot_save_blocked_empty_item tests/test_negative_margin_validation.py::test_cot_save_allowed_positive_margin tests/test_negative_margin_validation.py::test_cot_update_lineas_blocked_negative_margin tests/test_negative_margin_validation.py::test_cot_update_lineas_blocked_empty_item -v
```

Expected: all 5 PASS

- [ ] **Step 7: Verify existing tests still pass**

```
cd backend && python -m pytest tests/test_margin_gate.py tests/test_aprobaciones_margen.py -v
```

Expected: all existing tests PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/cotizaciones.py backend/tests/test_negative_margin_validation.py
git commit -m "feat: block cotizacion save/lineas with negative margin or missing item"
```

---

## Task 2: Backend validation — cotizacion PDF and email gates

**Files:**
- Modify: `backend/app/api/cotizaciones.py`
- Modify: `backend/tests/test_negative_margin_validation.py`

- [ ] **Step 1: Write failing tests for cotizacion PDF/email gates**

Append to `backend/tests/test_negative_margin_validation.py`:

```python
# ── cotizacion PDF / email gates ──────────────────────────────────────────────

def test_cot_pdf_blocked_negative_margin(client, db, admin_token):
    from app.models.cotizacion import Cotizacion, CotizacionLinea
    from decimal import Decimal
    # Create valid cotizacion via API (passes save validation)
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201
    cot_id = r.json()["id"]
    # Directly set margen to negative in DB (simulates legacy data)
    linea = db.query(CotizacionLinea).filter(CotizacionLinea.cotizacion_id == cot_id).first()
    linea.margen = Decimal("-0.5")
    db.commit()
    # PDF should be blocked
    r2 = client.get(f"/api/cotizaciones/{cot_id}/pdf",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "margen_negativo" in r2.json()["detail"]


def test_cot_pdf_blocked_empty_item(client, db, admin_token):
    from app.models.cotizacion import Cotizacion, CotizacionLinea
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201
    cot_id = r.json()["id"]
    # Directly nullify producto_id in DB (simulates legacy data)
    linea = db.query(CotizacionLinea).filter(CotizacionLinea.cotizacion_id == cot_id).first()
    linea.producto_id = None
    db.commit()
    r2 = client.get(f"/api/cotizaciones/{cot_id}/pdf",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "linea_sin_item" in r2.json()["detail"]


def test_cot_email_blocked_negative_margin(client, db, admin_token):
    from app.models.cotizacion import CotizacionLinea
    from decimal import Decimal
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201
    cot_id = r.json()["id"]
    linea = db.query(CotizacionLinea).filter(CotizacionLinea.cotizacion_id == cot_id).first()
    linea.margen = Decimal("-0.5")
    db.commit()
    r2 = client.post(f"/api/cotizaciones/{cot_id}/email",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "margen_negativo" in r2.json()["detail"]
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && python -m pytest tests/test_negative_margin_validation.py::test_cot_pdf_blocked_negative_margin tests/test_negative_margin_validation.py::test_cot_pdf_blocked_empty_item tests/test_negative_margin_validation.py::test_cot_email_blocked_negative_margin -v
```

Expected: FAIL — PDF/email currently return 200

- [ ] **Step 3: Add `_check_lineas_invalidas` call in `generar_pdf`**

In `generar_pdf` in `cotizaciones.py` (around line 347), add the check after the 404 guard and before the margin approval gate:

```python
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    _check_lineas_invalidas(cot.lineas)   # ← add this line
    if current_user.role not in ("admin", "subadmin") and check_margin_approval_required(db, cotizacion_id):
```

- [ ] **Step 4: Add `_check_lineas_invalidas` call in `enviar_email`**

In `enviar_email` in `cotizaciones.py` (around line 380), same position — after 404 guard, before margin gate:

```python
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    _check_lineas_invalidas(cot.lineas)   # ← add this line
    if current_user.role not in ("admin", "subadmin") and check_margin_approval_required(db, cotizacion_id):
```

- [ ] **Step 5: Run all cotizacion tests**

```
cd backend && python -m pytest tests/test_negative_margin_validation.py -k "cot" -v
```

Expected: all 8 cotizacion tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/cotizaciones.py backend/tests/test_negative_margin_validation.py
git commit -m "feat: gate cotizacion PDF/email on negative margin and missing item"
```

---

## Task 3: Backend validation — nota de venta

**Files:**
- Modify: `backend/app/api/nota_ventas.py`
- Modify: `backend/tests/test_negative_margin_validation.py`

- [ ] **Step 1: Write failing tests for NV validation**

Append to `backend/tests/test_negative_margin_validation.py`:

```python
# ── nota de venta ─────────────────────────────────────────────────────────────

def _make_nv_linea(client, token, cid, producto_id, valor_neto):
    r = client.post("/api/nota_ventas/", json={
        "cliente_id": cid,
        "lineas": [{"orden": 1, "descripcion": "Test NV", "producto_id": producto_id,
                    "cantidad": 1, "valor_neto": valor_neto}],
    }, headers={"Authorization": f"Bearer {token}"})
    return r


def test_nv_save_blocked_negative_margin(client, admin_token):
    prod = _make_producto(client, admin_token, precio_venta=500, precio_costo=1000)
    cid = _make_cliente(client, admin_token)
    r = _make_nv_linea(client, admin_token, cid, prod["id"], valor_neto=500)
    assert r.status_code == 422
    assert "margen_negativo" in r.json()["detail"]


def test_nv_save_blocked_empty_item(client, admin_token):
    cid = _make_cliente(client, admin_token)
    r = client.post("/api/nota_ventas/", json={
        "cliente_id": cid,
        "lineas": [{"orden": 1, "descripcion": "Texto libre", "producto_id": None,
                    "cantidad": 1, "valor_neto": 1000}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422
    assert "linea_sin_item" in r.json()["detail"]


def test_nv_update_lineas_blocked_negative_margin(client, admin_token):
    prod_ok = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    prod_neg = _make_producto(client, admin_token, precio_venta=500, precio_costo=1000)
    cid = _make_cliente(client, admin_token)
    r = _make_nv_linea(client, admin_token, cid, prod_ok["id"], valor_neto=1000)
    assert r.status_code == 201
    nv_id = r.json()["id"]
    r2 = client.put(f"/api/nota_ventas/{nv_id}/lineas", json=[
        {"orden": 1, "descripcion": "Test", "producto_id": prod_neg["id"],
         "cantidad": 1, "valor_neto": 500}
    ], headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "margen_negativo" in r2.json()["detail"]


def test_nv_pdf_blocked_negative_margin(client, db, admin_token):
    from app.models.nota_venta import NotaVentaLinea
    from decimal import Decimal
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_nv_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201
    nv_id = r.json()["id"]
    linea = db.query(NotaVentaLinea).filter(NotaVentaLinea.nv_id == nv_id).first()
    linea.margen = Decimal("-0.5")
    db.commit()
    r2 = client.get(f"/api/nota_ventas/{nv_id}/pdf",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "margen_negativo" in r2.json()["detail"]


def test_nv_email_blocked_empty_item(client, db, admin_token):
    from app.models.nota_venta import NotaVentaLinea
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_nv_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201
    nv_id = r.json()["id"]
    linea = db.query(NotaVentaLinea).filter(NotaVentaLinea.nv_id == nv_id).first()
    linea.producto_id = None
    db.commit()
    r2 = client.post(f"/api/nota_ventas/{nv_id}/email",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "linea_sin_item" in r2.json()["detail"]
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && python -m pytest tests/test_negative_margin_validation.py -k "nv" -v
```

Expected: FAIL

- [ ] **Step 3: Add `_check_lineas_invalidas` helper to `nota_ventas.py`**

In `backend/app/api/nota_ventas.py`, add after `_can_edit` (around line 100):

```python
def _check_lineas_invalidas(lineas) -> None:
    errors = []
    if any(l.producto_id is None for l in lineas):
        errors.append("linea_sin_item")
    if any(l.margen is not None and l.margen < 0 for l in lineas):
        errors.append("margen_negativo")
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=" | ".join({
                "linea_sin_item": "Hay líneas sin producto seleccionado",
                "margen_negativo": "Hay líneas con margen negativo",
            }[e] for e in errors),
        )
```

Note: `HTTPException` and `status` are already imported in `nota_ventas.py`.

- [ ] **Step 4: Call `_check_lineas_invalidas` in `crear_nv`**

In `crear_nv` (around line 239), add after `_calcular_lineas` and before `_recalcular_totales`:

```python
    nv.lineas = _calcular_lineas(db, body.lineas)
    _check_lineas_invalidas(nv.lineas)   # ← add this line
    for linea in nv.lineas:
        linea.nv_id = nv.id
    _recalcular_totales(nv)
```

- [ ] **Step 5: Call `_check_lineas_invalidas` in `reemplazar_lineas` (NV)**

In `reemplazar_lineas` (around line 355), add after `_calcular_lineas` and before the loop that adds new lineas:

```python
    nuevas = _calcular_lineas(db, lineas_data)
    _check_lineas_invalidas(nuevas)   # ← add this line
    for linea in nuevas:
        linea.nv_id = nv_id
        db.add(linea)
```

- [ ] **Step 6: Call `_check_lineas_invalidas` in `generar_pdf` (NV)**

In `generar_pdf` (around line 449), add after loading `nv` and before generating PDF:

```python
def generar_pdf(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    nv = _load_nv(db, nv_id)
    _check_lineas_invalidas(nv.lineas)   # ← add this line
    config = _get_config_dict(db)
```

- [ ] **Step 7: Call `_check_lineas_invalidas` in `enviar_email` (NV)**

In `enviar_email` (around line 463), add after loading `nv` and before generating PDF:

```python
def enviar_email(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    nv = _load_nv(db, nv_id)
    _check_lineas_invalidas(nv.lineas)   # ← add this line
    config = _get_config_dict(db)
```

- [ ] **Step 8: Run all validation tests**

```
cd backend && python -m pytest tests/test_negative_margin_validation.py -v
```

Expected: all 13 tests PASS

- [ ] **Step 9: Run full test suite**

```
cd backend && python -m pytest -v
```

Expected: all tests PASS

- [ ] **Step 10: Commit**

```bash
git add backend/app/api/nota_ventas.py backend/tests/test_negative_margin_validation.py
git commit -m "feat: block NV save/lineas/PDF/email with negative margin or missing item"
```

---

## Task 4: Frontend — UnsavedChangesModal component

**Files:**
- Create: `frontend/src/components/UnsavedChangesModal.tsx`

- [ ] **Step 1: Create `UnsavedChangesModal.tsx`**

Create `frontend/src/components/UnsavedChangesModal.tsx`:

```tsx
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  saving?: boolean
  onSaveAndContinue: () => void
  onDiscardAndContinue: () => void
  onCancel: () => void
  docType?: 'cotizacion' | 'nv'
}

export default function UnsavedChangesModal({
  open, saving, onSaveAndContinue, onDiscardAndContinue, onCancel, docType = 'cotizacion'
}: Props) {
  if (!open) return null
  const label = docType === 'nv' ? 'La nota de venta' : 'La cotización'
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Cambios sin guardar
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {label} tiene cambios que no han sido guardados.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveAndContinue}
            disabled={saving}
            className="w-full px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar y continuar'}
          </button>
          <button
            onClick={onDiscardAndContinue}
            disabled={saving}
            className="w-full px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            Descartar cambios
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/UnsavedChangesModal.tsx
git commit -m "feat: add UnsavedChangesModal component"
```

---

## Task 5: Frontend — CotizacionDetalle validation and unsaved-changes modal

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `CotizacionDetalle.tsx`, add the import:

```tsx
import UnsavedChangesModal from '../components/UnsavedChangesModal'
```

And add `useMemo` to the React import if not already present:
```tsx
import { useState, useEffect, useMemo } from 'react'
```

After the existing state declarations (around line 83), add:

```tsx
  const [unsavedModal, setUnsavedModal] = useState(false)
  const [pendingAction, setPendingAction] = useState<'pdf' | 'email' | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
```

- [ ] **Step 2: Add `getLineasErrors` and snapshot helpers**

Add these functions before the `CotizacionDetalle` component (or at the top of the component body, before any hooks), right after `fmtMoney`:

```tsx
function getLineasErrors(lineas: LineaLocal[]): string[] {
  const errors: string[] = []
  if (lineas.some(l => l.producto_id === null || l.producto_id === undefined))
    errors.push('Hay líneas sin producto seleccionado')
  if (lineas.some(l => l.margen !== null && l.margen !== undefined && Number(l.margen) < 0))
    errors.push('Hay líneas con margen negativo')
  return errors
}

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

- [ ] **Step 3: Add `isDirty` and `lineasErrors` computed values**

Inside the `CotizacionDetalle` component, after the state declarations, add:

```tsx
  const lineasErrors = useMemo(() => getLineasErrors(lineas), [lineas])

  const currentSnapshot = useMemo(() => JSON.stringify({
    clienteId, vendedorId, contacto, correo, fecha, estado, nota, empresaId,
    lineas: lineas.map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descripcion: l.descripcion ?? '',
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  }), [clienteId, vendedorId, contacto, correo, fecha, estado, nota, empresaId, lineas])

  const isDirty = !isNew && savedSnapshot !== null && currentSnapshot !== savedSnapshot
```

- [ ] **Step 4: Set `savedSnapshot` when cotizacion data loads**

Find the `useEffect` that reads from `cotizacion` and sets form state. It will look like:

```tsx
  useEffect(() => {
    if (cotizacion) {
      setClienteId(cotizacion.cliente_id)
      // ... other setters ...
    }
  }, [cotizacion])
```

Add `setSavedSnapshot(cotizacionSnapshot(cotizacion))` at the end of the `if (cotizacion)` block:

```tsx
  useEffect(() => {
    if (cotizacion) {
      setClienteId(cotizacion.cliente_id)
      // ... all existing setters stay the same ...
      setSavedSnapshot(cotizacionSnapshot(cotizacion))   // ← add this line
    }
  }, [cotizacion])
```

- [ ] **Step 5: Make `doSave` return a boolean**

Change `doSave` signature and return values:

```tsx
  async function doSave(): Promise<boolean> {
    setSaving(true)
    setError('')
    try {
      // ... existing payload and API calls (unchanged) ...
      qc.invalidateQueries({ queryKey: ['cotizaciones'] })
      navigate(`/cotizaciones/${cotId}`)
      return true
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Error al guardar')
      return false
    } finally {
      setSaving(false)
    }
  }
```

Update `handleSave` to use the return value (currently ignores it — no change needed there since it calls `checkCredit(total, 'warning', doSave)` which doesn't use the return value).

- [ ] **Step 6: Add `handleSaveAndContinue` and `handleDiscardAndContinue`**

Add after `doSave`:

```tsx
  async function handleSaveAndContinue() {
    setModalSaving(true)
    const ok = await doSave()
    setModalSaving(false)
    if (ok) {
      setUnsavedModal(false)
      if (pendingAction === 'pdf') openPdf(`/api/cotizaciones/${id}/pdf`)
      else if (pendingAction === 'email') emailMut.mutate()
      setPendingAction(null)
    }
  }

  function handleDiscardAndContinue() {
    if (cotizacion) {
      setClienteId(cotizacion.cliente_id)
      setVendedorId(cotizacion.vendedor_id ?? '')
      setContacto(cotizacion.contacto ?? '')
      setCorreo(cotizacion.correo ?? '')
      setFecha(cotizacion.fecha)
      setEstado(cotizacion.estado)
      setNota(cotizacion.nota ?? '')
      setEmpresaId(cotizacion.empresa_id ?? '')
      setLineas(
        (cotizacion.lineas ?? []).map((l, i) => ({
          ...l,
          _key: `${l.id ?? i}`,
          producto_id: l.producto_id ?? null,
          sku: l.sku ?? null,
          formato: l.formato ?? null,
          margen: l.margen ?? null,
        }))
      )
      setSavedSnapshot(cotizacionSnapshot(cotizacion))
    }
    setUnsavedModal(false)
    if (pendingAction === 'pdf') openPdf(`/api/cotizaciones/${id}/pdf`)
    else if (pendingAction === 'email') emailMut.mutate()
    setPendingAction(null)
  }
```

- [ ] **Step 7: Update the Save button to disable when `lineasErrors` is non-empty**

Find the Save button (around line 513, the button with `onClick={handleSave}`). Update it:

```tsx
          <button
            onClick={handleSave}
            disabled={saving || lineasErrors.length > 0}
            title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
```

- [ ] **Step 8: Update PDF button to check `lineasErrors` and `isDirty`**

Find the PDF button (around line 476–484). Replace its `disabled`, `title`, and `onClick`:

```tsx
              <button
                onClick={() => {
                  if (lineasErrors.length > 0) return
                  if (isDirty) { setPendingAction('pdf'); setUnsavedModal(true); return }
                  openPdf(`/api/cotizaciones/${id}/pdf`)
                }}
                disabled={(!isAdmin && !!marginStatus?.blocked) || lineasErrors.length > 0}
                title={
                  lineasErrors.length > 0 ? lineasErrors.join(' | ')
                  : (!isAdmin && marginStatus?.blocked) ? 'Requiere aprobacion de margenes'
                  : undefined
                }
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
```

- [ ] **Step 9: Update Email button to check `lineasErrors` and `isDirty`**

Find the Email button (around line 485–493). Replace its `disabled`, `title`, and `onClick`:

```tsx
              <button
                onClick={() => {
                  if (lineasErrors.length > 0) return
                  if (isDirty) { setPendingAction('email'); setUnsavedModal(true); return }
                  emailMut.mutate()
                }}
                disabled={emailMut.isPending || (!isAdmin && !!marginStatus?.blocked) || lineasErrors.length > 0}
                title={
                  lineasErrors.length > 0 ? lineasErrors.join(' | ')
                  : (!isAdmin && marginStatus?.blocked) ? 'Requiere aprobacion de margenes'
                  : undefined
                }
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
```

- [ ] **Step 10: Add `UnsavedChangesModal` to the JSX**

At the end of the return statement, before the closing `</div>`, add:

```tsx
      <UnsavedChangesModal
        open={unsavedModal}
        saving={modalSaving}
        onSaveAndContinue={handleSaveAndContinue}
        onDiscardAndContinue={handleDiscardAndContinue}
        onCancel={() => { setUnsavedModal(false); setPendingAction(null) }}
        docType="cotizacion"
      />
```

- [ ] **Step 11: Verify TypeScript compiles**

```
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 12: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx frontend/src/components/UnsavedChangesModal.tsx
git commit -m "feat: add lineas validation and unsaved-changes modal to CotizacionDetalle"
```

---

## Task 6: Frontend — NotaVentaDetalle validation and unsaved-changes modal

**Files:**
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `NotaVentaDetalle.tsx`, add:

```tsx
import UnsavedChangesModal from '../components/UnsavedChangesModal'
```

Add `useMemo` to the React import if not already present:
```tsx
import { useState, useEffect, useCallback, useMemo } from 'react'
```

After the existing state declarations (around line 93), add:

```tsx
  const [unsavedModal, setUnsavedModal] = useState(false)
  const [pendingAction, setPendingAction] = useState<'pdf' | 'email' | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
```

- [ ] **Step 2: Add `getLineasErrors` and snapshot helpers for NV**

Add these functions before `NotaVentaDetalle` (after `fmtMoney`):

```tsx
function getLineasErrors(lineas: LineaLocal[]): string[] {
  const errors: string[] = []
  if (lineas.some(l => l.producto_id === null || l.producto_id === undefined))
    errors.push('Hay líneas sin producto seleccionado')
  if (lineas.some(l => l.margen !== null && l.margen !== undefined && Number(l.margen) < 0))
    errors.push('Hay líneas con margen negativo')
  return errors
}

function nvSnapshot(nv: NotaVenta): string {
  return JSON.stringify({
    clienteId: nv.cliente_id,
    vendedorId: nv.vendedor_id ?? '',
    contacto: nv.contacto ?? '',
    correo: nv.correo ?? '',
    fecha: nv.fecha,
    nota: nv.nota ?? '',
    empresaId: nv.empresa_id ?? '',
    lineas: (nv.lineas ?? []).map(l => ({
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

- [ ] **Step 3: Add `isDirty` and `lineasErrors` computed values**

Inside `NotaVentaDetalle`, after state declarations, add:

```tsx
  const lineasErrors = useMemo(() => getLineasErrors(lineas), [lineas])

  const currentSnapshot = useMemo(() => JSON.stringify({
    clienteId, vendedorId, contacto, correo, fecha, nota, empresaId,
    lineas: lineas.map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descripcion: l.descripcion ?? '',
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  }), [clienteId, vendedorId, contacto, correo, fecha, nota, empresaId, lineas])

  const isDirty = !isNew && savedSnapshot !== null && currentSnapshot !== savedSnapshot
```

- [ ] **Step 4: Set `savedSnapshot` when NV data loads**

Find the `useEffect` that sets state from `nv` (around line 104). Add `setSavedSnapshot(nvSnapshot(nv))` at the end of the `if (nv)` block:

```tsx
  useEffect(() => {
    if (nv) {
      setClienteId(nv.cliente_id)
      // ... all existing setters stay the same ...
      setSavedSnapshot(nvSnapshot(nv))   // ← add this line
    }
  }, [nv])
```

- [ ] **Step 5: Make `doSave` return a boolean**

Update `doSave` in `NotaVentaDetalle.tsx`:

```tsx
  async function doSave(): Promise<boolean> {
    setSaving(true)
    setError('')
    try {
      // ... existing payload and API calls (unchanged) ...
      qc.invalidateQueries({ queryKey: ['nota_ventas'] })
      navigate(`/notas-venta/${nvId}`)
      return true
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Error al guardar')
      return false
    } finally {
      setSaving(false)
    }
  }
```

- [ ] **Step 6: Add `handleSaveAndContinue` and `handleDiscardAndContinue`**

Add after `doSave`:

```tsx
  async function handleSaveAndContinue() {
    setModalSaving(true)
    const ok = await doSave()
    setModalSaving(false)
    if (ok) {
      setUnsavedModal(false)
      if (pendingAction === 'pdf') openPdf(`/api/nota_ventas/${id}/pdf`)
      else if (pendingAction === 'email') emailMut.mutate()
      setPendingAction(null)
    }
  }

  function handleDiscardAndContinue() {
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
      setSavedSnapshot(nvSnapshot(nv))
    }
    setUnsavedModal(false)
    if (pendingAction === 'pdf') openPdf(`/api/nota_ventas/${id}/pdf`)
    else if (pendingAction === 'email') emailMut.mutate()
    setPendingAction(null)
  }
```

- [ ] **Step 7: Update the Save button**

Find the Save button (around line 401). Update `disabled` and `title`:

```tsx
          <button
            onClick={handleSave}
            disabled={saving || lineasErrors.length > 0}
            title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
```

- [ ] **Step 8: Update PDF button**

Find the PDF button (around line 367). Replace its `onClick`, `disabled`, and `title`:

```tsx
                <button
                  onClick={() => {
                    if (lineasErrors.length > 0) return
                    if (isDirty) { setPendingAction('pdf'); setUnsavedModal(true); return }
                    openPdf(`/api/nota_ventas/${id}/pdf`)
                  }}
                  disabled={lineasErrors.length > 0}
                  title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
```

- [ ] **Step 9: Update Email button**

Find the Email button (around line 374). Replace its `onClick`, `disabled`, and `title`:

```tsx
                <button
                  onClick={() => {
                    if (lineasErrors.length > 0) return
                    if (isDirty) { setPendingAction('email'); setUnsavedModal(true); return }
                    emailMut.mutate()
                  }}
                  disabled={emailMut.isPending || lineasErrors.length > 0}
                  title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
```

- [ ] **Step 10: Add `UnsavedChangesModal` to the JSX**

At the end of the return statement, before the closing `</div>`, add:

```tsx
      <UnsavedChangesModal
        open={unsavedModal}
        saving={modalSaving}
        onSaveAndContinue={handleSaveAndContinue}
        onDiscardAndContinue={handleDiscardAndContinue}
        onCancel={() => { setUnsavedModal(false); setPendingAction(null) }}
        docType="nv"
      />
```

- [ ] **Step 11: Verify TypeScript compiles**

```
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 12: Run full backend test suite one more time**

```
cd backend && python -m pytest -v
```

Expected: all tests PASS

- [ ] **Step 13: Commit**

```bash
git add frontend/src/pages/NotaVentaDetalle.tsx
git commit -m "feat: add lineas validation and unsaved-changes modal to NotaVentaDetalle"
```
