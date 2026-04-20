# Catalog Price Triangle — Design Spec

**Date:** 2026-04-20  
**Status:** Approved

## Summary

Add a cost/price/margin triangle to the Producto create/edit modal in `Productos.tsx`. Changing any one of the three values recomputes the appropriate third. No DB changes — margin is UI-only, only `precio_costo` and `precio_venta` are persisted.

## Scope

- File: `frontend/src/pages/Productos.tsx`
- No backend changes
- No migration

## Formulas

Consistent with existing margin formula used in cotizaciones/notas_venta/facturas:

```
margen (%) = (precio_venta - precio_costo) / precio_venta * 100
```

Inverse formulas:

| User edits       | Auto-recomputes                                        |
|------------------|--------------------------------------------------------|
| `precio_venta`   | `margen = (venta - costo) / venta * 100`               |
| `margen`         | `precio_venta = precio_costo / (1 - margen / 100)`     |
| `precio_costo`   | `precio_venta = precio_costo / (1 - margen / 100)` (margin held) |

## Validation Rules

- `precio_venta <= precio_costo` → blocked. Toast: *"El precio de venta debe ser mayor al costo"*
- `margen <= 0` → blocked. Toast: *"El margen debe ser mayor a 0%"*
- Inline red helper text shown in real-time under the offending field as the user types
- Save button disabled while any violation is active

## UI

- Three fields grouped visually in the modal: Precio Costo | Precio Venta | Margen %
- Margen field has `%` suffix
- When `precio_costo` changes and triggers a `precio_venta` recalculation, the price field briefly highlights to signal the update

## Data Flow

1. Modal opens → derive initial `margen` from stored `precio_costo` / `precio_venta`
2. User edits any field → apply the relevant inverse formula → update the other field
3. On submit → validate rules → if invalid, show toast and abort → if valid, send only `precio_costo` + `precio_venta` to the API (margen omitted)
