---
title: Negative Margin & Empty Item Validation
date: 2026-04-20
status: approved
---

# Negative Margin & Empty Item Validation

## Overview

Hard blocks on saving quotes, generating PDFs, and sending emails when the quote has invalid lines. Applies to all users (including admins) for both cotizaciones and NV.

## Validation Rules

Two conditions block all three actions (save, PDF, email):

1. **Negative margin** — any line where `margen < 0`
2. **Empty item** — any line where `producto_id` is null (no catalog item selected)

## Backend Changes

### `backend/app/api/cotizaciones.py`

Add a helper `_check_lineas_validas(lineas)` that returns a list of validation errors:
- Negative margin: any `linea.margen is not None and linea.margen < 0`
- Empty item: any `linea.producto_id is None`

Call this helper in:
- `POST /api/cotizaciones/` — raise 422 with error list before saving
- `PATCH /api/cotizaciones/{id}` — raise 422 with error list before updating
- `PUT /api/cotizaciones/{id}/lineas` — raise 422 before updating lines
- `GET /api/cotizaciones/{id}/pdf` — raise 422 before generating PDF
- `POST /api/cotizaciones/{id}/email` — raise 422 before sending email

Error response shape (422):
```json
{
  "detail": "lineas_invalidas",
  "errors": ["margen_negativo", "linea_sin_item"]
}
```

## Frontend Changes

### `frontend/src/pages/CotizacionDetalle.tsx`

#### Validation helper

Add `getLineasErrors(lineas)` that returns `string[]`:
- `"margen_negativo"` if any line has `margen < 0`
- `"linea_sin_item"` if any line has no `producto_id`

#### Save button

- Compute errors on render
- Disable Guardar button if errors non-empty
- Show tooltip listing the issues (e.g., "Hay líneas con margen negativo" / "Hay líneas sin ítem")

#### PDF / Email buttons

- Disable if errors non-empty (same tooltip)
- If errors empty but `isDirty === true`: show **unsaved changes modal** before proceeding

#### Unsaved changes modal

New component `UnsavedChangesModal` with props:
- `open: boolean`
- `onSaveAndContinue: () => Promise<void>` — saves first, then runs the action; if save fails validation, shows inline error
- `onDiscardAndContinue: () => void` — reverts to server state, then runs the action
- `onCancel: () => void` — closes modal

#### `isDirty` flag

Track whether current form state differs from last-saved server state. Compare `lineas` array (producto_id, cantidad, valor_neto) and top-level fields (correo, contacto, etc.) against the snapshot stored after each successful save or initial load.

## Error Messages (Spanish)

| Error key | Message |
|-----------|---------|
| `margen_negativo` | Hay líneas con margen negativo |
| `linea_sin_item` | Hay líneas sin producto seleccionado |
| Modal title | Cambios sin guardar |
| Modal body | La cotización tiene cambios que no han sido guardados. |
| Save & continue | Guardar y continuar |
| Discard & continue | Descartar cambios |
| Cancel | Cancelar |

## Out of Scope

- No approval flow for negative margin (unlike price deviation gate) — hard block only
- No bypass for any role
- No changes to `AprobacionMargen` model or flow
