# Margin Approval Gate — Design

**Date:** 2026-04-20  
**Status:** Approved  
**Related spec:** `2026-04-20-margin-approval-request-design.md`

---

## Overview

When any catalog line in a cotización has a `valor_neto` that differs from the product's `precio_venta`, PDF generation and email sending are blocked until an admin approves the prices. If an approval is later revoked (vendor changes prices/qty/client), the block reapplies and a new approval request must be submitted.

Admins bypass this gate entirely.

---

## Detection Logic

A cotización is **blocked** when both conditions are true:

1. At least one line has a `producto_id` AND its saved `valor_neto ≠ producto.precio_venta`
2. No `aprobacion_margen` with `estado = 'aprobada'` exists for this cotización

Backend helper (shared by PDF, email, and status endpoints):

```python
def check_margin_approval_required(db, cotizacion) -> bool
```

Returns `True` if blocked.

---

## Backend Changes

### New endpoint

`GET /api/cotizaciones/{id}/margin-status`

Response:
```json
{ "blocked": true, "estado": "pendiente" | "aprobada" | "denegada" | "revocada" | null }
```

`estado` is the most recent `aprobacion_margen.estado` for this cotización (`null` if none exists).

### PDF gate

`GET /api/cotizaciones/{id}/pdf` — before generating:
- If `check_margin_approval_required()` → `403 {"detail": "Requiere aprobación de márgenes"}`

### Email gate

`POST /api/cotizaciones/{id}/email` — same check, same 403.

### Revocation action

`PATCH /api/aprobaciones_margen/{id}` gains a new action:
```json
{ "accion": "revocar" }
```
Sets `estado = 'revocada'`. Vendor-initiated only (not the same as admin "denegar"). Endpoint already exists — add the new action branch.

---

## Frontend Changes (CotizacionDetalle)

### Page load

For existing cotizaciones (not new): fetch `/api/cotizaciones/{id}/margin-status` on mount. Store `{ blocked, estado }` in component state. Skip for `isNew` and for admins.

### Warning banner

Shown below the header action buttons when `blocked === true`:

| `estado` | Color | Message |
|---|---|---|
| `pendiente` | Amber | *"Precios modificados — solicitud de aprobación pendiente. PDF y email deshabilitados."* |
| `null` / `denegada` / `revocada` | Red | *"Precios modificados requieren aprobación antes de generar PDF o enviar email."* |

### PDF and Email buttons

`disabled` when `blocked`. Button `title` tooltip: *"Requiere aprobación de márgenes"*.

### Revocation confirmation dialog

Triggered when `estado === 'aprobada'` and the vendor edits `valor_neto`, `cantidad`, or `clienteId`:

> *"Esta cotización tiene aprobación de márgenes vigente. Modificarla revocará la aprobación y bloqueará el PDF y email. ¿Continuar?"*

- **Cancelar** → discard the change, no state update
- **Continuar** → apply the change, call `PATCH /api/aprobaciones_margen/{aprobacion_id}` with `{ accion: "revocar" }`, set local `blocked = true`, `estado = 'revocada'`

Admins: no dialog, no banner, no disabled buttons.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| New cotización (not yet saved) | No margin-status fetch, no banner, no gate |
| All lines reset to catalog price | `check_margin_approval_required` returns false — PDF/email re-enabled; no approval needed |
| New lines added at catalog price | Does not revoke an existing `aprobada` approval |
| Admin modifies prices | No block, no dialog, always can generate PDF/email |
| Approval revoked, vendor re-submits | Uses existing margin approval request flow |
| Cotización deleted | `aprobaciones_margen` cascade-delete (already in model) |
| Line deleted after approval submitted | Approve action skips missing `linea_id` gracefully (per existing spec) |
| Line deleted after approval granted | Approval remains valid — gate checks current saved lines only |
