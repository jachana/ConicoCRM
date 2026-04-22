# Sprint A — Quick Wins Design

**Date:** 2026-04-22  
**Status:** Approved  
**Scope:** 5 independent improvements across Productos, NV, Cotizaciones, Facturas, Empresas

---

## 1. Producto — Tags Arbitrarias + Búsqueda por SKU/Tag

### Modelo

Nueva tabla `ProductoTag`:
- `id: int` (PK)
- `nombre: str` (único, case-insensitive)
- `created_at: datetime`

Tabla junction `producto_tag_link`:
- `producto_id: int` (FK → Producto)
- `tag_id: int` (FK → ProductoTag)
- PK compuesta (producto_id, tag_id)

### Backend

- Endpoints `/api/tags`: GET (listar), POST (crear), DELETE (borrar si sin uso).
- `ProductoOut` schema incluye `tags: list[str]`.
- `ProductoCreate` / `ProductoUpdate` aceptan `tags: list[str]` — se crean tags nuevas si no existen.
- Todos los endpoints de búsqueda de productos que aceptan param `q` filtran por `nombre LIKE q OR sku LIKE q OR tag.nombre LIKE q` (case-insensitive via SQLAlchemy `ilike` o `func.lower`).
- Afecta: `/api/productos?q=`, `/api/cotizaciones` (autocomplete líneas), `/api/nota_ventas` (autocomplete líneas), `/api/inventario` (ajustes).

### Frontend

- Form de producto (Productos.tsx): input multi-tag — agregar/quitar tags con chips.
- Todos los autocompletes/buscadores de producto: el placeholder dice "Nombre, SKU o tag".
- La búsqueda ya funciona por el cambio de backend; no se requiere cambio en la lógica frontend de llamada si el param ya es `q`.

---

## 2. Nota de Venta — Dirección de Despacho Obligatoria

### Modelo

Nuevos campos en `NotaVenta`:
- `direccion_despacho: str | None = None`
- `retiro_en_conico: bool = False`

### Validación Backend

En create y update de NV:
- Si `retiro_en_conico=False` y `direccion_despacho` es `None` o vacía → HTTP 422: "Debe indicar dirección de despacho o marcar retiro en Conico."
- Si `retiro_en_conico=True` → `direccion_despacho` se ignora/limpia.

### Frontend (NotaVentaDetalle.tsx / form de creación)

- Checkbox "Retiro en Conico".
- Campo texto "Dirección de despacho" (obligatorio visualmente).
- Comportamiento: si checkbox marcado → campo deshabilitado y vacío. Si desmarcado → campo habilitado y requerido.
- Mostrar dirección/retiro en vista detalle y PDF.

---

## 3. Cotización — Validez + Descuento por Línea

### Modelo

`Cotizacion`:
- `validez_dias: int = 5`

`CotizacionLinea`:
- `descuento: float = 0.0` (porcentaje, rango 0–100)

### Lógica de cálculo

`total_neto_linea = valor_neto_unitario * cantidad * (1 - descuento / 100)`

El campo `valor_neto` existente en `CotizacionLinea` es el precio unitario sin descuento. El `total_neto` se recalcula con el descuento aplicado. El `margen` se calcula sobre el precio final post-descuento.

### Backend

- Schema `CotizacionLineaCreate` / `Update` incluye `descuento: float = 0.0`.
- Validación: `0 <= descuento <= 100`.
- El endpoint de recalculo de totales respeta el descuento.

### Frontend (CotizacionDetalle.tsx)

- Campo "Validez (días)" en cabecera de cotización, editable, default 5.
- Columna "Desc %" en la tabla de líneas, editable por línea.
- En vista detalle/PDF: mostrar descuento aplicado por línea si es > 0.
- Mostrar fecha de vencimiento calculada = `fecha + validez_dias` en la cabecera.

---

## 4. Factura — Banco de Recepción

### Modelo

Nueva tabla `BancoReceptor`:
- `id: int` (PK)
- `nombre: str` (único)
- `activo: bool = True`

`Factura`:
- `banco_receptor_id: int | None = None` (FK → BancoReceptor, nullable)

### Backend

- Endpoints `/api/bancos-receptores`: GET (listar activos), POST (crear), PATCH `/{id}` (activar/desactivar), DELETE `/{id}`.
- `FacturaOut` incluye `banco_receptor: str | None`.
- Campo opcional — facturas existentes sin banco no se ven afectadas.

### Frontend

- **Settings**: nueva sección "Bancos de recepción" — lista con toggle activo/inactivo y botón "Agregar banco".
- **FacturaDetalle.tsx / form**: select dropdown "Banco de recepción" con opciones de bancos activos. Opcional (no bloquea guardar si vacío).

---

## 5. Empresa — Sin Línea de Crédito → Al Contado Forzado

### Regla de negocio

Si `empresa.linea_credito` es `False` o `None`:
- `terminos_pago` en Cotización y NV se fuerza a `"al_contado"`.
- Cualquier otro valor enviado retorna HTTP 422.

### Backend

- En crear/actualizar `Cotizacion` y `NotaVenta`: si la empresa asociada no tiene `linea_credito`, sobreescribir `terminos_pago = "al_contado"` silenciosamente (o validar y rechazar — preferir sobreescribir para no romper flujos automáticos).
- No afecta `Factura` (la factura hereda el estado del flujo NV → Factura).

### Frontend

- Al seleccionar empresa en form de Cotización o NV: si `empresa.linea_credito` es falso, el campo "Términos de pago / Plazo" se deshabilita y muestra "Al contado" fijo.
- Si el usuario cambia la empresa a una con crédito, el campo se habilita.

---

## Migraciones de BD

Todas las tablas/columnas nuevas requieren migración Alembic:
1. `producto_tag` + `producto_tag_link`
2. `nota_venta.direccion_despacho`, `nota_venta.retiro_en_conico`
3. `cotizacion.validez_dias`, `cotizacion_linea.descuento`
4. `banco_receptor` + `factura.banco_receptor_id`

Columnas nullable o con default — no rompen registros existentes.

---

## Out of scope (Sprints futuros)

- Bloqueos en cadena Cotiz → NV → Factura (Sprint B)
- Sedes de despacho 1-N en Empresa (Sprint F)
- FIFO + historial de movimientos (Sprint D)
- Marca, volumen, PDFs en Producto (Sprint C)
- Reportes por marca (Sprint E)
