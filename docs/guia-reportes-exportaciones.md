# Reportes y Exportaciones — Guía de usuario

Referencia de los reportes disponibles en Conico CRM, sus filtros, métricas y opciones de exportación.

> **Acceso:** Todos los reportes requieren rol **Admin** o **SubAdmin**. Los Vendedores no tienen acceso al módulo de reportes.

---

## Acceder a los reportes

**Menú lateral → Reportes**

La mayoría de los reportes requieren seleccionar un **rango de fechas** (fecha desde / fecha hasta) antes de cargar los datos. Los reportes se almacenan en caché por empresa — los datos se actualizan automáticamente cuando se emiten o modifican documentos relevantes.

---

## Reporte de Ventas

**Qué muestra:** Análisis de facturas emitidas en el período seleccionado.

### Métricas principales (KPIs)

| Métrica | Descripción |
|---------|-------------|
| Total vendido | Suma de todas las facturas no anuladas del período |
| Número de facturas | Cantidad de facturas emitidas |
| Ticket promedio | Total vendido / número de facturas |
| Total cobrado | Monto efectivamente pagado (con pagos registrados) |
| Por cobrar | Total vendido − total cobrado |
| Variación vs período anterior | % de cambio respecto al mismo número de días anterior |

### Gráficos y tablas

- **Ventas diarias**: gráfico de barras con monto por día.
- **Top clientes**: ranking de clientes por monto facturado.
- **Top productos**: productos más vendidos por volumen y monto.

### Exportaciones disponibles

| Formato | Contenido |
|---------|-----------|
| **Excel** | Detalle completo de facturas (número, fecha, cliente, monto, estado) |
| **PDF** | Resumen ejecutivo con KPIs, ventas diarias, top clientes y top productos |

---

## Reporte de Cobranza

**Qué muestra:** Estado de cobro de las facturas — vencidas, por vencer y cobradas.

### Métricas principales

- Total por cobrar (pendiente de pago)
- Facturas vencidas (fecha de vencimiento pasada)
- Facturas próximas a vencer
- Promedio de días de cobro

### Tablas

- Detalle de facturas con saldo pendiente por cliente.
- Antigüedad de deuda (0–30 días, 31–60, 61–90, +90).

### Exportaciones

| Formato | Contenido |
|---------|-----------|
| **Excel** | Facturas con saldo pendiente, fecha de vencimiento, días vencidos |
| **PDF** | Resumen de cobranza con tablas de antigüedad |

---

## Reporte de Inventario

**Qué muestra:** Valorización y estado del stock actual (el rango de fechas no filtra — muestra el estado actual del inventario).

### Métricas principales

| Métrica | Descripción |
|---------|-------------|
| Valor total del stock | Suma de (precio_costo × stock_actual) por producto |
| Productos bajo mínimo | Lista de productos con stock < stock_mínimo |
| Productos sin stock | Productos con stock_actual ≤ 0 |

### Tablas

- Listado completo de productos con stock actual, mínimo y valor.
- Alerta destacada de productos críticos.

### Exportaciones

| Formato | Contenido |
|---------|-----------|
| **Excel** | Catálogo completo con stock, mínimos y valores |
| **PDF** | Resumen de valorización y tabla de productos críticos |

---

## Reporte de Compras

**Qué muestra:** Órdenes de Compra del período — proveedores, montos y estados.

### Métricas principales

- Total comprado en el período
- OC pendientes (borrador + enviadas)
- OC recepcionadas (parcial + completa)
- Top proveedores por monto

### Exportaciones

| Formato | Contenido |
|---------|-----------|
| **Excel** | Detalle de OC con proveedor, fecha, estado y monto |
| **PDF** | Resumen de compras con KPIs y top proveedores |

---

## Reporte de Márgenes

**Qué muestra:** Rentabilidad de las facturas del período, cruzando precio de venta con precio de costo de los productos.

> Este reporte requiere que los productos tengan `precio_costo` cargado. Productos sin costo no aparecen en el análisis de margen.

### Métricas principales

| Métrica | Descripción |
|---------|-------------|
| Margen promedio % | Promedio ponderado de margen sobre todas las líneas |
| Mejor producto | Producto con mayor margen % en el período |
| Peor producto | Producto con menor margen % en el período |

### Tablas

- **Por producto**: ranking de los top 20 productos por margen %, con cantidad vendida.
- **Por factura**: margen total y % por cada factura emitida.

### Exportaciones

| Formato | Contenido |
|---------|-----------|
| **Excel** | Detalle completo por producto y por factura |
| **PDF** | Top 20 productos y tabla de facturas con márgenes |

---

## Reporte por Marca

**Qué muestra:** Ventas desglosadas por marca de producto en el período.

Útil para evaluar el desempeño de líneas de producto y tomar decisiones de surtido.

### Exportaciones

| Formato | Contenido |
|---------|-----------|
| **Excel** | Ventas y cantidad por marca |
| **CSV** | Mismo contenido, para integración con otras herramientas |

---

## Reporte DTE

**Qué muestra:** Estado de los documentos tributarios electrónicos emitidos en el período.

### Cubre

- Facturas (tipo 033)
- Boletas afectas (tipo 039) y exentas (tipo 041)
- Notas de Crédito (tipo 061) y Débito (tipo 056)
- Guías de Despacho (tipo 052)

### Métricas

- Conteo y monto total por tipo de DTE
- Estado SII: `aceptada`, `rechazada`, `pendiente`, `no_emitida`
- DTEs rechazados que requieren atención

### Exportaciones

| Formato | Contenido |
|---------|-----------|
| **Excel** | Detalle de todos los DTEs del período con folio, monto y estado |
| **PDF** | Resumen por tipo de DTE con tabla de rechazados |

---

## Dashboard de KPIs

**Qué muestra:** Vista rápida del mes actual (o cualquier mes seleccionado) con los indicadores clave.

El dashboard se carga automáticamente en la pantalla de inicio. Los KPIs incluyen:

- Ventas del mes (facturas + boletas)
- Boletas vs mes anterior
- Facturas pendientes de cobro
- Stock bajo mínimo
- Cotizaciones pendientes de cierre

El mes se puede cambiar con el selector de período en el dashboard (`YYYY-MM`).

---

## Formatos de exportación

| Formato | Uso recomendado |
|---------|----------------|
| **Excel (.xlsx)** | Análisis en planilla, filtros avanzados, envío al contador |
| **PDF** | Impresión, presentación a gerencia, archivo digital |
| **CSV** | Integración con sistemas externos, importación a otras herramientas |

---

## Preguntas frecuentes

**¿Por qué el reporte de ventas no muestra boletas?**
El reporte de ventas está basado en facturas. Las boletas aparecen en el Dashboard de KPIs (combinado facturas + boletas) y en el reporte DTE. No hay un reporte de boletas standalone actualmente.

**¿Los reportes se actualizan en tiempo real?**
Sí, con caché de corto plazo. Cuando se emite una factura o se modifica un cliente, la caché se invalida y el siguiente acceso recarga los datos frescos.

**¿Los vendedores pueden ver algún reporte?**
No. Todos los reportes del módulo Reportes están restringidos a Admin y SubAdmin. Los vendedores pueden ver su propio historial de documentos desde cada módulo (Cotizaciones, NV, Boletas).

**¿Puedo exportar un reporte filtrado por vendedor?**
El reporte de márgenes tiene filtro por vendedor en la versión Excel. Los demás reportes son globales de la empresa.

**¿Los reportes incluyen documentos anulados?**
No. Facturas y documentos con `estado=anulada` se excluyen de los cálculos de totales y KPIs.
