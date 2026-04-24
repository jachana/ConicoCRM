# Inventario / Productos v2 — Design Spec

**Date:** 2026-04-23
**Status:** Approved

## Overview

Extends the Producto model and inventario system with: brand management, volume field, IVA-inclusive price display, PDF attachments, full movement history with export, and a **price-list-based cost system** (replaces the previously proposed FIFO lot system).

Cost (`precio_costo`) is no longer calculated from purchase history. It is sourced from an admin-uploaded price list (Excel/CSV). Admins upload a new list whenever the supplier publishes updated prices; the system matches by SKU, updates product costs in bulk, preserves all historical lists, and warns when a product's cost has not been refreshed in a configurable number of days.

---

## 1. Data Models

### 1.1 `Marca` (new table)

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| nombre | String(100), unique | |
| activa | Boolean, default True | |
| created_at | DateTime UTC | |

**Seed data:** Shell, Mobil, Total, Lubrax, Otros

Admin can add new brands and deactivate existing ones. Inactive brands are hidden from dropdowns but preserved on existing products.

---

### 1.2 Changes to `Producto`

New fields:

| Field | Type | Notes |
|---|---|---|
| marca_id | FK → Marca, nullable, SET NULL | |
| volumen | Decimal(8,2), nullable | litros |
| precio_costo_actualizado_en | DateTime UTC, nullable | set to `now()` whenever this SKU appears in an uploaded list (even if cost unchanged) |

`precio_costo` continues to exist as a stored field. It is **no longer managed automatically from purchase history**. It is updated in bulk when a new price list is uploaded, for every SKU that appears in the list. Products not included in a new list retain their previous `precio_costo` and previous `precio_costo_actualizado_en`.

**Removed** (was proposed in an earlier draft, not implemented): `ultimo_costo_unitario` field.

New computed properties (not stored):
- `precio_con_iva` → `precio_venta * Decimal("1.19")`
- `costo_con_iva` → `precio_costo * Decimal("1.19")`

---

### 1.3 `ProductoDocumento` (new table)

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| producto_id | FK → Producto, CASCADE | |
| nombre | String(255) | original filename |
| ruta | String(500) | local filesystem path |
| created_at | DateTime UTC | |

- Max 5 documents per product, enforced in API.
- Storage pattern: `uploads/productos/{producto_id}/{uuid}_{filename}`.
- Only PDF files accepted (validated by content-type + extension).

---

### 1.4 `ListaPrecios` (new table)

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| nombre_archivo | String(255) | original uploaded filename |
| ruta_archivo | String(500) | path on disk: `uploads/listas_precios/{id}_{filename}` |
| subida_por_id | FK → Usuario, RESTRICT | who uploaded it |
| fecha_subida | DateTime UTC | |
| activa | Boolean, default False | only one `activa=True` at any time |
| total_items | Integer | count of parsed items (denormalized for listing) |

Only one `ListaPrecios` has `activa=True` at any given moment. When a new list is uploaded and successfully parsed, the previous active list is flipped to `activa=False` (archived) in the same transaction.

---

### 1.5 `ListaPreciosItem` (new table)

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| lista_id | FK → ListaPrecios, CASCADE | |
| sku | String(100), indexed | |
| costo_unitario | Decimal(12,2) | |

Indexed on `(lista_id, sku)` for lookups and on `sku` alone for historial-costos queries across lists.

---

### 1.6 `MovimientoInventario` — unchanged from current implementation

Continues to track stock entradas (from OC reception or manual adjustments) and salidas (from NV or manual adjustments). No reference to cost lots.

**Removed** (was proposed in an earlier draft, not implemented): `lote_costo_id` FK.

---

### 1.7 System settings

New config key:

| Key | Default | Type |
|---|---|---|
| `dias_alerta_costo_desactualizado` | 60 | Integer |

Configurable by admin in the system settings UI. Used by both the API (for the `costo_desactualizado` flag in product serialization) and the frontend (for threshold comparison).

---

## 2. Price List Upload Flow

### 2.1 Accepted formats

- Excel (`.xlsx`)
- CSV (`.csv`, UTF-8)

First row must contain column headers. Expected headers: `sku` and `costo`. If headers differ (e.g., `codigo`, `precio`), the upload endpoint accepts optional query params `columna_sku` and `columna_costo` to override detection.

### 2.2 Processing steps (server-side, single transaction)

