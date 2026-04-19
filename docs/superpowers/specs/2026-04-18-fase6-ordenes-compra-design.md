# Fase 6 — Órdenes de Compra: Design Spec

**Date:** 2026-04-18  
**Status:** Approved

---

## Overview

Purchase order management module. Allows Admin/SubAdmin to create purchase orders to suppliers, send them via email (PDF), and receive goods partially or fully — automatically updating product stock.

---

## Data Models

### `OrdenCompra`

| Field | Type | Notes |
|-------|------|-------|
| id | int PK | |
| numero | int unique | Auto-assigned via SystemConfig `orden_compra_last_id`, SELECT FOR UPDATE |
| proveedor_id | int FK | → Proveedor, RESTRICT on delete |
| fecha | date | Default today |
| fecha_entrega_esperada | date \| null | |
| estado | str | `borrador` \| `enviada` \| `recibida_parcial` \| `recibida_completa` \| `cancelada` |
| nota | text \| null | |
| total_neto | Decimal(12,2) | |
| total_iva | Decimal(12,2) | |
| total | Decimal(12,2) | |
| created_at | datetime | |
| updated_at | datetime | |

### `OrdenCompraLinea`

| Field | Type | Notes |
|-------|------|-------|
| id | int PK | |
| orden_compra_id | int FK | CASCADE delete |
| orden | int | Display order |
| producto_id | int \| null FK | → Producto, SET NULL on delete |
| sku | str \| null | |
| descripcion | str | Required |
| cantidad | int | Total quantity ordered |
| cantidad_recibida | int | Default 0; updated on each reception call |
| valor_neto | Decimal(12,2) | Unit price (net) |
| total_neto | Decimal(12,2) | cantidad × valor_neto |
| iva | Decimal(12,2) | total_neto × 0.19 |
| total | Decimal(12,2) | total_neto + iva |

### `SystemConfig` addition

Add `"orden_compra_last_id": "0"` to `INITIAL_CONFIG` in `/backend/app/api/config.py`. Editable by Admin via existing config UI.

---

## State Machine

```
borrador ──[Enviar email]──► enviada
borrador ──[Cancelar]──────► cancelada
enviada  ──[Recepcionar]───► recibida_parcial  (if any line still short)
enviada  ──[Recepcionar]───► recibida_completa (if all lines fully received)
recibida_parcial ──[Recepcionar]──► recibida_parcial | recibida_completa
```

- "Enviar email" sends PDF to proveedor's email → automatically sets estado = `enviada`
- Estado `cancelada` is final (no transitions out)
- Manual state change endpoint (`PATCH /{id}/estado`) allows `borrador → cancelada` only

---

## API Endpoints

All endpoints require permission `ordenes_compra.*`. Only Admin/SubAdmin roles receive these permissions.

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/api/ordenes-compra/export/excel` | view | Export all to Excel |
| GET | `/api/ordenes-compra/` | view | List; query params: `proveedor_id`, `estado`, `fecha_desde`, `fecha_hasta` |
| POST | `/api/ordenes-compra/` | create | Auto-assigns `numero` via SELECT FOR UPDATE |
| GET | `/api/ordenes-compra/{id}` | view | Detail with `lineas` and `proveedor` |
| PATCH | `/api/ordenes-compra/{id}` | edit | Replace header fields + replace all lines; only if `estado=borrador` |
| DELETE | `/api/ordenes-compra/{id}` | delete | Only if `estado=borrador` |
| GET | `/api/ordenes-compra/{id}/pdf` | view | StreamingResponse bytes |
| POST | `/api/ordenes-compra/{id}/email` | edit | Sends PDF to proveedor email; sets `estado=enviada`; degrades gracefully if SMTP not configured |
| POST | `/api/ordenes-compra/{id}/recepcionar` | edit | Body: `{lineas: [{id, cantidad_recibida}]}`; updates `cantidad_recibida` per line, adds delta to `producto.stock_actual`, recalculates estado |
| PATCH | `/api/ordenes-compra/{id}/estado` | edit | Manual override; only `borrador → cancelada` |

### Reception Logic (`recepcionar` endpoint)

```python
for item in payload.lineas:
    linea = get_linea(item.id)
    delta = item.cantidad_recibida - linea.cantidad_recibida  # new units received
    linea.cantidad_recibida = item.cantidad_recibida
    if linea.producto_id and delta > 0:
        producto.stock_actual += delta

