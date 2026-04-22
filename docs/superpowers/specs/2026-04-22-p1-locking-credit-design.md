# P1: Bloqueo en cadena + Forzar contado

**Fecha:** 2026-04-22  
**Estado:** Aprobado

---

## Contexto

Dos requerimientos de integridad comercial del cliente:

1. **Bloqueo en cadena** — Al generar un documento downstream, el documento upstream queda completamente bloqueado (read-only, permanente, sin excepciones de rol).
2. **Forzar contado en UI** — Empresas sin línea de crédito ya son forzadas a `terminos_pago="al_contado"` en el backend; falta reflejar esto visualmente en el frontend.

---

## 1. Bloqueo en cadena

### Cadena de bloqueo

| Documento | Se bloquea cuando... | Trigger |
|-----------|---------------------|---------|
| Cotización | Se crea una NV desde ella | `POST /nota_ventas` (from_cotizacion) |
| NotaVenta | Se crea una Factura desde ella | `POST /facturas` |
| Factura | Siempre (desde creación) | Por lógica, sin campo |

El bloqueo es **permanente e irreversible**. No hay desbloqueo. No hay bypass para admin. Si la NV downstream se cancela, la Cotización permanece bloqueada.

### Modelo de datos

```python
# app/models/cotizacion.py
is_locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

# app/models/nota_venta.py
is_locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
```

Factura no requiere campo — se bloquea por lógica en la API.

### Backend — Guards

**Cotizacion** (`app/api/cotizaciones.py`):
- `PATCH /cotizaciones/{id}` → `403` si `cotizacion.is_locked`
- `PATCH /cotizaciones/{id}/lineas` → `403` si `cotizacion.is_locked`
- Exportar `is_locked` en `CotizacionOut`

**NotaVenta** (`app/api/nota_ventas.py`):
- `PATCH /nota_ventas/{id}` → `403` si `nv.is_locked`
- `PATCH /nota_ventas/{id}/lineas` → `403` si `nv.is_locked`
- `PATCH /nota_ventas/{id}/estado` → **no bloqueado** (cambios de estado siguen funcionando)
- Exportar `is_locked` en `NotaVentaOut`

**Factura** (`app/api/facturas.py`):
- `PATCH /facturas/{id}` → `403` siempre
- `PATCH /facturas/{id}/lineas` → `403` siempre
- `PATCH /facturas/{id}/estado` → **no bloqueado**
- Exportar `is_locked: true` (literal) en `FacturaOut`

### Backend — Seteo del lock

```python
# Al crear NV desde cotizacion (nota_ventas.py)
if cotizacion_id:
    cotizacion = db.get(Cotizacion, cotizacion_id)
    cotizacion.is_locked = True

# Al crear Factura desde NV (facturas.py)
if nv_id:
    nv = db.get(NotaVenta, nv_id)
    nv.is_locked = True
```

### Frontend

En `CotizacionDetalle`, `NVDetalle`, `FacturaDetalle`: si `is_locked=True`:

- Todos los `input`/`select`/`textarea` → `disabled`
- Botones guardar/editar líneas → ocultos
- Banner superior con razón:
  - Cotización: *"Este documento está bloqueado — se generó una Nota de Venta desde esta cotización"*
  - NV: *"Este documento está bloqueado — se generó una Factura desde esta nota de venta"*
  - Factura: *"Las facturas no son editables una vez emitidas"*
- Botones de cambio de estado → **no afectados**

---

## 2. Forzar contado en UI

### Estado actual

`enforce_al_contado()` en `app/api/shared.py` ya fuerza `terminos_pago="al_contado"` en backend cuando `empresa.linea_credito` es null o ≤ 0. Está llamado en 4 lugares (create/update de Cotizacion y NV).

### Cambio requerido — Solo frontend

En `CotizacionDetalle` y `NVDetalle`, cuando hay empresa seleccionada:

```
si empresa.linea_credito == null || empresa.linea_credito <= 0:
    campo terminos_pago → disabled
    valor forzado → "Al contado"
    tooltip → "Esta empresa no tiene línea de crédito"
```

El campo se re-evalúa cada vez que cambia la empresa seleccionada.

No se requiere cambio en backend ni en modelos.

---

## Fuera de alcance (backlog)

- Botón "Duplicar cotización" (nueva con mismos datos + precios actualizados) — mencionado por cliente como complemento al bloqueo.
- Desbloqueo manual con confirmación — descartado explícitamente por el cliente.
