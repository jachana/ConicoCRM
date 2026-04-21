# Reportes / Analytics Design Spec

## Goal

Módulo `/reportes` — hub con 6 tabs, date picker compartido, KPIs + tablas + gráficos por tab, exportación Excel y PDF por tab. Reutiliza librerías ya instaladas: `recharts`, `openpyxl`, `weasyprint`.

---

## Architecture

```
Frontend
└── /reportes (Reportes.tsx)
    ├── DateRangePicker  — preset + rango personalizado, aplica a tab activo
    ├── Tab: Ventas
    ├── Tab: Cobranza
    ├── Tab: Inventario
    ├── Tab: Compras
    ├── Tab: Márgenes
    └── Tab: DTE

Backend
└── backend/app/api/reportes.py
    ├── GET /api/reportes/ventas          → JSON
    ├── GET /api/reportes/ventas/export/excel
    ├── GET /api/reportes/ventas/export/pdf
    ├── GET /api/reportes/cobranza        → JSON
    ├── GET /api/reportes/cobranza/export/excel
    ├── GET /api/reportes/cobranza/export/pdf
    ├── GET /api/reportes/inventario      → JSON
    ├── GET /api/reportes/inventario/export/excel
    ├── GET /api/reportes/inventario/export/pdf
    ├── GET /api/reportes/compras         → JSON
    ├── GET /api/reportes/compras/export/excel
    ├── GET /api/reportes/compras/export/pdf
    ├── GET /api/reportes/margenes        → JSON
    ├── GET /api/reportes/margenes/export/excel
    ├── GET /api/reportes/margenes/export/pdf
    ├── GET /api/reportes/dte             → JSON
    ├── GET /api/reportes/dte/export/excel
    └── GET /api/reportes/dte/export/pdf
```

**Query params:** `date_from` y `date_to` (ISO date, e.g. `2026-04-01`) en todos los endpoints.  
**Permisos:** todos requieren `facturas.view`. Vendedor ve solo sus propios datos en tabs Ventas y Márgenes; admin ve todo.  
**Router:** registrado en `main.py` con prefix `/api/reportes`.

---

## Per-Tab Content

### Tab Ventas (uso diario)

**JSON response:**
```json
{
  "kpis": {
    "total_vendido": 12450000,
    "num_facturas": 34,
    "ticket_promedio": 366176,
    "total_por_cobrar": 3200000,
    "variacion_vs_periodo_anterior": 8.2
  },
  "ventas_diarias": [
    { "fecha": "2026-04-01", "monto": 450000 }
  ],
  "top_clientes": [
    { "cliente_id": 1, "nombre": "Constructora XYZ", "total": 2100000, "num_facturas": 5 }
  ],
  "por_vendedor": [
    { "vendedor_id": 1, "nombre": "Juan", "total": 4500000, "num_facturas": 12 }
  ]
}
```

**Fuente de datos:** `facturas` (estado != "anulada") + `pagos`.  
**Variación:** compara el período inmediatamente anterior de igual duración (ej: si el período es Apr 1-21 → 21 días, el período anterior es Mar 11-31).  
**Gráfico:** BarChart de ventas diarias (recharts).  
**Excel:** una hoja "Ventas" con columnas: Fecha, Cliente, Vendedor, Total Neto, IVA, Total, Estado.  
**PDF:** KPIs + tabla top clientes + tabla por vendedor.

---

### Tab Cobranza (uso diario)

**JSON response:**
```json
{
  "kpis": {
    "total_por_cobrar": 8500000,
    "total_vencido": 2100000,
    "proximas_a_vencer_7d": 900000
  },
  "aging": {
    "d_0_30":   { "count": 5, "monto": 2400000 },
    "d_31_60":  { "count": 3, "monto": 1800000 },
    "d_61_90":  { "count": 2, "monto": 1200000 },
    "d_90_plus":{ "count": 1, "monto": 1100000 }
  },
  "por_empresa": [
    { "empresa_id": 1, "nombre": "Empresa ABC", "saldo": 1500000, "dias_vencida": 45 }
  ]
}
```

**Fuente de datos:** reutiliza la lógica de `GET /api/cobranza/dashboard` y `GET /api/cobranza/recordatorios`. El date range filtra `facturas.fecha` (fecha de emisión) entre `date_from` y `date_to`. Los buckets de aging se calculan siempre desde hoy (`today - fecha_vencimiento`) independiente del date range.  
**Gráfico:** 4 barras de aging (horizontal o vertical, recharts).  
**Excel:** hoja "Cobranza" con columnas: Empresa, N° Factura, Fecha Vencimiento, Total, Pagado, Saldo, Días Vencida.  
**PDF:** KPIs + tabla aging + tabla por empresa.

---

### Tab Inventario (uso diario)

**JSON response:**
```json
{
  "kpis": {
    "valor_total_stock": 45200000,
    "num_bajo_minimo": 8,
    "num_sin_stock": 2
  },
  "bajo_minimo": [
    { "producto_id": 1, "nombre": "Producto X", "sku": "SKU001", "stock_actual": 2, "stock_minimo": 10 }
  ],
  "top_vendidos": [
    { "producto_id": 2, "nombre": "Producto Y", "cantidad_vendida": 45, "monto_total": 900000 }
  ]
}
```

**Fuente:** `productos` para valor stock (`SUM(precio_costo * stock_actual)`). `movimientos_inventario` tipo `salida` del período para top vendidos. El date range aplica al cálculo de top vendidos; KPIs de stock son siempre al momento actual.  
**Excel:** dos hojas — "Stock Actual" (todos los productos con stock y valor) y "Top Vendidos" (del período).  
**PDF:** KPIs + tabla bajo mínimo + tabla top vendidos.

