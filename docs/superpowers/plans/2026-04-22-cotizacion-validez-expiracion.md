# Cotización — Validez y Expiración Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show expiration date on cotizaciones, warn users when expired, and block NV creation from expired cotizaciones.

**Architecture:** Add `fecha_expiracion` as a Pydantic `computed_field` (never stored) to `CotizacionOut`. Backend guards the `from_cotizacion` NV endpoint with a 409 if expired. Frontend reads `fecha_expiracion` from the API, shows an amber banner when expired (only when not locked), and disables the Crear NV button with a tooltip.

**Tech Stack:** FastAPI + Pydantic v2 (backend), React + TypeScript + TanStack Query (frontend)

---

### Task 1: Backend — `fecha_expiracion` computed field in schema

**Files:**
- Modify: `backend/app/schemas/cotizacion.py`
- Test: `backend/tests/test_cotizacion_extras.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_cotizacion_extras.py`:

```python
def test_fecha_expiracion_en_response(client, admin_token, db):
    from datetime import date, timedelta
    c, u = _make_cliente_vendedor(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "validez_dias": 7, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    expected = (date.today() + timedelta(days=7)).isoformat()
    assert data["fecha_expiracion"] == expected


def test_fecha_expiracion_default_5_dias(client, admin_token, db):
    from datetime import date, timedelta
    c, u = _make_cliente_vendedor(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    expected = (date.today() + timedelta(days=5)).isoformat()
    assert data["fecha_expiracion"] == expected
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_cotizacion_extras.py::test_fecha_expiracion_en_response tests/test_cotizacion_extras.py::test_fecha_expiracion_default_5_dias -v
```

Expected: FAIL — `KeyError: 'fecha_expiracion'`

- [ ] **Step 3: Add `fecha_expiracion` to `CotizacionOut`**

In `backend/app/schemas/cotizacion.py`, update imports at top:

```python
from datetime import date, datetime, timedelta
from decimal import Decimal
from pydantic import BaseModel, computed_field
from app.schemas.empresa import EmpresaRef
```

Then add the computed field to `CotizacionOut` (after `is_locked`):

```python
class CotizacionOut(BaseModel):
    id: int
    numero: int
    cliente_id: int
    vendedor_id: int
    contacto: str | None = None
    fecha: date
    estado: str
    nota: str | None = None
    terminos_pago: str | None = None
    terminos_pago_estado: str = "aprobado"
    validez_dias: int = 5
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    lineas: list[CotizacionLineaOut] = []
    is_locked: bool = False
    model_config = {"from_attributes": True}

    @computed_field
    @property
    def fecha_expiracion(self) -> date:
        return self.fecha + timedelta(days=self.validez_dias)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_cotizacion_extras.py::test_fecha_expiracion_en_response tests/test_cotizacion_extras.py::test_fecha_expiracion_default_5_dias -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/cotizacion.py backend/tests/test_cotizacion_extras.py
git commit -m "feat: add fecha_expiracion computed field to CotizacionOut"
```

---

### Task 2: Backend — guard NV creation from expired cotizaciones

**Files:**
- Modify: `backend/app/api/nota_ventas.py`
- Test: `backend/tests/test_nota_ventas.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_nota_ventas.py` (after `test_crear_nv_desde_cotizacion_404`):

```python
def test_crear_nv_desde_cotizacion_expirada(client, admin_token):
    from datetime import date, timedelta
    cid = _make_cliente(client, admin_token)
    # Create cotizacion with fecha 10 days ago and validez_dias=5 → expired
    r = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": cid,
            "fecha": (date.today() - timedelta(days=10)).isoformat(),
            "validez_dias": 5,
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    cot_id = r.json()["id"]
    r2 = client.post(
        f"/api/nota_ventas/from_cotizacion/{cot_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 409
    assert "expirada" in r2.json()["detail"].lower()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_nota_ventas.py::test_crear_nv_desde_cotizacion_expirada -v
```

Expected: FAIL — returns 201 instead of 409

- [ ] **Step 3: Add expiration guard in `crear_nv_desde_cotizacion`**

In `backend/app/api/nota_ventas.py`, first update the top-level datetime import (line 2) to include `timedelta`:

```python
from datetime import date, datetime, timedelta, timezone
```

Then locate `crear_nv_desde_cotizacion` and add the expiration check right after the `cerrada_fv` check (around line 318):

```python
    if cot.estado == "cerrada_fv":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La cotización ya está cerrada (ya tiene una nota de venta generada)",
        )
    if date.today() > cot.fecha + timedelta(days=cot.validez_dias):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cotización expirada. Cambie la fecha de emisión para generar una NV.",
        )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_nota_ventas.py::test_crear_nv_desde_cotizacion_expirada -v
```

Expected: PASS

- [ ] **Step 5: Run full NV test suite to check for regressions**

