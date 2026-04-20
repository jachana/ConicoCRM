# Credit Approval Request Design

**Date:** 2026-04-20  
**Status:** Approved  
**Supersedes:** `2026-04-20-credit-limit-enforcement-design.md` (NV block section only — cotizacion warning is unchanged)

## Overview

When creating a NV would exceed an empresa's credit limit, the vendor submits an approval request. An admin approves or denies from a dedicated "Aprobaciones" tab. If approved, the NV is auto-created and the vendor is redirected. If denied, the vendor sees an error and stays on their form.

Cotizacion save: non-blocking warning only (unchanged from original spec). Seller can proceed without approval.

## Credit Calculation

Unchanged: `credito_usado = sum(factura.total - factura.monto_pagado)` for non-anulada facturas linked to that empresa. Endpoint: `GET /api/empresas/{id}/credito`.

## Data Model: AprobacionCredito

```python
class AprobacionCredito(Base):
    __tablename__ = "aprobaciones_credito"
    id: int (PK)
    vendedor_id: int (FK users.id, SET NULL on delete)
    empresa_id: int (FK empresas.id, SET NULL on delete)
    total: Decimal(12,2)
    nota: str | None
    estado: str  # "pendiente" | "aprobada" | "denegada"
    origen: str  # "cotizacion" | "directa"
    cotizacion_id: int | None  # populated when origen="cotizacion"
    nv_payload: JSON | None    # populated when origen="directa"
    nv_id: int | None (FK nota_ventas.id, SET NULL on delete)  # set on approval
    created_at: datetime
    updated_at: datetime
```

## Backend Endpoints

### `POST /api/aprobaciones/`
Vendor creates a request. Requires auth.

**Body:**
```json
{
  "empresa_id": 1,
  "total": 5000000,
  "nota": "Cliente urgente, necesita despacho hoy",
  "origen": "cotizacion",
  "cotizacion_id": 42,
  "nv_payload": null
}
```
Or for direct NV:
```json
{
  "empresa_id": 1,
  "total": 5000000,
  "nota": null,
  "origen": "directa",
  "cotizacion_id": null,
  "nv_payload": { "cliente_id": 3, "vendedor_id": 1, "contacto": "...", "correo": "...", "fecha": "2026-04-20", "nota": null, "empresa_id": 1, "lineas": [...] }
}
```
Sets `estado="pendiente"`, `vendedor_id=current_user.id`.
Returns `AprobacionOut` (includes `id` for polling).

### `GET /api/aprobaciones/`
- Admin/subadmin: returns all pending requests
- Vendedor: returns their own requests (any estado)
Requires auth.

### `GET /api/aprobaciones/{id}`
Returns single request. Used by vendor frontend for polling.
Requires auth. Vendor can only get their own requests.

### `PATCH /api/aprobaciones/{id}`
Admin/subadmin only. Body: `{ "accion": "aprobar" | "denegar" }`.

**On "aprobar":**
- If `origen="cotizacion"`: runs from_cotizacion logic (copies lines, closes cotizacion, registers stock movements), stores resulting NV id in `nv_id`
- If `origen="directa"`: creates NV from stored `nv_payload`, stores resulting NV id in `nv_id`
- Sets `estado="aprobada"`

**On "denegar":**
- Sets `estado="denegada"`

Returns updated `AprobacionOut`.

## Frontend — CreditWarningModal (revised)

Modes: `"warning"` (unchanged) | `"request"` (replaces "block").

**Request mode flow:**
1. Shows credit breakdown (unchanged)
2. Optional note textarea
3. "Solicitar Aprobación" button → POST /api/aprobaciones/ with payload + nota
4. Transitions to waiting state: spinner + "Esperando aprobación del administrador..."
5. Cancel button exits waiting state and closes modal (request stays in DB but vendedor abandons wait)
6. Polls `GET /api/aprobaciones/{id}` every 3 seconds
7. `estado="aprobada"` → calls `onApproved(nv_id)` (parent navigates to NV)
8. `estado="denegada"` → calls `onDenied()` (modal closes, parent shows error)

**Props:**
```tsx
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

interface AprobacionPayload {
  empresa_id: number
  total: number
  origen: 'cotizacion' | 'directa'
  cotizacion_id?: number
  nv_payload?: object
}
```

## Frontend — CotizacionDetalle (updated)

**Crear NV click:** `checkCredit(total, 'request', cotizacionPayload)` where `cotizacionPayload = { empresa_id: empresaId, total, origen: 'cotizacion', cotizacion_id: Number(id) }`.

**Save click:** unchanged — warning mode, seller can proceed.

On `onApproved(nvId)`: navigate to `/notas-venta/${nvId}`.

## Frontend — NotaVentaDetalle (updated)

**Save click:** `checkCredit(total, 'request', directaPayload)` where `directaPayload` is built from form state (cliente_id, vendedor_id, contacto, correo, fecha, nota, empresa_id, lineas).

On `onApproved(nvId)`: navigate to `/notas-venta/${nvId}`.

## Frontend — Aprobaciones Page (`/aprobaciones`)

Admin/subadmin only page. Shows pending approval requests in a list:
- Empresa nombre, vendedor nombre, total, nota, fecha
- "Aprobar" and "Denegar" buttons per row
- After action: row disappears from pending list

Add to sidebar (admin/subadmin only) with a badge showing pending count.
Add route in router.tsx.

## What Changes vs. Previous Implementation

| Component | Change |
|-----------|--------|
| `backend/app/api/auth.py` | Remove `verify-admin` endpoint, remove `VerifyAdminRequest` import |
| `backend/app/schemas/auth.py` | Remove `VerifyAdminRequest` class |
| `backend/app/models/aprobacion_credito.py` | **New** |
| `backend/migrations/versions/l2m3n4o5p6q7_aprobaciones_credito.py` | **New** |
| `backend/app/schemas/aprobacion.py` | **New** |
| `backend/app/api/aprobaciones.py` | **New** |
| `backend/app/main.py` | Register aprobaciones router |
| `frontend/src/components/CreditWarningModal.tsx` | Replace block mode with request mode |
| `frontend/src/pages/CotizacionDetalle.tsx` | Crear NV → request mode; update checkCredit call |
| `frontend/src/pages/NotaVentaDetalle.tsx` | Save → request mode; update checkCredit call |
| `frontend/src/pages/Aprobaciones.tsx` | **New** |
| `frontend/src/router.tsx` | Add /aprobaciones route |
| `frontend/src/components/layout/Sidebar.tsx` | Add Aprobaciones link (admin/subadmin only, count badge) |

## Edge Cases

- Vendor cancels while waiting: request stays in DB as "pendiente" but vendor abandons. Admin will still see it — admin can deny if needed.
- Vendor closes browser while waiting: same as above.
- Admin approves a request for a cotizacion already converted to NV: `from_cotizacion` logic will fail (cotizacion already "cerrada_fv") — return 409 error, set estado back to "pendiente" or handle gracefully.
- If `nv_payload` is stale (vendor edited and saved form after submitting request): the stored payload is what was submitted, not the latest. This is acceptable — the approval authorizes the specific sale that was requested.
