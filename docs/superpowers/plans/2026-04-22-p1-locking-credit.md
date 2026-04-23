# P1: Chain Locking + Credit Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock Cotizacion/NV/Factura documents from editing once a downstream document is generated, and show disabled terminos_pago field in the UI when empresa has no credit line.

**Architecture:** Add `is_locked: bool` DB column to `cotizaciones` and `nota_ventas`. Set it to `True` when creating a downstream document. Backend PATCH endpoints return 403 if locked. Factura PATCH always returns 403 (no DB column needed). Frontend reads `is_locked` from API, shows banner and disables all form fields. `FacturaOut` always returns `is_locked: true`.

**Tech Stack:** Python/FastAPI/SQLAlchemy (backend), Alembic (migrations), React/TypeScript/TanStack Query (frontend), pytest (tests).

---

## File Map

**Modified — Backend:**
- `app/models/cotizacion.py` — add `is_locked` field
- `app/models/nota_venta.py` — add `is_locked` field
- `app/schemas/cotizacion.py` — export `is_locked` in CotizacionOut/CotizacionListOut
- `app/schemas/nota_venta.py` — export `is_locked` in NotaVentaOut/NotaVentaListOut
- `app/schemas/factura.py` — export `is_locked: bool = True` in FacturaOut/FacturaListOut
- `app/api/cotizaciones.py` — guard PATCH endpoints
- `app/api/nota_ventas.py` — guard PATCH endpoints + set cotizacion.is_locked on NV creation
- `app/api/facturas.py` — always-403 on PATCH + set nv.is_locked on Factura creation

**Created — Backend:**
- `migrations/versions/<rev>_add_is_locked_cotizaciones_nota_ventas.py` — Alembic migration
- `tests/test_chain_locking.py` — locking tests

**Modified — Frontend:**
- `frontend/src/types/index.ts` — add `is_locked?: boolean` to Cotizacion, NotaVenta, Factura
- `frontend/src/pages/CotizacionDetalle.tsx` — locked banner + disabled fields
- `frontend/src/pages/NotaVentaDetalle.tsx` — locked banner + disabled fields + terminos_pago display
- `frontend/src/pages/FacturaDetalle.tsx` — always-locked banner + hide edit button

---

## Task 1: Add `is_locked` to Models

**Files:**
- Modify: `app/models/cotizacion.py`
- Modify: `app/models/nota_venta.py`

- [ ] **Step 1: Add Boolean import to cotizacion.py**

In `app/models/cotizacion.py`, line 3, add `Boolean` to the import:

```python
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
```

- [ ] **Step 2: Add `is_locked` field to Cotizacion model**

In `app/models/cotizacion.py`, after line 28 (`total: Mapped[Decimal] = ...`), insert:

```python
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
```

- [ ] **Step 3: Add `is_locked` field to NotaVenta model**

In `app/models/nota_venta.py`, after line 33 (`total: Mapped[Decimal] = ...`), insert:

```python
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
```

(`Boolean` is already imported on line 3 of nota_venta.py — no import change needed.)

- [ ] **Step 4: Create migration**

```bash
cd /c/Otros/Conico/backend
alembic revision --autogenerate -m "add_is_locked_cotizaciones_nota_ventas"
```

Verify the generated file in `migrations/versions/` contains:
```python
def upgrade() -> None:
    op.add_column('cotizaciones', sa.Column('is_locked', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('nota_ventas', sa.Column('is_locked', sa.Boolean(), server_default='false', nullable=False))

def downgrade() -> None:
    op.drop_column('cotizaciones', 'is_locked')
    op.drop_column('nota_ventas', 'is_locked')
```

If autogenerate produces something different, edit to match the above.

- [ ] **Step 5: Apply migration**

```bash
alembic upgrade head
```

Expected output: `Running upgrade <prev> -> <new>, add_is_locked_cotizaciones_nota_ventas`

- [ ] **Step 6: Smoke test**

```bash
pytest tests/test_smoke.py -v
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add app/models/cotizacion.py app/models/nota_venta.py migrations/
git commit -m "feat: add is_locked field to cotizaciones and nota_ventas models"
```

---

## Task 2: Schema + TypeScript Type Updates

**Files:**
- Modify: `app/schemas/cotizacion.py`
- Modify: `app/schemas/nota_venta.py`
- Modify: `app/schemas/factura.py`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add `is_locked` to CotizacionOut and CotizacionListOut**

In `app/schemas/cotizacion.py`, in `CotizacionOut` (line 71), add before `model_config`:

```python
    is_locked: bool = False
```

Do the same in `CotizacionListOut` (line 96), also before `model_config`.

