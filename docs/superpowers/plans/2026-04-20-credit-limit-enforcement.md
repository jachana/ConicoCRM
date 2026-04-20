# Credit Limit Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn sellers (non-blocking) when a cotización exceeds a client empresa's credit limit, and hard-block NV creation with a mandatory admin password when the limit is exceeded.

**Architecture:** Two new backend endpoints (credit check + admin password verify). One shared frontend modal component handles both modes. Credit check is injected before save in both CotizacionDetalle (warning) and NotaVentaDetalle + Crear NV (block).

**Tech Stack:** FastAPI, SQLAlchemy, React, TypeScript, Axios (via `api` lib), TanStack Query

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/schemas/empresa.py` | Modify | Add `EmpresaCreditoOut` schema |
| `backend/app/schemas/auth.py` | Modify | Add `VerifyAdminRequest` schema |
| `backend/app/api/empresas.py` | Modify | Add `GET /{empresa_id}/credito` endpoint |
| `backend/app/api/auth.py` | Modify | Add `POST /verify-admin` endpoint |
| `frontend/src/components/CreditWarningModal.tsx` | Create | Shared modal for warning and block modes |
| `frontend/src/pages/CotizacionDetalle.tsx` | Modify | Credit check on save (warning) and Crear NV (block) |
| `frontend/src/pages/NotaVentaDetalle.tsx` | Modify | Credit check on save (block) |

---

## Task 1: Backend schema additions

**Files:**
- Modify: `backend/app/schemas/empresa.py`
- Modify: `backend/app/schemas/auth.py`

- [ ] **Step 1: Add `EmpresaCreditoOut` to empresa schemas**

Open `backend/app/schemas/empresa.py` and add at the end:

```python
class EmpresaCreditoOut(BaseModel):
    limite_credito: Decimal | None
    credito_usado: Decimal | None
    credito_disponible: Decimal | None
