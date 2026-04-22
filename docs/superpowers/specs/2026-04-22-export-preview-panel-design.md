# Export Preview Panel — Design Spec
**Date:** 2026-04-22  
**Status:** Approved

## Overview

Add a live export preview panel to the Cotizaciones and Facturas list pages. The preview shows all data that will be exported — flat, one row per product line — with a column picker the user can toggle on the fly. Filters drive both the list and the preview simultaneously. Facturas unlocks ad-hoc business analytics: sales by customer, by product, by customer+product, any combination.

---

## Layout

### Split view (side-by-side)

The page splits into two columns driven by the same filter pill bar:

```
┌─ Filter pills ─────────────────────────────────────────────────┐
│ [Estado ▾]  [Emisor ▾]  [Fechas ×]  [Productos ▾]  [Monto ▾]  │
└────────────────────────────────────────────────────────────────┘

┌─ Lista (left) ──────┐  ┌─ Vista previa exportación (right) ───┐
│ Existing card/table │  │ Summary bar                           │
│ view, unchanged     │  │ Column picker chips                   │
│                     │  │ Flat table (1 row / line item)        │
│                     │  │ [⬇ Exportar Excel]                    │
└─────────────────────┘  └───────────────────────────────────────┘
```

- Left column: current list view (cards on mobile, table on desktop), **no changes**
- Right column: preview panel — only appears when viewport is wide enough (≥ 1024px); on smaller screens the preview is reachable via a tab/toggle
- On mobile: two tabs — "Lista" and "Vista previa" — sharing the same filter bar

---

## Preview Panel Components

### 1. Summary bar

Always visible at the top of the preview panel. Updates live with filters.

| Field | Source |
|---|---|
| Documentos | count of distinct documents in result |
| Líneas | count of line rows |
| Total neto | sum of line.total_neto |
| Margen prom. | weighted avg: Σ(line.total_neto × line.margen) / Σ(line.total_neto) for lines with known margin |

### 2. Column picker

A horizontal strip of toggleable chips above the table. Click a chip to show/hide that column. The column selection is persisted in `localStorage` per page so it survives navigation.

**Available columns — both pages:**

| Group | Columns |
|---|---|
| Document | Nº, Fecha, Estado, Cliente, Empresa, Encargado, Contacto |
| Line | SKU, Descripción, Formato, Cantidad, Precio Unit., Total Neto, Margen % |

**Facturas adds:**

| Group | Columns |
|---|---|
| Document | Vencimiento |
| Payment | Monto Pagado, Método Pago, Fecha Pago |

**Default visible columns (both pages):**  
Nº, Fecha, Cliente, Empresa, SKU, Descripción, Cantidad, Precio Unit., Total Neto, Margen %

### 3. Flat table

- One row per product line item
- Document-level fields (Nº, Fecha, Cliente…) repeat per line
- Columns match the picker selection exactly
- Horizontally scrollable if columns exceed panel width
- Shows first 200 rows; a footer indicates "mostrando 200 de N líneas — exporta todas"

### 4. Export button

Downloads an Excel file with:
- Exactly the columns visible in the picker (no more, no less)
- All rows matching the current filters (not capped at 200)
- Single sheet named after the page ("Cotizaciones" / "Facturas")
- File name: `cotizaciones-YYYY-MM-DD.xlsx` / `facturas-YYYY-MM-DD.xlsx`

---

## Pages in Scope

### Cotizaciones (update existing)

**Current state:** filter pills exist (Estado, Emisor, Empresa, Fechas, Monto, Productos multi-select), lineas already loaded via `selectinload`, existing Excel export endpoint.

**Changes needed:**
- Frontend: add split layout, preview panel component, column picker, update export to respect visible columns
- Backend: update export endpoint to accept `columns[]` param and produce single flat sheet

### Facturas (new feature)

**Current state:** basic filters only (estado, cliente, fechas). No lineas loaded in list. No preview. Export exists but is unfiltered.