1. Validate file extension and MIME type
2. Parse headers; fail with 400 if required columns cannot be mapped
3. Read rows; skip rows with blank SKU or non-numeric cost (count as `filas_invalidas` in response)
4. Reject the upload with 400 if the same SKU appears in more than one row — admin must deduplicate the source file
5. Create `ListaPrecios` record with `activa=False` initially
6. Bulk-insert `ListaPreciosItem` rows — one per parsed row
7. Set `total_items` on the `ListaPrecios` record
8. Flip previously-active list to `activa=False`
9. Flip newly-uploaded list to `activa=True`
10. Bulk update: for every `Producto` whose `sku` matches a `ListaPreciosItem.sku` in this list:
    - `producto.precio_costo = item.costo_unitario`
    - `producto.precio_costo_actualizado_en = now()` (always, even if cost unchanged)
11. Persist file to disk at `uploads/listas_precios/{id}_{nombre_archivo}`

**Assumption:** `Producto.sku` is unique across the products table. If duplicates exist in the current data, this must be reconciled before the feature is deployed; the bulk update in step 10 would otherwise update every duplicate to the same cost.

### 2.3 Upload response

```json
{
  "lista_id": 42,
  "total_filas": 850,
  "filas_invalidas": 3,
  "productos_actualizados": 812,
  "skus_sin_producto": ["ABC-123", "XYZ-999"],
  "productos_no_incluidos_count": 45
}
```

- `total_filas`: rows read from the file (excluding the header)
- `filas_invalidas`: rows skipped due to blank SKU or non-numeric cost
- `productos_actualizados`: matched SKUs, cost refreshed
- `skus_sin_producto`: SKUs present in file but no matching Producto — returned as a list so admin can review typos
- `productos_no_incluidos_count`: existing Productos whose SKU did not appear in this upload — their `precio_costo` is preserved (lists are typically partial)

### 2.4 Rollback on parse error

If parsing fails after step 4, the transaction is aborted, no `ListaPrecios` row is persisted, no file is written to disk, the previous active list remains active.

---

## 3. API Endpoints

### 3.1 Marcas

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/marcas` | authenticated | returns active brands |
| POST | `/api/marcas` | admin | create new brand |
| PATCH | `/api/marcas/{id}` | admin | edit nombre or toggle activa |

### 3.2 Producto

`POST/PATCH /api/productos/{id}` accepts `marca_id`, `volumen`.

`GET /api/productos/{id}` response includes:
- `marca` (nested), `volumen`, `precio_con_iva` — visible to all authenticated users
- `precio_costo`, `costo_con_iva`, `precio_costo_actualizado_en`, `costo_desactualizado` (computed boolean) — **admin only**. Non-admin callers get these fields stripped from the response.

`costo_desactualizado = (now() - precio_costo_actualizado_en).days > dias_alerta_costo_desactualizado`. When `precio_costo_actualizado_en` is NULL, `costo_desactualizado = True`.

### 3.3 Documentos PDF

| Method | Path | Notes |
|---|---|---|
| GET | `/api/productos/{id}/documentos` | list all docs |
| POST | `/api/productos/{id}/documentos` | upload PDF, validates max 5 and file type |
| DELETE | `/api/productos/{id}/documentos/{doc_id}` | removes file + DB record |
| GET | `/api/productos/{id}/documentos/{doc_id}/download` | FileResponse |

### 3.4 Historial de movimientos

| Method | Path | Notes |
|---|---|---|
| GET | `/api/productos/{id}/movimientos` | paginated: `page`, `page_size` (default 50) |
| GET | `/api/productos/{id}/movimientos/export` | returns full CSV (no pagination) |

CSV columns: `fecha`, `tipo`, `cantidad`, `signo`, `referencia_tipo`, `referencia_id`, `motivo`, `nota`, `usuario`.

### 3.5 Listas de precios (admin only)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/listas-precios` | paginated list of all listas (active + historical), ordered by fecha_subida DESC |
| GET | `/api/listas-precios/activa` | the currently-active list |
| GET | `/api/listas-precios/{id}` | detail: lista metadata + counts |
| GET | `/api/listas-precios/{id}/items` | paginated items: `page`, `page_size` (default 100) |
| POST | `/api/listas-precios` | multipart upload: `archivo` (required), `columna_sku` / `columna_costo` (optional) |
| GET | `/api/listas-precios/{id}/download` | FileResponse of original uploaded file |
| DELETE | `/api/listas-precios/{id}` | only permitted when `activa=False`; cascades items |

### 3.6 Historial de costos de un producto (admin only)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/productos/{id}/historial-costos` | all `ListaPreciosItem` rows whose `sku` matches this producto, ordered by `lista.fecha_subida` DESC |

Returns: `fecha_subida`, `costo_unitario`, `lista_id`, `nombre_archivo`.

### 3.7 Settings

| Method | Path | Notes |
|---|---|---|
| GET | `/api/settings/dias-alerta-costo-desactualizado` | returns current value |
| PATCH | `/api/settings/dias-alerta-costo-desactualizado` | admin only, integer ≥ 1 |