```

- [ ] **Step 2: Add `VerifyAdminRequest` to auth schemas**

Open `backend/app/schemas/auth.py` and add at the end:

```python
class VerifyAdminRequest(BaseModel):
    password: str
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/empresa.py backend/app/schemas/auth.py
git commit -m "feat: add EmpresaCreditoOut and VerifyAdminRequest schemas"
```

---

## Task 2: Backend – GET /api/empresas/{id}/credito

**Files:**
- Modify: `backend/app/api/empresas.py`

`credito_usado` = sum of `(factura.total - factura.monto_pagado)` for facturas where `empresa_id` matches, `estado != "anulada"`, and the balance is positive. Factura has a direct `empresa_id` column — no join needed.

- [ ] **Step 1: Add import for `EmpresaCreditoOut`**

In `backend/app/api/empresas.py`, update the schemas import line (currently line 14):

```python
from app.schemas.empresa import EmpresaCreate, EmpresaDeudaOut, EmpresaCreditoOut, EmpresaOut, EmpresaUpdate, FacturaResumen
```

- [ ] **Step 2: Add the endpoint**

Add this route **before** `@router.get("/{empresa_id}")` (currently line 112) to avoid the catch-all path swallowing `/credito`:

```python
@router.get("/{empresa_id}/credito", response_model=EmpresaCreditoOut)
def credito_empresa(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    if e.limite_credito is None:
        return EmpresaCreditoOut(limite_credito=None, credito_usado=None, credito_disponible=None)
    from decimal import Decimal as D
    facturas = (
        db.query(Factura)
        .filter(Factura.empresa_id == empresa_id, Factura.estado != "anulada")
        .all()
    )
    credito_usado = sum(
        (f.total - (f.monto_pagado or D("0")) for f in facturas
         if f.total - (f.monto_pagado or D("0")) > 0),
        D("0"),
    )
    credito_disponible = e.limite_credito - credito_usado
    return EmpresaCreditoOut(
        limite_credito=e.limite_credito,
        credito_usado=credito_usado,
        credito_disponible=credito_disponible,
    )
```

- [ ] **Step 3: Verify the server starts**

```bash
cd backend && uvicorn app.main:app --reload
```

Expected: server starts, no import errors. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/empresas.py
git commit -m "feat: add GET /api/empresas/{id}/credito endpoint"
```

---

## Task 3: Backend – POST /api/auth/verify-admin

**Files:**
- Modify: `backend/app/api/auth.py`

The endpoint uses the existing `get_current_user` dependency (reads the JWT from the request) and the existing `verify_password` utility.

- [ ] **Step 1: Add `VerifyAdminRequest` import**

In `backend/app/api/auth.py`, update the schemas import (currently line 6):

```python
from app.schemas.auth import Token, RefreshRequest, VerifyAdminRequest
```

- [ ] **Step 2: Add the endpoint**

Append to `backend/app/api/auth.py`:

```python
@router.post("/verify-admin", status_code=status.HTTP_200_OK)
def verify_admin(
    body: VerifyAdminRequest,
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")
    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contraseña incorrecta")
    return {"ok": True}
```

- [ ] **Step 3: Verify the server starts**

```bash
cd backend && uvicorn app.main:app --reload
```

Expected: server starts cleanly. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/auth.py
git commit -m "feat: add POST /api/auth/verify-admin endpoint"
```

---

## Task 4: Frontend – CreditWarningModal component

**Files:**
- Create: `frontend/src/components/CreditWarningModal.tsx`

One component, two modes:
- `"warning"`: shows credit breakdown + "Guardar de todas formas" + "Cancelar"
- `"block"`: shows credit breakdown + password field + "Autorizar (Admin)" + "Cancelar". Calls `POST /api/auth/verify-admin` internally.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/CreditWarningModal.tsx`:

```tsx
import { useState } from 'react'
import { api } from '../lib/api'

export interface CreditoInfo {
  limite_credito: number
  credito_usado: number
  credito_disponible: number
}

interface CreditWarningModalProps {
  mode: 'warning' | 'block'
  empresaNombre: string
  credito: CreditoInfo
  saleTotal: number
  onConfirm: () => void
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
  onCancel,
}: CreditWarningModalProps) {
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [verifying, setVerifying] = useState(false)

  async function handleAuthorize() {
    setVerifying(true)
    setAuthError('')
    try {
      await api.post('/api/auth/verify-admin', { password })
      onConfirm()
    } catch (err: any) {
      setAuthError(err?.response?.data?.detail || 'Error al verificar')
    } finally {
      setVerifying(false)
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

        {mode === 'warning' ? (
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
        ) : (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Se requiere autorización de administrador para continuar.
            </p>
            <div className="mb-3">
              <input
                type="password"
                placeholder="Contraseña de administrador"
                value={password}
                onChange={e => { setPassword(e.target.value); setAuthError('') }}
                onKeyDown={e => e.key === 'Enter' && !verifying && password && handleAuthorize()}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              {authError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{authError}</p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAuthorize}
                disabled={verifying || !password}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                {verifying ? 'Verificando...' : 'Autorizar (Admin)'}
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
git commit -m "feat: add CreditWarningModal component"
```

---

## Task 5: Frontend – Credit check in CotizacionDetalle

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

Two credit check points:
1. **Save (warning mode):** wrap `handleSave` to call `checkCredit` first.
2. **Crear NV (block mode):** intercept the "Crear NV" button to call `checkCredit` before mutating.

- [ ] **Step 1: Add CreditWarningModal import**

At the top of `frontend/src/pages/CotizacionDetalle.tsx`, after the existing imports, add:

```tsx
import CreditWarningModal, { type CreditoInfo } from '../components/CreditWarningModal'
```

- [ ] **Step 2: Add creditModal state**

In the component body, after the existing `useState` declarations (around line 76), add:

```tsx
const [creditModal, setCreditModal] = useState<{
  mode: 'warning' | 'block'
  credito: CreditoInfo
  onConfirm: () => void
} | null>(null)
```

- [ ] **Step 3: Add `checkCredit` helper**

Add this function after `removeLinea` (around line 198), before `handleSave`:

```tsx
async function checkCredit(saleTotal: number, mode: 'warning' | 'block', onProceed: () => void) {
  if (!empresaId) { onProceed(); return }
  const empresa = empresas.find(e => e.id === empresaId)
  if (!empresa?.limite_credito) { onProceed(); return }
  try {
    const res = await api.get<CreditoInfo>(`/api/empresas/${empresaId}/credito`)
    const credito = res.data
    if (credito.credito_disponible !== null && Number(credito.credito_disponible) < saleTotal) {
      setCreditModal({
        mode,
        credito,
        onConfirm: () => { setCreditModal(null); onProceed() },
      })
    } else {
      onProceed()
    }
  } catch {
    onProceed()
  }
}
```

- [ ] **Step 4: Refactor `handleSave` to use `checkCredit`**

Replace the existing `handleSave` function (lines 205–246) with:

```tsx
async function handleSave() {
  if (!clienteId) { setError('Selecciona un cliente'); return }
  checkCredit(total, 'warning', doSave)
}

async function doSave() {
  setSaving(true)
  setError('')
  try {
    const payload = {
      cliente_id: clienteId,
      vendedor_id: vendedorId || currentUser?.id,
      contacto: contacto || null,
      correo: correo || null,
      fecha,
      estado,
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

    let cotId: number
    if (isNew) {
      const res = await api.post<Cotizacion>('/api/cotizaciones/', { ...payload, lineas: lineasPayload })
      cotId = res.data.id
    } else {
      await api.patch(`/api/cotizaciones/${id}`, payload)
      await api.put(`/api/cotizaciones/${id}/lineas`, lineasPayload)
      cotId = Number(id)
    }
    qc.invalidateQueries({ queryKey: ['cotizaciones'] })
    navigate(`/cotizaciones/${cotId}`)
  } catch (err: any) {
    setError(err?.response?.data?.detail || 'Error al guardar')
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 5: Intercept "Crear NV" button with credit check**

Find the "Crear NV" button (around line 300–306):

```tsx
<button
  onClick={() => crearNvMut.mutate()}
  disabled={crearNvMut.isPending}
  ...
>
```

Replace `onClick` with:

```tsx
onClick={() => checkCredit(total, 'block', () => crearNvMut.mutate())}
```

- [ ] **Step 6: Render CreditWarningModal**

At the end of the return JSX (just before the closing `</div>` of the outermost container), add:

```tsx
{creditModal && (
  <CreditWarningModal
    mode={creditModal.mode}
    empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
    credito={creditModal.credito}
    saleTotal={total}
    onConfirm={creditModal.onConfirm}
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
git commit -m "feat: add credit limit check to CotizacionDetalle"
```

---

## Task 6: Frontend – Credit check in NotaVentaDetalle

**Files:**
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

Same pattern as CotizacionDetalle but only one check point (save), always in `'block'` mode.

- [ ] **Step 1: Add CreditWarningModal import**

At the top of `frontend/src/pages/NotaVentaDetalle.tsx`, after the existing imports, add:

```tsx
import CreditWarningModal, { type CreditoInfo } from '../components/CreditWarningModal'
```

- [ ] **Step 2: Add creditModal state**

In the component body, after the existing `useState` declarations (around line 88), add:

```tsx
const [creditModal, setCreditModal] = useState<{
  credito: CreditoInfo
  onConfirm: () => void
} | null>(null)
```

- [ ] **Step 3: Add `checkCredit` helper**

Add this function before `handleSave` (around line 199):

```tsx
async function checkCredit(saleTotal: number, onProceed: () => void) {
  if (!empresaId) { onProceed(); return }
  const empresa = empresas.find(e => e.id === empresaId)
  if (!empresa?.limite_credito) { onProceed(); return }
  try {
    const res = await api.get<CreditoInfo>(`/api/empresas/${empresaId}/credito`)
    const credito = res.data
    if (credito.credito_disponible !== null && Number(credito.credito_disponible) < saleTotal) {
      setCreditModal({
        credito,
        onConfirm: () => { setCreditModal(null); onProceed() },
      })
    } else {
      onProceed()
    }
  } catch {
    onProceed()
  }
}
```

- [ ] **Step 4: Refactor `handleSave` to use `checkCredit`**

Replace the existing `handleSave` function (lines 199–238) with:

```tsx
async function handleSave() {
  if (!clienteId) { setError('Selecciona un cliente'); return }
  checkCredit(total, doSave)
}

async function doSave() {
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
```

- [ ] **Step 5: Render CreditWarningModal**

At the end of the return JSX (just before the closing `</div>` of the outermost container), add:

```tsx
{creditModal && (
  <CreditWarningModal
    mode="block"
    empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
    credito={creditModal.credito}
    saleTotal={total}
    onConfirm={creditModal.onConfirm}
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
git commit -m "feat: add credit limit block to NotaVentaDetalle"
```

---

## Task 7: Manual smoke test

- [ ] **Step 1: Set a credit limit on a test empresa**

In the app, go to an Empresa and set `limite_credito` to a small value (e.g., $1,000).

- [ ] **Step 2: Test cotizacion warning**

Create a cotizacion for a client in that empresa with total > $1,000. Click "Guardar". Confirm the warning modal appears. Click "Guardar de todas formas" — cotizacion should save. Repeat and click "Cancelar" — cotizacion should NOT save.

- [ ] **Step 3: Test NV hard block from CotizacionDetalle**

On the saved cotizacion above, click "Crear NV". Confirm the block modal appears with password field. Enter a wrong password — should show "Contraseña incorrecta". Enter correct admin password — NV should be created.

- [ ] **Step 4: Test NV hard block from NotaVentaDetalle**

Create a new NV directly for a client over their credit limit. Click "Guardar". Confirm block modal appears. Authorize with admin password — NV should save.

- [ ] **Step 5: Test empresa with no credit limit**

For an empresa with `limite_credito` = null, create a cotizacion or NV for any amount. No modal should appear.