---

### Tab Compras (uso semanal)

**JSON response:**
```json
{
  "kpis": {
    "total_comprado": 6800000,
    "num_oc_emitidas": 12,
    "num_oc_pendientes": 3
  },
  "por_proveedor": [
    { "proveedor_id": 1, "nombre": "Proveedor A", "total": 2400000, "num_oc": 4 }
  ],
  "por_estado": [
    { "estado": "enviada", "count": 3, "total": 1200000 },
    { "estado": "recibida_completa", "count": 8, "total": 4800000 }
  ]
}
```

**Fuente:** `ordenes_compra` del período (`fecha` entre `date_from` y `date_to`).  
**Excel:** hoja "Compras" con columnas: N° OC, Fecha, Proveedor, Estado, Total Neto, IVA, Total.  
**PDF:** KPIs + tabla por proveedor + tabla por estado.

---

### Tab Márgenes (uso semanal)

**JSON response:**
```json
{
  "kpis": {
    "margen_promedio_pct": 32.5,
    "mejor_producto": { "nombre": "Prod A", "margen_pct": 68.0 },
    "peor_producto":  { "nombre": "Prod B", "margen_pct": 4.2 }
  },
  "por_producto": [
    {
      "producto_id": 1,
      "nombre": "Prod A",
      "cantidad_vendida": 20,
      "precio_costo_promedio": 5000,
      "precio_venta_promedio": 9500,
      "margen_pct": 47.4
    }
  ],
  "por_factura": [
    { "factura_id": 1, "numero": 101, "total": 500000, "margen_total": 180000, "margen_pct": 36.0 }
  ]
}
```

**Fuente:** `factura_lineas.margen` y `nota_venta_lineas.margen` del período. Vendedor filtrado a sus propias facturas/NV.  
**Excel:** hoja "Márgenes por Producto" + hoja "Márgenes por Factura".  
**PDF:** KPIs + tabla por producto (top 20) + tabla por factura.

---

### Tab DTE (uso semanal)

**JSON response:**
```json
{
  "kpis": {
    "total_emitidos": 45,
    "aceptadas": 38,
    "rechazadas": 3,
    "pendientes": 4
  },
  "por_tipo": [
    { "tipo": "033", "label": "Factura", "count": 34, "aceptadas": 30 },
    { "tipo": "061", "label": "Nota Crédito", "count": 8, "aceptadas": 6 },
    { "tipo": "056", "label": "Nota Débito", "count": 3, "aceptadas": 2 }
  ],
  "emisiones": [
    {
      "id": 1, "tipo": "033", "folio": 101,
      "estado": "aceptada", "monto_total": 500000,
      "created_at": "2026-04-10", "detalle_rechazo": null
    }
  ]
}
```

**Fuente:** `dte_emisiones` del período (`created_at` entre `date_from` y `date_to`).  
**Excel:** hoja "DTE" con columnas: Tipo, Folio, TrackID, Estado, Monto Total, Fecha Emisión, Fecha Aceptación.  
**PDF:** KPIs + tabla de emisiones.

---

## Frontend

**File:** `frontend/src/pages/Reportes.tsx`  
Componente único con estado `activeTab` + `dateFrom`/`dateTo`. Cada tab renderiza su sección inline (no archivos separados — cada tab es ~100 líneas).

**DateRangePicker:**
```typescript
presets = [
  { label: 'Este mes', ... },
  { label: 'Mes anterior', ... },
  { label: 'Este año', ... },
  { label: 'Últimos 3 meses', ... },
  { label: 'Rango personalizado', ... },  // muestra inputs de fecha
]
```

**Charts:** `recharts` — `BarChart` para ventas diarias (Ventas tab) y aging buckets (Cobranza tab).

**Export buttons:** cada tab tiene botones "↓ Excel" y "↓ PDF" que hacen `GET /api/reportes/{tab}/export/excel` y `.../export/pdf` con `date_from` y `date_to` como query params. Descarga via `window.open(url)` o `<a href download>`.

**Sidebar:** agregar "Reportes" con ícono `BarChart2` (lucide-react) en la sección principal.

**Types:** agregar en `frontend/src/types/index.ts` las interfaces para cada tab response.

---

## Backend — Export Format

**Excel:** `openpyxl`, patrón idéntico al de `backend/app/api/facturas.py`. Cada reporte tiene una o dos hojas. `StreamingResponse` con `Content-Disposition: attachment; filename={tab}-{date_from}-{date_to}.xlsx`.

**PDF:** WeasyPrint con plantilla HTML inline (string, no archivo externo). Plantilla mínima: logo/empresa → título + período → KPIs en tabla → datos principales en tabla. `StreamingResponse` con `Content-Disposition: attachment; filename={tab}-{date_from}-{date_to}.pdf`.

**Variación vs período anterior (Ventas):** calcula la duración del período solicitado, busca el período inmediatamente anterior de igual duración, compara `total_vendido`.

---

## Error Handling

- `date_from > date_to` → 422 con detalle "date_from debe ser anterior a date_to"
- Sin datos en el período → respuesta válida con KPIs en 0 y listas vacías (no 404)
- WeasyPrint falla → 500 con log, no silencia el error

---

## Out of Scope

- Reportes programados / envío por email automático (pertenece al módulo Notificaciones)
- Dashboard personalizable de reportes (el Dashboard existente cubre esto)
- Comparativo multi-empresa
- Filtros adicionales por vendedor/cliente dentro del tab (solo admin ve todo; vendedor ve los suyos)