# Recalculate estado
if all(l.cantidad_recibida >= l.cantidad for l in orden.lineas):
    orden.estado = "recibida_completa"
else:
    orden.estado = "recibida_parcial"
```

---

## Backend File Structure

```
backend/app/
├── models/orden_compra.py          # OrdenCompra + OrdenCompraLinea
├── schemas/orden_compra.py         # Pydantic schemas (Base/Create/Update/Out)
├── api/ordenes_compra.py           # All endpoints
├── services/pdf.py                 # Add generar_pdf_orden_compra()
├── services/email.py               # Add enviar_orden_compra()
├── templates/orden_compra.html     # Jinja2 PDF template
└── api/config.py                   # Add orden_compra_last_id to INITIAL_CONFIG
```

Register in `main.py`:
```python
from app.api import ordenes_compra
app.include_router(ordenes_compra.router, prefix="/api/ordenes-compra", tags=["ordenes_compra"])
```

Add Alembic migration for new tables.

---

## Frontend File Structure

```
frontend/src/
├── types/index.ts                  # Add OrdenCompra + OrdenCompraLinea interfaces
├── pages/OrdenesCompra.tsx         # List page
├── pages/OrdenCompraDetalle.tsx    # Create/Edit detail page with line editor + reception panel
└── router.tsx                      # Add routes
```

Add sidebar entry in `AppLayout` (or wherever sidebar is defined):
```tsx
{ to: '/ordenes-compra', icon: ShoppingCart, label: 'Órdenes de Compra' }
```

### Routes

```
/ordenes-compra          → OrdenesCompra.tsx
/ordenes-compra/nueva    → OrdenCompraDetalle.tsx
/ordenes-compra/:id      → OrdenCompraDetalle.tsx
```

### OrdenesCompra.tsx (List Page)

- Filters: proveedor dropdown, estado dropdown, date range
- Table columns: número, proveedor, fecha, fecha_entrega_esperada, estado, total, acciones
- Actions per row: Ver, PDF, delete (if borrador)
- Header buttons: [Exportar Excel] [Nueva OC]

### OrdenCompraDetalle.tsx (Detail Page)

**Header section:** proveedor (dropdown), fecha, fecha_entrega_esperada, nota

**Line editor** (same pattern as CotizacionDetalle):
- Producto autocomplete → auto-fills sku, descripcion, valor_neto
- Cantidad input
- Calculated: total_neto, iva, total per line
- Add/remove lines
- Summary totals at bottom

**Action bar** (context-sensitive by estado):
- `borrador`: [Guardar] [Enviar por Email] [Cancelar OC]
- `enviada` / `recibida_parcial`: [Recepcionar] [Ver PDF]
- `recibida_completa` / `cancelada`: read-only view + [Ver PDF]

**Reception panel** (visible if estado = `enviada` or `recibida_parcial`):
- Table: descripción | pedido | ya recibido | recibir ahora (input)
- [Confirmar recepción] button → `POST /{id}/recepcionar`

---

## PDF Template (`orden_compra.html`)

Same structure as `cotizacion.html`. Differences:
- Header: "ORDEN DE COMPRA N° OC-XXXXX"
- Shows proveedor info (nombre, rut, contacto, email) instead of cliente
- Shows `fecha_entrega_esperada` if set
- Line columns: descripción, cantidad, valor_neto, total_neto
- No margen column (internal info)
- Footer: empresa info from SystemConfig

---

## Permissions

Module key: `ordenes_compra`  
Actions: `view`, `create`, `edit`, `delete`

On new user creation, Admin/SubAdmin get all 4. Vendedor gets none (not configurable for this module — enforced at backend via role check in addition to permission check).

---

## Out of Scope (v1)

- Nota de Recepción as a separate document
- Partial cancellation of lines
- Multi-receipt history log (deferred to Fase 7 — Inventario)
- Automatic re-order suggestions from low-stock alerts
