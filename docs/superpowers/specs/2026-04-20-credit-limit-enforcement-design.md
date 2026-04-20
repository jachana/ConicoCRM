# Credit Limit Enforcement Design

**Date:** 2026-04-20  
**Status:** Approved

## Overview

When creating a Cotizacion or NV, the system checks whether the empresa's available credit would be exceeded by the sale. Cotizacion shows a non-blocking warning (seller can override). NV is hard-blocked and requires admin password to proceed.

## Credit Calculation

- **Source:** `Empresa.limite_credito` is the threshold.
- **Credit used:** Sum of `(factura.total - factura.monto_pagado)` for all facturas linked to that empresa where `monto_pagado < total`.
- **Credit available:** `limite_credito - credito_usado`
- Facturas are found via `Factura → NotaVenta.empresa_id`.

## Backend

### `GET /api/empresas/{id}/credito`

Returns current credit state for an empresa:

```json
{
  "limite_credito": 5000000,
  "credito_usado": 1200000,
  "credito_disponible": 3800000
}
```

- If `limite_credito` is null → returns `credito_disponible: null` (no limit set, no check performed).
- Requires authenticated user (any role).

### `POST /api/auth/verify-admin`

Verifies that the current session user is admin or subadmin AND that the provided password matches their hashed password.

**Request:** `{ "password": "string" }`  
**Response:** `200 OK` if valid admin with correct password, `401 Unauthorized` otherwise.

## Frontend — Cotizacion (non-blocking warning)

**File:** `CotizacionDetalle.tsx`  
**Trigger:** Existing save handler, before the API call.

1. If `empresaId` is set and empresa has `limite_credito`, call `GET /api/empresas/{empresaId}/credito`.
2. If `credito_disponible < cotizacion.total`:
   - Show warning modal with: empresa name, limite_credito, credito_usado, credito_disponible, cotizacion total.
   - Two buttons: **"Guardar de todas formas"** (proceeds with save) and **"Cancelar"** (closes modal, does not save).
3. If credit OK or no limit set → save normally, no interruption.

## Frontend — NV (hard block)

**Files:** `CotizacionDetalle.tsx` (Crear NV button) and `NotaVentaDetalle.tsx` (save handler).  
**Trigger:** Before NV creation API call in both paths.

1. If `empresaId` is set and empresa has `limite_credito`, call `GET /api/empresas/{empresaId}/credito`.
2. If `credito_disponible < nv.total`:
   - Show blocking modal with: empresa name, limit, used, available, NV total.
   - Password field + **"Autorizar (Admin)"** button + **"Cancelar"**.
   - On submit: `POST /api/auth/verify-admin` with entered password.
     - `200` → close modal, proceed with NV creation.
     - `401` → show inline "Contraseña incorrecta", stay on modal.
   - "Cancelar" → close modal, NV NOT created.
3. If credit OK or no limit set → create NV normally.

## Shared Modal Component

A single reusable `CreditWarningModal` component handles both cases, controlled by props:

- `mode: "warning" | "block"` — determines buttons shown
- `empresa`, `credito`, `saleTotal` — display data
- `onConfirm`, `onCancel` callbacks
- In `"block"` mode: includes password field and calls verify-admin internally

## Edge Cases

- Empresa has no `limite_credito` set → skip check entirely, proceed normally.
- `verify-admin` call fails (network error) → show generic error, stay on modal.
- Empresa changes after lines are added → credit check uses the currently selected empresa at save time.

## Files to Change

**Backend:**
- `backend/app/api/empresas.py` — add `/credito` endpoint
- `backend/app/api/auth.py` (or equivalent auth routes) — add `/verify-admin` endpoint

**Frontend:**
- `frontend/src/pages/CotizacionDetalle.tsx` — credit check on save
- `frontend/src/pages/NotaVentaDetalle.tsx` — credit check on save
- `frontend/src/components/CreditWarningModal.tsx` — new shared modal component