```bash
cd backend && python -m pytest tests/test_nota_ventas.py -v
```

Expected: all existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/nota_ventas.py backend/tests/test_nota_ventas.py
git commit -m "feat: block NV creation from expired cotizacion (409)"
```

---

### Task 3: Frontend — type, expiration logic, banner, and Crear NV button

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Add `fecha_expiracion` to `Cotizacion` type**

In `frontend/src/types/index.ts`, update the `Cotizacion` interface to include the new field:

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
  estado: 'no_definido' | 'abierta' | 'aprobada' | 'cerrada_fv' | 'rechazada'
  nota: string | null
  terminos_pago: string | null
  terminos_pago_estado: string
  validez_dias: number
  fecha_expiracion: string        // YYYY-MM-DD, computed by backend
  correo: string | null
  total_neto: number
  total_iva: number
  total: number
  margen_total?: number | null
  created_at: string
  updated_at: string
  cliente?: { id: number; nombre: string; rut: string | null; email: string | null; telefono: string | null }
  vendedor?: { id: number; name: string; email: string }
  lineas?: CotizacionLinea[]
  is_locked?: boolean
}
```

- [ ] **Step 2: Add `isExpired` derived variable in `CotizacionDetalle.tsx`**

In `frontend/src/pages/CotizacionDetalle.tsx`, find the line:

```typescript
  const isLocked = cotizacion?.is_locked ?? false
```

Add directly after it:

```typescript
  const isExpired = cotizacion != null
    && cotizacion.fecha_expiracion < new Date().toISOString().slice(0, 10)
```

- [ ] **Step 3: Add expiration banner**

In `CotizacionDetalle.tsx`, find the locked banner block:

```tsx
      {isLocked && (
        <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
          Este documento está bloqueado — se generó una Nota de Venta desde esta cotización.
        </div>
```

Add the expiration banner immediately **before** the locked banner:

```tsx
      {isExpired && !isLocked && (
        <div className="mb-4 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
          Esta cotización está expirada. Cambie la fecha de emisión para poder generar una NV.
        </div>
      )}
      {isLocked && (
```

- [ ] **Step 4: Update "Vence:" label to use `fecha_expiracion` from API**

In `CotizacionDetalle.tsx`, find the existing "Vence:" display (around line 994):

```tsx
            {cotizacion?.fecha && (
              <p className="text-xs text-gray-400 mt-1">
                Vence:{' '}
                {(() => { const d = new Date(cotizacion.fecha + 'T00:00:00'); d.setDate(d.getDate() + validezDias); return d.toLocaleDateString('es-CL') })()}
              </p>
            )}
```

Replace with:

```tsx
            {cotizacion?.fecha_expiracion && (
              <p className={`text-xs mt-1 ${isExpired ? 'text-orange-500 dark:text-orange-400 font-medium' : 'text-gray-400'}`}>
                Válido hasta:{' '}
                {new Date(cotizacion.fecha_expiracion + 'T00:00:00').toLocaleDateString('es-CL')}
              </p>
            )}
```

- [ ] **Step 5: Disable Crear NV button when expired**

In `CotizacionDetalle.tsx`, find the Crear NV button (around line 712):

```tsx
              <button
                onClick={() => checkCredit(total, 'request', () => crearNvMut.mutate(), { empresa_id: Number(empresaId), total, origen: 'cotizacion', cotizacion_id: Number(id) })}
                disabled={crearNvMut.isPending || lineasErrors.length > 0 || isDirty || cotizacion?.estado === 'cerrada_fv'}
                title={
                  cotizacion?.estado === 'cerrada_fv' ? 'Ya existe una nota de venta para esta cotización'
                  : lineasErrors.length > 0 ? lineasErrors.join(' | ')
                  : isDirty ? 'Guarda los cambios antes de crear la NV'
                  : undefined
                }
```

Replace with:

```tsx
              <button
                onClick={() => checkCredit(total, 'request', () => crearNvMut.mutate(), { empresa_id: Number(empresaId), total, origen: 'cotizacion', cotizacion_id: Number(id) })}
                disabled={crearNvMut.isPending || lineasErrors.length > 0 || isDirty || cotizacion?.estado === 'cerrada_fv' || isExpired}
                title={
                  cotizacion?.estado === 'cerrada_fv' ? 'Ya existe una nota de venta para esta cotización'
                  : isExpired ? 'Cotización expirada — cambie la fecha de emisión'
                  : lineasErrors.length > 0 ? lineasErrors.join(' | ')
                  : isDirty ? 'Guarda los cambios antes de crear la NV'
                  : undefined
                }
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: expiration banner and disabled NV button in CotizacionDetalle"
```

---

### Task 4: Verify full flow

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && python -m pytest tests/test_cotizacion_extras.py tests/test_nota_ventas.py -v
```

Expected: all PASS

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit if clean**

No new files — just confirm the build is clean. No commit needed.