- [ ] **Step 2: Add `is_locked` to NotaVentaOut and NotaVentaListOut**

In `app/schemas/nota_venta.py`, in `NotaVentaOut` (line 74), add before `model_config`:

```python
    is_locked: bool = False
```

Do the same in `NotaVentaListOut` (line 102), also before `model_config`.

- [ ] **Step 3: Add `is_locked: bool = True` to FacturaOut and FacturaListOut**

In `app/schemas/factura.py`, in `FacturaOut` (line 77), add before `model_config`:

```python
    is_locked: bool = True
```

Do the same in `FacturaListOut` (line 109), also before `model_config`.

Note: Factura has no `is_locked` DB column — the `True` default in the schema always returns `True` for all facturas.

- [ ] **Step 4: Add `is_locked` to frontend TypeScript interfaces**

In `frontend/src/types/index.ts`:

In `Cotizacion` (line 135), add after `lineas?: CotizacionLinea[]` (line 158):
```typescript
  is_locked?: boolean
```

In `NotaVenta` (line 205), add after `lineas?: NotaVentaLinea[]` (line 230):
```typescript
  is_locked?: boolean
```

In `Factura` (line 254), add after `lineas: FacturaLinea[]` (line 287):
```typescript
  is_locked?: boolean
```

- [ ] **Step 5: Verify no TypeScript errors**

```bash
cd /c/Otros/Conico/frontend
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add app/schemas/cotizacion.py app/schemas/nota_venta.py app/schemas/factura.py frontend/src/types/index.ts
git commit -m "feat: export is_locked in cotizacion/nv/factura schemas and frontend types"
```

---

## Task 3: Backend Guard — Cotizacion PATCH Endpoints

**Files:**
- Modify: `app/api/cotizaciones.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_chain_locking.py`:

```python
import pytest
import random

def _make_cliente(client, token):
    r = client.post("/api/clientes/", json={"nombre": "Lock Test Cliente"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()["id"]


def _make_producto(client, token):
    r = client.post("/api/productos/", json={
        "nombre": "Lock Prod",
        "sku": f"LOCK-{random.randint(10000, 99999)}",
        "precio_venta": 1000,
        "precio_costo": 300,
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()


def _make_cotizacion(client, token, cliente_id, prod_id):
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cliente_id,
        "lineas": [{"orden": 1, "descripcion": "Ítem", "producto_id": prod_id,
                    "cantidad": 1, "valor_neto": 1000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()


def _make_nv_from_cot(client, token, cot_id):
    r = client.post(f"/api/nota_ventas/from_cotizacion/{cot_id}",
                    json={"retiro_en_conico": True},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _make_nv(client, token, cliente_id):
    r = client.post("/api/nota_ventas/", json={
        "cliente_id": cliente_id,
        "retiro_en_conico": True,
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()


def _make_factura_from_nv(client, token, nv_id):
    r = client.post(f"/api/facturas/from_nv/{nv_id}",
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


# ── Cotizacion locking ────────────────────────────────────────────────────────

def test_creating_nv_from_cotizacion_locks_cotizacion(client, admin_token):
    cid = _make_cliente(client, admin_token)
    prod = _make_producto(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"])
    assert cot["is_locked"] is False

    _make_nv_from_cot(client, admin_token, cot["id"])

    r = client.get(f"/api/cotizaciones/{cot['id']}",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.json()["is_locked"] is True


def test_patch_locked_cotizacion_returns_403(client, admin_token):
    cid = _make_cliente(client, admin_token)
    prod = _make_producto(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"])
    _make_nv_from_cot(client, admin_token, cot["id"])

    r = client.patch(f"/api/cotizaciones/{cot['id']}",
                     json={"nota": "intento editar"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 403


def test_put_lineas_locked_cotizacion_returns_403(client, admin_token):
    cid = _make_cliente(client, admin_token)
    prod = _make_producto(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"])
    _make_nv_from_cot(client, admin_token, cot["id"])

    r = client.put(f"/api/cotizaciones/{cot['id']}/lineas",
                   json=[{"orden": 1, "descripcion": "X", "cantidad": 1, "valor_neto": 500}],
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 403


def test_unlocked_cotizacion_is_still_editable(client, admin_token):
    cid = _make_cliente(client, admin_token)
    prod = _make_producto(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"])

    r = client.patch(f"/api/cotizaciones/{cot['id']}",
                     json={"nota": "edición válida"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/Otros/Conico/backend
pytest tests/test_chain_locking.py::test_patch_locked_cotizacion_returns_403 -v
```

Expected: FAIL (currently returns 200, not 403)

- [ ] **Step 3: Add guard to `actualizar_cotizacion`**

