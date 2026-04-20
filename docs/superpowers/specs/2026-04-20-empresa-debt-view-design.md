# Empresa Debt View Design

**Date:** 2026-04-20  
**Status:** Approved

## Overview

Enhance the Empresas page to surface debt information inline — total debt, overdue debt, and credit limit per company — with summary stats, sorting by debt, and a filter for companies with outstanding balances.

## Layout

Option A: Stats bar + enriched table.

- Three summary cards at the top of the page: **Deuda Total**, **Deuda Vencida**, **Empresas con Deuda** (e.g. 12/34). Stats computed client-side from the bulk response.
- Existing company table gains three new columns: **Deuda**, **Vencida**, **Lím. Crédito**.
- Plazo de crédito (30 días / 60 días / 90 días / Especial) shown as a small badge beneath the company name in the Empresa column.
- Companies with no debt are visually dimmed and their "Deuda" button is hidden.
- Default sort: Deuda descending. All numeric columns are sortable by clicking the header.
- Filter toggle: **Todas** / **Con Deuda**.

## Backend

### New endpoint: `GET /api/empresas/deuda-bulk`

Returns a flat list — one item per empresa — with no pagination:

```json
[
  {
    "empresa_id": 1,
    "nombre": "Constructora ABC",
    "plazo_credito": "30 Dias",
    "limite_credito": 5000000,
    "deuda_total": 980000,
    "deuda_vencida": 450000
  }
]
```

**Deuda total:** sum of `(factura.total - factura.monto_pagado)` for all active facturas (`estado != "anulada"`) where the unpaid balance is > 0.

**Deuda vencida per factura:**
1. Determine due date:
   - Use `factura.fecha_vencimiento` if set.
   - Else parse `empresa.plazo_credito`: "30 Dias" → 30, "60 Dias" → 60, "90 Dias" → 90. Add parsed days to `factura.created_at`.
   - If plazo is "Especial" (or null) and `fecha_vencimiento` is not set → skip this factura from vencida.
2. If due date < today and unpaid balance > 0 → add to `deuda_vencida`.

**Schema:** New `EmpresaDeudaBulkItem` Pydantic model. Endpoint lives in `backend/app/api/empresas.py`.

## Frontend

**File:** `frontend/src/pages/Empresas.tsx`

**New state:**
- `deudaMap: Map<number, DeudaBulkItem>` — keyed by empresa_id, populated from bulk endpoint
- `sortField: 'deuda_total' | 'deuda_vencida' | 'nombre'` — default `deuda_total`
- `sortDir: 'asc' | 'desc'` — default `desc`
- `filterConDeuda: boolean` — default `false`

**New type** in `frontend/src/types/index.ts`:
```ts
interface DeudaBulkItem {
  empresa_id: number
  nombre: string
  plazo_credito: string | null
  limite_credito: number | null
  deuda_total: number
  deuda_vencida: number
}
```

**On mount:** fire `GET /api/empresas/` and `GET /api/empresas/deuda-bulk` in parallel. Merge by `empresa_id`.

**Stats bar:** computed from `deudaMap` values — always reflects all companies regardless of active filter.

**Table rendering:**
- Merge company list with deudaMap before rendering.
- Apply `filterConDeuda` filter, then sort.
- Vencida cell: show red badge with amount if > 0, else "—".
- Plazo badge: blue for numeric plazos, grey for "Especial".
- "Deuda" action button: visible only when `deuda_total > 0`.

## Data Flow

```
mount
  ├── GET /api/empresas/          → empresas[]
  └── GET /api/empresas/deuda-bulk → DeudaBulkItem[]
        ↓ merge by empresa_id
      displayList[]
        ↓ filter (con deuda toggle)
        ↓ sort (column header click)
      rendered table + stats bar
```

Existing per-company debt modal (triggered by "Deuda" button) is unchanged.

## Files Changed

| File | Change |
|------|--------|
| `backend/app/api/empresas.py` | Add `GET /deuda-bulk` endpoint + vencida logic |
| `backend/app/schemas/empresa.py` | Add `EmpresaDeudaBulkItem` schema |
| `frontend/src/pages/Empresas.tsx` | Stats bar, new columns, sort, filter |
| `frontend/src/types/index.ts` | Add `DeudaBulkItem` type |

## Out of Scope

- Pagination of the bulk endpoint (company counts are expected to be small)
- Per-factura drill-down from the debt column (existing modal covers this)
- Editing credit limits from this view
