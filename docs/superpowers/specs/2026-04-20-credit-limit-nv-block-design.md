# Credit Limit Enforcement for Nota de Venta

**Date:** 2026-04-20
**Status:** Approved

## Summary

Block creation of Nota de Venta (NV) when it exceeds a empresa's credit limit. Non-admins are hard-blocked and must request approval. Admins see a confirmation popup and can override. Cotizaciones keep existing warning-only behavior.

## Backend

### Helper function

Add `_check_credit_limit(db, empresa_id, total, current_user)` in `backend/app/api/nota_ventas.py`:

- If empresa has no `limite_credito` set → skip (no restriction)
- If `current_user.role in ("admin", "subadmin")` → skip
- Query unpaid facturas for the empresa (same logic as `GET /api/empresas/{id}/credito`)
- If `credito_disponible < total` → raise `HTTPException(status_code=402, detail="Límite de crédito excedido")`

### Apply to both NV creation endpoints

- `POST /api/nota_ventas/` — call helper after computing total
- `POST /api/nota_ventas/from_cotizacion/{cot_id}` — call helper after copying cotizacion lines and computing total

### No changes to cotizacion endpoints

## Frontend — NotaVentaDetalle

Modify `checkCredit()` to branch on `isAdmin`:

```
Admin:
  setCreditModal({ credito, onConfirm: doSave })   // mode="warning"

Non-admin:
  setCreditModal({ credito, aprobacionPayload })    // mode="request"
```

Update `CreditWarningModal` usage to pass `mode` and `onConfirm` conditionally:

```tsx
<CreditWarningModal
  mode={isAdmin ? 'warning' : 'request'}
  onConfirm={isAdmin ? () => { setCreditModal(null); doSave() } : undefined}
  ...
/>
```

`CreditWarningModal` already supports both modes — no changes to the component.

## Frontend — CotizacionDetalle

No changes. Existing behavior preserved (warning modal with "Guardar de todas formas" or "Solicitar Aprobación").

## Error handling

If backend returns 402 (non-admin bypasses frontend somehow), the frontend's existing error handling in `doSave()` should surface the `detail` message to the user.

## Out of scope

- Credit check on cotizacion creation/update
- Credito disponible display on the NV form before attempting save
- Changes to the approval flow or Aprobaciones page
