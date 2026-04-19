# Fase 7 — Inventario: Design Spec

**Date:** 2026-04-19
**Status:** Approved

---

## Overview

Módulo de inventario con tabla centralizada de movimientos, historial global y por-producto, ajuste manual con motivo fijo, y alertas de stock bajo en sidebar + catálogo + página inventario.

---

## Data Model

### `MovimientoInventario`

Nueva tabla `movimientos_inventario`:

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | PK | |
| `producto_id` | FK → productos | obligatorio |
| `tipo` | `entrada` \| `salida` \| `ajuste` | |
| `cantidad` | int (> 0) | siempre positivo |
| `signo` | int (+1 / -1) | +1 suma, -1 resta |
| `referencia_tipo` | `orden_compra` \| `nota_venta` \| `ajuste_manual` \| null | |
| `referencia_id` | int \| null | ID del documento origen |
| `motivo` | `conteo_fisico` \| `merma` \| `correccion` \| `otro` \| null | solo para ajuste_manual |
| `nota` | text \| null | texto libre opcional |
| `usuario_id` | FK → users | quién generó el movimiento |
| `created_at` | datetime UTC | |

`stock_actual` en `Producto` se mantiene como cache actualizado en el mismo commit que el movimiento. No se elimina.

### Regla de signo

- `entrada` (OC recepcionada): signo = +1
- `salida` (NV creada): signo = -1
- `ajuste`: signo = +1 si cantidad positiva, -1 si negativa (el usuario elige si suma o resta)

---

## Backend

### Nuevos archivos

- `app/models/movimiento_inventario.py` — modelo SQLAlchemy
- `app/schemas/movimiento_inventario.py` — Pydantic schemas
- `app/api/inventario.py` — router `/api/inventario`
- `migrations/versions/XXXX_add_movimientos_inventario.py`

### Endpoints

```
GET  /api/inventario/movimientos
     query: producto_id?, tipo?, fecha_desde?, fecha_hasta?, page=1, page_size=50
     → MovimientoListOut (paginado)

POST /api/inventario/ajustes
     body: { producto_id, cantidad, signo (+1|-1), motivo, nota? }
     perm: inventario + create
     → MovimientoOut

GET  /api/inventario/stock-bajo
     → list[ProductoStockOut]  (productos con stock_actual < stock_minimo)
```

### Integración existente

**OC recepción** (`app/api/ordenes_compra.py`, función de recepción):
- Después de `producto.stock_actual += delta`, insertar `MovimientoInventario(tipo="entrada", referencia_tipo="orden_compra", referencia_id=orden.id, cantidad=delta, signo=1, usuario_id=current_user.id)`.

**NV creación** (`app/api/nota_ventas.py`, endpoint POST):
- Por cada línea con `producto_id` y `cantidad > 0`: `producto.stock_actual -= linea.cantidad`, insertar `MovimientoInventario(tipo="salida", referencia_tipo="nota_venta", referencia_id=nv.id, cantidad=linea.cantidad, signo=-1, usuario_id=current_user.id)`.

**NV modificación** (`app/api/nota_ventas.py`, endpoint PATCH):
- Calcular delta por producto entre líneas anteriores y nuevas. Si delta != 0, actualizar `stock_actual` e insertar movimiento de ajuste con `referencia_tipo="nota_venta"`.

> ⚠️ **CONFIRMAR CON CLIENTE:** ¿El descuento de stock debe ocurrir al crear la NV o al cambiar estado a "Despachada"? Actualmente diseñado para ocurrir al crear.

### Historial por producto

Endpoint existente en productos o nuevo endpoint:
```
GET /api/productos/{id}/movimientos
    query: page=1, page_size=20
    → MovimientoListOut
```

---

## Frontend

### Página `/inventario` (nueva)

Dos tabs:

**Tab "Stock actual"**
- Tabla: Producto (nombre + SKU), Stock actual, Stock mínimo, Estado (badge "Crítico" si `stock_actual < stock_minimo`)
- Búsqueda por nombre/SKU
- Botón "Ajuste manual" → modal

**Tab "Movimientos"**
- Tabla: Fecha, Producto, Tipo, Cantidad (con signo visual ↑↓), Referencia (link al documento), Usuario
- Filtros: tipo (entrada/salida/ajuste), rango fechas

**Modal ajuste manual**
- Producto: autocomplete
- Motivo: select → "Conteo físico", "Merma", "Corrección", "Otro"
- Cantidad: número positivo
- Tipo de ajuste: radio "Suma (entrada)" / "Resta (salida)"
- Nota: textarea opcional

### Sidebar

Badge rojo con conteo de productos críticos junto al ítem "Inventario". Se obtiene del endpoint `/api/inventario/stock-bajo` (count). Se refresca al cargar el layout.

### Catálogo (`/productos`)

Columna `stock_actual` existente: agregar clase CSS `text-red-600 font-semibold` (o equivalente en el sistema de diseño actual) cuando `stock_actual < stock_minimo`.

### Detalle de producto (si existe página)

Sección colapsable "Movimientos recientes" con tabla de últimos 20 movimientos del producto, usando `/api/productos/{id}/movimientos`.

---

## Permisos

El módulo `inventario` ya está definido en `permissions.py`:
- Admin, Subadmin: view + create + edit + delete
- Vendedor: sin acceso

Ajuste manual requiere `inventario + create`. Ver movimientos requiere `inventario + view`.

---

## Migración

Nueva migración Alembic: crea tabla `movimientos_inventario`. No modifica tablas existentes. No hay datos históricos retroactivos (stock_actual ya es correcto; el historial comienza desde el deploy).

---

## Testing

- Unit: modelo `MovimientoInventario`, lógica de signo
- Integration: POST ajuste actualiza `stock_actual` y crea movimiento en mismo commit
- Integration: recepción OC crea movimiento tipo "entrada"
- Integration: creación NV crea movimiento tipo "salida" y descuenta stock
- Integration: modificación NV con delta ajusta stock y crea movimiento
- Integration: GET movimientos filtra correctamente por tipo/fecha/producto
- Integration: GET stock-bajo retorna solo productos críticos