---

## 4. UI Changes

### 4.1 Modal de edición de Producto

- **Marca** dropdown (activas only) + "Agregar marca" inline option for admin
- **Volumen (L)** numeric input
- **Precio con IVA** displayed as read-only computed field below `precio_venta` (all users)
- **Admin-only section** (gated by role):
  - `precio_costo`, `costo_con_iva` (read-only display)
  - `Actualizado: hace X días` label — rendered in red when `costo_desactualizado=True`
  - New tab/section "Historial de costos": table of `fecha_subida`, `costo`, `nombre_archivo`, link to the lista

### 4.2 Subtabla Documentos

- List: nombre, fecha subida, botón descargar, botón eliminar
- Upload button: opens file picker (PDF only), shows error if already at 5 docs
- Max 5 enforced both client and server side

### 4.3 Tab Historial de Movimientos

- Paginated table: fecha, tipo, cantidad, referencia, usuario
- "Exportar CSV" button → hits export endpoint, triggers download
- Default page_size: 50

### 4.4 Inventario — columna de alerta

- In the main inventario table, a new column "Últ. act. costo" shows days since `precio_costo_actualizado_en` (admin only)
- Filter: "mostrar solo productos con costo desactualizado"
- Row styling highlights rows where `costo_desactualizado=True`

### 4.5 Nueva página: Listas de precios (admin)

Route: `/inventario/listas-precios`

- Table of all listas: fecha_subida, nombre_archivo, subida_por, total_items, activa badge, botón descargar, botón eliminar (only for inactive lists)
- "Subir nueva lista" button opens a modal:
  - File picker (`.xlsx` / `.csv`)
  - Preview of detected headers; if required columns are not detected, shows inputs to map them
  - Confirm button triggers upload
  - After successful upload: shows result summary (`productos_actualizados`, list of `skus_sin_producto`, count of `productos_no_incluidos`)

### 4.6 Settings

- New admin-only setting in system configuration: `dias_alerta_costo_desactualizado` (integer input, default 60)

### 4.7 Removed from earlier draft

- "Lotes Activos" tab — not implemented (no FIFO)
- `costo_unitario_lote` column in movimientos CSV — not included

---

## 5. Permissions

| Action | Roles |
|---|---|
| Add/edit Marca | Admin |
| Upload/delete Producto docs | Admin, Subadmin |
| View movimientos historial | inventario:view |
| Export movimientos CSV | inventario:view |
| Upload/delete Listas de precios | Admin |
| View Listas de precios (current + historical) | Admin |
| View `precio_costo` / `costo_con_iva` in Producto | Admin |
| View Historial de costos of a Producto | Admin |
| View `costo_desactualizado` alert indicators | Admin |
| Edit `dias_alerta_costo_desactualizado` | Admin |
| Approve NVs with costo = 0 | Admin |

Non-admin roles (vendedores) never see cost fields, cost-with-IVA, the stale-cost indicator, or the Listas de precios page.

---

## 6. NV Handling — costo = 0 guard

When a NV line is created for a Producto whose `precio_costo = 0`:

- A warning is surfaced to the user
- The NV enters a new estado: `pendiente_aprobacion_costo` (new value added to the NV estado enum, alongside the existing `pendiente_aprobacion_margen`)
- An admin must explicitly approve before the NV proceeds to normal flow
- This can coexist with `pendiente_aprobacion_margen` — both approvals can be pending simultaneously

Typical causes of `precio_costo = 0`:
- New Producto that has not yet appeared in any uploaded list
- SKU typo causing the Producto to never match an item in a list

Approval action: admin reviews the NV, either uploads/edits the cost manually, or approves as-is, transitioning the NV out of this estado.

---

## 7. Migration Notes

Migration order:

1. Create `Marca` table and seed initial rows
2. Add `marca_id` (FK, nullable, SET NULL), `volumen` (Decimal 8,2 nullable), `precio_costo_actualizado_en` (DateTime UTC nullable) to `Producto`
3. Create `ProductoDocumento` table
4. Create `ListaPrecios` and `ListaPreciosItem` tables
5. Add config key `dias_alerta_costo_desactualizado = 60` to system settings

Data preservation:

- Existing `Producto.precio_costo` values are preserved as-is. No backfill, no transformation.
- `Producto.precio_costo_actualizado_en` is initialized to NULL. Products with NULL are treated as `costo_desactualizado=True` by the UI and API.

Not implemented (was proposed in an earlier draft of this spec):

- `LoteCosto` table
- `lote_costo_id` FK on `MovimientoInventario`
- `ultimo_costo_unitario` field on `Producto`
- FIFO consumption logic on NV creation