**Changes needed:**
- Backend list endpoint: add filters (empresa_id, vendedor_id, monto_min, monto_max, producto_id list), add `selectinload(Factura.lineas)`, add `margen_total` property on model
- Backend export endpoint: accept filters + columns param, produce flat line-level sheet
- Frontend: add full filter pill bar (same pattern as Cotizaciones), add split layout + preview panel, add `margen_total` to Factura type

---

## Backend Changes

### Shared export contract

Both export endpoints accept:
- All existing filter params (same as list endpoint)
- `columns[]` — list of column keys to include (e.g. `columns=numero&columns=fecha&columns=cliente_nombre`)

Response: XLSX blob, single flat sheet, rows = one per line item.

### Cotizaciones export update

`GET /api/cotizaciones/export/excel`

- Remove the two-sheet approach (Resumen + Detalle)
- Replace with single flat sheet driven by `columns[]` param
- Default columns (if none specified): all currently visible defaults

### Facturas list update

`GET /api/facturas/`

New params: `empresa_id`, `vendedor_id`, `monto_min`, `monto_max`, `producto_id` (list)  
Add: `selectinload(Factura.lineas)`  
Schema: add `margen_total` computed field (same formula as Cotizaciones)

### Facturas model update

Add `margen_total` property (same weighted-average formula as `Cotizacion.margen_total`).

### Facturas export update

`GET /api/facturas/export/excel`

New: accept same filters as list + `columns[]` param. Produce flat line-level sheet.

---

## Frontend Architecture

### Shared component: `ExportPreviewPanel`

A single reusable component used by both pages:

```
Props:
  lines: FlatLine[]          // already-flattened line rows (capped at 200 for display)
  availableColumns: ColDef[] // column definitions for this page
  isLoading: boolean
  exportBaseUrl: string      // e.g. "/api/cotizaciones/export/excel?estado=abierta&..."
  storageKey: string         // localStorage key for persisting column selection
```

The component owns column picker state internally (read/write `localStorage[storageKey]`). When the user clicks "Exportar", it appends `&columns=key1&columns=key2…` to `exportBaseUrl` and downloads the blob via `api.get(..., { responseType: 'blob' })`. The parent is responsible only for building the filter portion of the URL; the component handles the column portion.

`FlatLine` is a plain object with all possible column keys. `ColDef` has: `key: string`, `label: string`, `defaultVisible: boolean`, `getValue: (row: FlatLine) => string | number`.

### Flattening (client-side)

Both pages already receive documents with lineas (via `selectinload`). Flattening happens in a `useMemo`:

```ts
const flatLines = useMemo(() =>
  documents.flatMap(doc =>
    doc.lineas.map(line => ({ ...docFields(doc), ...lineFields(line) }))
  ), [documents])
```

### Column key definitions

Each page exports a `COLUMN_DEFS` array defining all available columns with: `key`, `label`, `defaultVisible`, `getValue(row)`. The component uses this to render both the picker and the table.

### Mobile fallback

Below 1024px wide: show a two-tab toggle ("Lista" / "Vista previa") above the content area. The filter pills remain above the tabs, driving both views.

---

## Data Flow

```
Filter pills
     │
     ▼
useQuery([filters]) → API list endpoint (with selectinload lineas)
     │
     ├──► Left panel: render existing list view
     │
     └──► useMemo: flatten docs × lineas → FlatLine[]
               │
               ▼
         ExportPreviewPanel
           ├── Summary bar (computed from FlatLine[])
           ├── Column picker (localStorage state)
           ├── Table (FlatLine[] × visible columns, capped 200)
           └── Export button → api.get(export?filters&columns, blob)
```

---

## Out of Scope

- Sorting the preview table by column (can be added later)
- Grouping / pivot / aggregation views
- Scheduled or saved report templates
- Central analytics hub (user chose per-page approach)
- Pages other than Cotizaciones and Facturas (NV, OC) — can be added with the same pattern later

---

## Success Criteria

1. On Cotizaciones page: filter pills + split layout works on desktop; preview updates live as filters change; column picker persists across navigation; export downloads flat Excel with visible columns only.
2. On Facturas page: same as above; additionally, filtering by cliente + producto(s) correctly returns only facturas containing those products for that client.
3. Summary bar numbers match what the export contains.
4. On mobile: tab toggle works, export still accessible.
