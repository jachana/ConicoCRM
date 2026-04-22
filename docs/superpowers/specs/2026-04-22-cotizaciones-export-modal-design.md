# Cotizaciones: Export Modal + Preview Bug Fix

## Summary

Two changes to the Cotizaciones list page:
1. Bug fix: export preview shows no items because `CotizacionListOut` omits `lineas`
2. UX change: export panel moves from always-visible side panel to a triggered modal

---

## 1. Bug Fix — Preview sin items

**Root cause:** `CotizacionListOut` in `backend/app/schemas/cotizacion.py` does not include `lineas`. The backend already eager-loads them via `selectinload(Cotizacion.lineas)` but the schema drops them.

**Fix:** Add `lineas: list[CotizacionLineaOut] = []` to `CotizacionListOut`.

File: `backend/app/schemas/cotizacion.py`

---

## 2. Layout — Full-width list

Remove the `lg:grid lg:grid-cols-2` split. The cotizaciones list renders at full width. `ExportPreviewPanel` is removed from the main layout and lives only inside the modal.

Remove the mobile tab toggle ("Lista" / "Vista previa") — it is no longer needed.

---

## 3. Export Button

Add an "Exportar" button (with `Download` icon from lucide-react) in the page header, alongside "Nueva cotización". Clicking it sets `showExportModal = true`.

---

## 4. Export Modal

- Overlay: `fixed inset-0 bg-black/50 z-50`, click on overlay triggers discard confirmation
- Container: centered, `max-w-5xl w-full max-h-[90vh]`, vertically scrollable, white/dark bg, rounded-2xl, shadow-xl
- Header inside modal: "Exportar cotizaciones" title + `X` close button (also triggers discard confirmation)
- Body: renders `ExportPreviewPanel` with existing props (`lines={flatLines}`, `availableColumns`, `exportBaseUrl`, `storageKey`, `filename`)

State: `showExportModal: boolean`

---

## 5. Discard Confirmation Mini Modal

Triggered when user clicks outside the modal container or the `X` button.

- `z-[60]` (above main modal overlay)
- Small modal `max-w-sm`, centered
- Text: "¿Descartar exportación?"
- Buttons: "Cancelar" (dismisses confirmation, stays in export modal) / "Descartar" (closes export modal and confirmation)

State: `showDiscardConfirm: boolean`

---

## Files Changed

| File | Change |
|------|--------|
| `backend/app/schemas/cotizacion.py` | Add `lineas` to `CotizacionListOut` |
| `frontend/src/pages/Cotizaciones.tsx` | Remove split layout, remove tab toggle, add export button, add export modal, add discard confirm |

`ExportPreviewPanel.tsx` and `columnDefs.ts` are unchanged.

---

## Out of Scope

- Import functionality (not implemented)
- Changes to ExportPreviewPanel internals
- Changes to the export Excel endpoint
