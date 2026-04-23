# Cotización Quick Wins — Design Spec
**Date:** 2026-04-23

## Scope

Two targeted edits to `frontend/src/pages/CotizacionDetalle.tsx`. No backend changes, no migrations, no new files.

---

## Change 1: Discount column — plain text in read-only mode

### Problem
When a cotización is locked (`isLocked = true`), the discount per line is shown as a disabled `<input type="number">`. This looks like a broken form control, not a data display.

### Solution
Conditional rendering in the discount table cell:

- **Edit mode** (`!isLocked`): existing `<input type="number">` unchanged
- **View mode** (`isLocked`): plain text — `{descuento}%` if `descuento > 0`, otherwise `—`

### Styling
Right-aligned, same cell width (`w-20`), `text-sm text-gray-900 dark:text-white`.

### Behavior
- A discount of `0` shows as `—` (not `0%`) to reduce noise in view mode.
- No change to edit mode behavior.

---

## Change 2: Product autocomplete — switch to `/buscar` endpoint

### Problem
`CotizacionDetalle` loads all products upfront via `GET /api/productos/` and filters client-side using `filterProductos()`:

```ts
p.nombre.toLowerCase().includes(lower) ||
(p.sku ?? '').toLowerCase().includes(lower) ||
(p.formato ?? '').toLowerCase().includes(lower)
```

This misses **tags** entirely and is inconsistent with `NotaVentaDetalle`, which already uses the server-side `/api/productos/buscar?q=` endpoint that searches `nombre | sku | tag`.

### Solution
Replace the `filterProductos()` local function and its upfront product fetch with an async call to `/api/productos/buscar?q=`, triggered on ≥2 characters — identical to the pattern in `NotaVentaDetalle`.

### Implementation details
- Keep the existing `useQuery<Producto[]>` for products — it is also used by `handleResetPrecio` (price reset to catalog value) and cannot be removed.
- Replace the `filterProductos(q)` local function with an async `fetchAutocomplete(q: string)` that calls `/api/productos/buscar?q=`, mirroring `NotaVentaDetalle`.
- Wire it to the product description `onChange` handler.
- Keep the minimum 2-character trigger.
- Result list shape (`ProductoBusquedaOut`) is identical to what the current code expects — no type changes needed.

### What does NOT change
- The autocomplete dropdown UI and selection logic remain the same.
- Existing selected product data on load is unaffected.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/src/pages/CotizacionDetalle.tsx` | Both changes above |

## Testing

- Verify discount shows as plain text in locked cotización, editable input in edit mode.
- Verify product search in cotización finds results by tag (not just name/SKU).
- Verify existing unit tests still pass: `npm test` or equivalent.