In `app/api/cotizaciones.py`, in `actualizar_cotizacion` (~line 403), after the `if not cot:` check, insert:

```python
    if cot.is_locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cotización bloqueada — se generó una NV desde ella")
```

- [ ] **Step 4: Add guard to `reemplazar_lineas` (cotizacion)**

In `app/api/cotizaciones.py`, in `reemplazar_lineas` (~line 444), after the `if not cot:` check, insert:

```python
    if cot.is_locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cotización bloqueada — se generó una NV desde ella")
```

- [ ] **Step 5: Run cotizacion guard tests**

```bash
pytest tests/test_chain_locking.py::test_patch_locked_cotizacion_returns_403 tests/test_chain_locking.py::test_put_lineas_locked_cotizacion_returns_403 tests/test_chain_locking.py::test_unlocked_cotizacion_is_still_editable -v
```

Expected: all PASS (but `test_creating_nv_from_cotizacion_locks_cotizacion` still fails — that's Task 4)

- [ ] **Step 6: Commit**

```bash
git add app/api/cotizaciones.py tests/test_chain_locking.py
git commit -m "feat: block PATCH on locked cotizaciones (403)"
```

---

## Task 4: Backend Guard + Lock Trigger — NotaVenta

**Files:**
- Modify: `app/api/nota_ventas.py`

- [ ] **Step 1: Add tests for NV locking (append to test_chain_locking.py)**

```python
# ── NotaVenta locking ─────────────────────────────────────────────────────────

def test_creating_factura_from_nv_locks_nv(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv = _make_nv(client, admin_token, cid)
    assert nv["is_locked"] is False

    _make_factura_from_nv(client, admin_token, nv["id"])

    r = client.get(f"/api/nota_ventas/{nv['id']}",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.json()["is_locked"] is True


def test_patch_locked_nv_returns_403(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv = _make_nv(client, admin_token, cid)
    _make_factura_from_nv(client, admin_token, nv["id"])

    r = client.patch(f"/api/nota_ventas/{nv['id']}",
                     json={"nota": "intento editar"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 403


def test_put_lineas_locked_nv_returns_403(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv = _make_nv(client, admin_token, cid)
    _make_factura_from_nv(client, admin_token, nv["id"])

    r = client.put(f"/api/nota_ventas/{nv['id']}/lineas",
                   json=[{"orden": 1, "descripcion": "X", "cantidad": 1, "valor_neto": 500}],
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 403


def test_unlocked_nv_is_still_editable(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv = _make_nv(client, admin_token, cid)

    r = client.patch(f"/api/nota_ventas/{nv['id']}",
                     json={"nota": "edición válida"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


def test_estado_change_works_on_locked_nv(client, admin_token):
    """Estado transitions must still work even when NV is locked."""
    cid = _make_cliente(client, admin_token)
    nv = _make_nv(client, admin_token, cid)
    _make_factura_from_nv(client, admin_token, nv["id"])

    r = client.patch(f"/api/nota_ventas/{nv['id']}/estado",
                     json={"estado": "despachada"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_chain_locking.py::test_patch_locked_nv_returns_403 -v
```

Expected: FAIL

- [ ] **Step 3: Add guard to `actualizar_nv`**

In `app/api/nota_ventas.py`, in `actualizar_nv` (~line 381), after the `if not nv:` check, insert:

```python
    if nv.is_locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Nota de venta bloqueada — se generó una Factura desde ella")
```

- [ ] **Step 4: Add guard to `reemplazar_lineas` (NV)**

In `app/api/nota_ventas.py`, in `reemplazar_lineas` (~line 404), after the `if not nv:` check, insert:

```python
    if nv.is_locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Nota de venta bloqueada — se generó una Factura desde ella")
```

- [ ] **Step 5: Add lock trigger in `crear_nv_desde_cotizacion`**

In `app/api/nota_ventas.py`, in `crear_nv_desde_cotizacion` (~line 363), after:
```python
    cot.estado = "cerrada_fv"
```
add:
```python
    cot.is_locked = True
```

- [ ] **Step 6: Run NV + cotizacion tests**

```bash
pytest tests/test_chain_locking.py -v -k "not factura"
```

Expected: all PASS (cotizacion lock tests + NV guard tests pass; NV lock trigger tests still depend on factura creation)

- [ ] **Step 7: Commit**

```bash
git add app/api/nota_ventas.py tests/test_chain_locking.py
git commit -m "feat: block PATCH on locked NVs and lock cotizacion when NV is created"
```

---

## Task 5: Factura — Always 403 on PATCH + NV Lock Trigger

**Files:**
- Modify: `app/api/facturas.py`

- [ ] **Step 1: Add factura tests (append to test_chain_locking.py)**

```python
# ── Factura locking ───────────────────────────────────────────────────────────

def test_patch_factura_always_returns_403(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv = _make_nv(client, admin_token, cid)
    factura = _make_factura_from_nv(client, admin_token, nv["id"])

    r = client.patch(f"/api/facturas/{factura['id']}",
                     json={"nota": "intento editar"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 403


def test_put_lineas_factura_always_returns_403(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv = _make_nv(client, admin_token, cid)
    factura = _make_factura_from_nv(client, admin_token, nv["id"])

    r = client.put(f"/api/facturas/{factura['id']}/lineas",
                   json=[{"orden": 1, "descripcion": "X", "cantidad": 1, "valor_neto": 500}],
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 403


def test_factura_estado_change_still_works(client, admin_token):
    """Estado transitions must still work even though field edits are blocked."""
    cid = _make_cliente(client, admin_token)
    nv = _make_nv(client, admin_token, cid)
    factura = _make_factura_from_nv(client, admin_token, nv["id"])

    r = client.patch(f"/api/facturas/{factura['id']}/estado",
                     json={"estado": "pagada", "fecha_pago": "2026-04-22",
                           "monto_pagado": factura["total"], "metodo_pago": "transferencia"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


def test_factura_is_locked_true_in_response(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv = _make_nv(client, admin_token, cid)
    factura = _make_factura_from_nv(client, admin_token, nv["id"])
    assert factura["is_locked"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_chain_locking.py::test_patch_factura_always_returns_403 -v
```

Expected: FAIL (currently returns 200)

- [ ] **Step 3: Replace body of `actualizar_factura` with always-403**

In `app/api/facturas.py`, replace the entire body of `actualizar_factura` (lines ~441-447) with:

```python
@router.patch("/{factura_id}", response_model=FacturaOut)
def actualizar_factura(
    factura_id: int,
    body: FacturaUpdate,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    _, db = perms
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Las facturas no son editables una vez emitidas")
```

- [ ] **Step 4: Replace body of `reemplazar_lineas` (factura) with always-403**

In `app/api/facturas.py`, replace the entire body of `reemplazar_lineas` (the one for facturas, lines ~449-463) with:

```python
@router.put("/{factura_id}/lineas", response_model=FacturaOut)
def reemplazar_lineas(
    factura_id: int,
    lineas_data: list[FacturaLineaCreate],
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    _, db = perms
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Las facturas no son editables una vez emitidas")
```

- [ ] **Step 5: Add NV lock trigger in `crear_factura_desde_nv`**

In `app/api/facturas.py`, in `crear_factura_desde_nv` (~line 380), after `_recalcular_totales(factura)` and before `db.commit()`, insert:

```python
    nv.is_locked = True
```

- [ ] **Step 6: Add NV lock trigger in `crear_factura` (manual creation)**

In `app/api/facturas.py`, in `crear_factura` (~line 327), after `_recalcular_totales(factura)` and before `db.commit()`, insert:

```python
    if body.nv_id:
        nv_to_lock = db.get(NotaVenta, body.nv_id)
        if nv_to_lock:
            nv_to_lock.is_locked = True
```

Ensure `NotaVenta` is imported at the top of `facturas.py`. Check imports — if not present, add:
```python
from app.models.nota_venta import NotaVenta
```

- [ ] **Step 7: Run all locking tests**

```bash
pytest tests/test_chain_locking.py -v
```

Expected: all PASS

- [ ] **Step 8: Run full test suite to check for regressions**

```bash
pytest --tb=short -q
```

Expected: all PASS (no regressions)

- [ ] **Step 9: Commit**

```bash
git add app/api/facturas.py tests/test_chain_locking.py
git commit -m "feat: factura PATCH always 403, lock NV when factura is created"
```

---

## Task 6: Frontend — CotizacionDetalle Locked State

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Derive `isLocked` from cotizacion data**

In `CotizacionDetalle.tsx`, find where `cotizacion` data is accessed (around the `useQuery` for cotizacion, typically early in the component). Add this derived value near other computed values:

```tsx
const isLocked = cotizacion?.is_locked ?? false
```

- [ ] **Step 2: Add locked banner**

Find the top of the form/content area (after the page header, before the first form field). Add:

```tsx
{isLocked && (
  <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
    Este documento está bloqueado — se generó una Nota de Venta desde esta cotización.
  </div>
)}
```

- [ ] **Step 3: Disable all form inputs when locked**

For every `<input>`, `<select>`, `<textarea>` in the form that currently lacks a `disabled` prop, add `disabled={isLocked}`. For those that already have a `disabled` condition, add `|| isLocked`:

Examples:
```tsx
// Date input (~line 896)
<input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
  disabled={isLocked}
  ...
/>

// Linea descripcion input (~line 1006)
<input type="text" value={linea.descripcion}
  disabled={isLocked}
  ...
/>

// Linea cantidad input (~line 1025)
<input type="number" min="1" value={linea.cantidad}
  disabled={isLocked}
  ...
/>
```

Apply `disabled={isLocked}` to ALL inputs/selects/textareas in the component. The terminos_pago field already handles `empresaSinCredito` — add `|| isLocked` to any existing disabled condition there.

- [ ] **Step 4: Hide save/edit buttons when locked**

Find the save button(s) and wrap with `{!isLocked && ...}` or add `disabled={isLocked}`. Hide "Guardar" / "Crear NV" when locked. Estado-change buttons are NOT affected.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /c/Otros/Conico/frontend
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: show locked banner and disable fields in CotizacionDetalle"
```

---

## Task 7: Frontend — NotaVentaDetalle Locked State + Terminos Pago Display

**Files:**
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

- [ ] **Step 1: Derive `isLocked` from NV data**

In `NotaVentaDetalle.tsx`, after the NV query and computed values (~line 215), add:

```tsx
const isLocked = nv?.is_locked ?? false
```

- [ ] **Step 2: Add locked banner**

After the page header, before the first form field, add:

```tsx
{isLocked && (
  <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
    Este documento está bloqueado — se generó una Factura desde esta nota de venta.
  </div>
)}
```

- [ ] **Step 3: Disable all form inputs when locked**

Same pattern as Task 6, Step 3. Add `disabled={isLocked}` to every `<input>`, `<select>`, `<textarea>` in the form. For inputs that already have a condition (like the retiro/despacho logic), add `|| isLocked`.

- [ ] **Step 4: Hide save buttons when locked**

The save buttons are around line 536 (`onClick={handleSave}`). Wrap with `{!isLocked && ...}` or add `disabled={isLocked}`.

- [ ] **Step 5: Add terminos_pago display**

`NVDetalle` sends `terminos_pago` to the backend (`doSave` line 343) but doesn't show a field. Add a read-only display after the empresa selector:

```tsx
{empresaId !== '' && (
  <div>
    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
      Términos de pago
    </label>
    {empresaSinCredito ? (
      <>
        <div className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 cursor-not-allowed">
          Al contado
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Esta empresa no tiene línea de crédito.
        </p>
      </>
    ) : (
      <div className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
        {nv?.terminos_pago ?? '—'}
      </div>
    )}
  </div>
)}
```

This is read-only (no onChange) — the user cannot change it directly; it reflects what's saved on the NV.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/NotaVentaDetalle.tsx
git commit -m "feat: locked banner, disabled fields, and terminos_pago display in NVDetalle"
```

---

## Task 8: Frontend — FacturaDetalle Locked State

**Files:**
- Modify: `frontend/src/pages/FacturaDetalle.tsx`

- [ ] **Step 1: Add locked banner (always shown)**

`is_locked` is always `true` for Factura (from schema default). Add the banner at the top of the content area:

```tsx
{factura?.is_locked && (
  <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
    Las facturas no son editables una vez emitidas.
  </div>
)}
```

- [ ] **Step 2: Hide the edit button**

Find the "Editar" button in `FacturaDetalle`. It's gated by `editing` state and some role check. Add an additional condition:

```tsx
{!factura?.is_locked && (
  // the existing edit button JSX
)}
```

Since `factura?.is_locked` is always `true`, this effectively hides the edit button permanently. This is intentional — Factura fields are never editable.

Note: Do NOT hide the estado-change buttons (pagada, anular). Those are separate from the edit button.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/FacturaDetalle.tsx
git commit -m "feat: always show locked banner and hide edit button in FacturaDetalle"
```

---

## Self-Review Checklist

- [ ] Spec coverage: all 3 locking triggers (cot→NV, NV→Factura, Factura always) ✓
- [ ] Spec coverage: forzar contado UI in Cotizacion (existing code) and NV (Task 7 Step 5) ✓  
- [ ] Estado transitions not blocked (only field/line PATCH endpoints are blocked) ✓
- [ ] Lock is permanent (no unlock path exists) ✓
- [ ] Admin has no bypass (guards fire before role checks) ✓
- [ ] `crear_factura` manual path also locks NV if `nv_id` is set ✓
- [ ] TypeScript types updated for all 3 models ✓
- [ ] No placeholder code or TBDs in any task ✓
