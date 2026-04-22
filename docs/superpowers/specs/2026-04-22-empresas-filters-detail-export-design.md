# Empresas — Filtros, Detalle y Exportación

**Fecha:** 2026-04-22
**Estado:** Aprobado

---

## Resumen

Mejora de la pantalla Empresas con:
1. Filtros avanzados en la lista (sector, productos comprados multi-select)
2. Columna "Última Compra" y sort por cualquier columna
3. Modal de detalle con 4 tabs (Resumen, Facturas, Productos, Crédito)
4. Panel de exportación dentro de cada tab (Excel, CSV, PDF; email/WhatsApp pendiente)

---

## 1. Arquitectura de componentes

```
frontend/src/
├── pages/
│   └── Empresas.tsx                  (orquestador, ~200 líneas)
├── components/
│   ├── EmpresaFilters.tsx            (barra de filtros de la lista)
│   ├── EmpresaDetailModal.tsx        (modal grande con tabs)
│   ├── EmpresaTabResumen.tsx         (tab info + editar)
│   ├── EmpresaTabFacturas.tsx        (tab facturas + export)
│   ├── EmpresaTabProductos.tsx       (tab líneas de productos + export)
│   ├── EmpresaTabCredito.tsx         (tab crédito)
│   └── ExportPreviewPanel.tsx        (existente, reutilizado)
└── lib/
    └── columnDefs.ts                 (agregar EMPRESA_FACTURA_COLS, EMPRESA_PRODUCTO_COLS)
```

`Empresas.tsx` maneja: estado de filtros de lista, query principal, ID de empresa seleccionada para abrir modal.

---

## 2. Cambios backend

### 2a. Extender `GET /api/empresas/`

Nuevos query params:
| Param | Tipo | Descripción |
|---|---|---|
| `sector` | `str` | Filtrar por sector exacto |
| `producto_ids` | `list[int]` | Empresas que compraron al menos uno de estos productos (JOIN facturas → lineas_factura → productos) |
| `sort_by` | `str` | Columna: `nombre`, `rut`, `sector`, `ultima_compra`, `deuda_total`, `deuda_vencida` |
| `sort_dir` | `asc\|desc` | Dirección de orden |

Respuesta agrega campo:
```python
ultima_compra: date | None  # MAX(facturas.fecha) WHERE empresa_id = self.id AND NOT anulada
```

### 2b. Nuevos endpoints

```
GET  /api/empresas/{id}/facturas
     params: estado, fecha_desde, fecha_hasta, monto_min, monto_max, sort_by, sort_dir
     returns: list[FacturaResumen]

GET  /api/empresas/{id}/productos
     params: q (SKU/descripcion), fecha_desde, fecha_hasta, sort_by, sort_dir
     returns: list[LineaProductoDetalle]
     # LineaProductoDetalle: fecha, factura_numero, sku, descripcion, cantidad, precio_unit, total

GET  /api/empresas/{id}/export/facturas
     params: mismos filtros + columns, format (xlsx|csv|pdf), send_to? (email|whatsapp)
     returns: file blob o {"status":"pending"} con HTTP 501 si send_to presente

GET  /api/empresas/{id}/export/productos
     params: mismos filtros + columns, format (xlsx|csv|pdf), send_to? (email|whatsapp)
     returns: file blob o {"status":"pending"} con HTTP 501 si send_to presente
```

**PDF:** usar `reportlab` o `weasyprint` (agregar como dependencia si no existe).

**Email / WhatsApp:** destino es el usuario logueado (precargado desde perfil). Endpoints retornan `HTTP 501 {"status": "pending", "message": "No implementado"}` hasta que estén disponibles los secrets/endpoints externos.

---

## 3. Lista de Empresas (UI)

### Filtros
- **Búsqueda texto** (nombre / RUT): existente, sin cambios
- **Sector**: dropdown con valores únicos de `sector` en BD
- **Productos comprados**: dropdown multi-select con búsqueda de texto interna. Al escribir filtra los productos seleccionables. Al seleccionar uno o más, se envían como `producto_ids[]` al backend. Pill activo muestra nombres + botón ✕.
- **Con Deuda**: toggle existente, sin cambios

### Columnas de tabla
Todas las columnas son sortables (click en header alterna asc/desc):

| Columna | Nota |
|---|---|
| Nombre | existente |
| RUT | existente |
| Sector | existente |
| Forma Pago | existente |
| Prioridad | existente |
| **Última Compra** | **nueva**, resaltada en azul |
| Deuda | existente |
| Vencida | existente |
| Acciones | botón **"Ver"** (reemplaza "Deuda") + "Editar" |

El botón **"Ver"** abre el modal de detalle. El botón **"Editar"** abre el modal de edición existente.

---

## 4. Modal de detalle

Modal grande (fullscreen-ish), mismo patrón visual que el modal de Deuda actual pero extendido.

**Header:** nombre empresa, RUT, sector, prioridad. Botón ✕ cierra.

### Tabs

#### Resumen
- Grid de campos: RUT, Sector, Forma Pago, Última Compra, Email, Plazo, Línea de Crédito, Límite de Crédito, Ubicación, Nota de Cobranza
- Botón "Editar empresa" abre el modal de edición existente

#### Facturas
- Filtros: Estado (dropdown multi), Fecha desde/hasta, Monto min/max
- Tabla sortable: Nº, Fecha, Estado (badge), Total, Pagado, Pendiente
- Botón "Exportar" expande panel de exportación en la parte inferior del tab

#### Productos comprados
- **Detalle línea por línea** (no agregado): cada fila = una línea de factura
- Columnas: Fecha, Nº Factura, SKU, Descripción, Cantidad, Precio Unit, Total
- Filtros: búsqueda texto (SKU/descripción), rango de fechas
- Todas las columnas sortables
- Footer: count de líneas, count de facturas distintas, total $
- Botón "Exportar" expande panel de exportación

#### Crédito
- Datos: Línea de crédito, Límite de crédito, Crédito usado, Crédito disponible, Plazo
- Usa el endpoint existente `/api/empresas/{id}/credito`

---

## 5. Panel de exportación

Se expande dentro del tab (no es un modal adicional). Botón "Exportar" lo muestra/oculta.

**Contenido del panel:**
1. Selector de columnas (toggle por columna, persistido en localStorage)
2. Preview de los datos filtrados (máx. 200 filas, igual que ExportPreviewPanel existente)
3. Botones de descarga: **Excel** | **CSV** | **PDF**
4. Botones de envío: **Email** (icono 📧, tooltip "Pendiente") | **WhatsApp** (icono 💬, tooltip "Pendiente") — visibles pero deshabilitados hasta implementación

El export respeta los filtros y orden activos en el tab.

---

## 6. Estado pendiente

| Feature | Estado | Bloqueado por |
|---|---|---|
| Export Excel | Implementar | — |
| Export CSV | Implementar | — |
| Export PDF | Implementar | Instalar reportlab/weasyprint |
| Envío por Email | **PENDIENTE** | Endpoints/secrets externos |
| Envío por WhatsApp | **PENDIENTE** | Endpoints/secrets externos |

---

## 7. Lo que NO cambia

- Modal de edición de empresa (CreateEditModal existente)
- Endpoint de deuda existente (`/api/empresas/{id}/deuda`) — sigue siendo usado internamente para las stats de la lista
- Tab Crédito usa `/api/empresas/{id}/credito` (endpoint existente)
- Lógica de autenticación y permisos
- Stats bar (Deuda total, Deuda vencida, Con Deuda)
