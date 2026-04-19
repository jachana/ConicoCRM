# Conico PMS — Progress

## Phases

- [x] **Fase 1 — Fundación**
  - JWT auth (access + refresh tokens)
  - Roles: admin, subadmin, vendedor
  - Permisos configurables por usuario (toggles módulo × acción)
  - Gestión de usuarios (CRUD)
  - Layout base: sidebar colapsable, dark/light theme

- [x] **Fase 2 — Datos maestros**
  - Catálogo de productos (CRUD, búsqueda, alerta stock bajo, Excel)
  - Clientes (CRUD, búsqueda por nombre y RUT, Excel)
  - Proveedores (CRUD, Excel)

- [x] **Fase 3 — Cotizaciones**
  - Numeración correlativa desde 12250 (SELECT FOR UPDATE)
  - Líneas con autocomplete de productos, cálculo IVA 19%, margen interno
  - PDF via WeasyPrint + template HTML
  - Email SMTP con PDF adjunto (degradación elegante si no configurado)
  - Estados: no_definido → abierta → cerrada_fv → rechazada
  - Exportación Excel
  - SystemConfig: tabla key/value para configuración global

- [ ] **Fase 4 — Nota de Venta**
  - Conversión desde cotización aprobada (datos heredados, editables)
  - Misma estructura de líneas que cotización
  - Estados: Pendiente → Entregada → Cancelada
  - PDF + email
  - Botón "Generar Factura"

- [ ] **Fase 5 — Facturas**
  - Generada desde nota de venta
  - Número correlativo
  - Estados: Emitida → Pagada → Anulada
  - Fecha de vencimiento + registro de pago (fecha, monto, método)
  - PDF + email

- [ ] **Fase 6 — Órdenes de Compra**
  - Asociada a proveedor
  - Estados: Borrador → Enviada → Recibida parcial → Recibida completa → Cancelada
  - Al recepcionar: actualiza stock en inventario
  - PDF + email al proveedor

- [ ] **Fase 7 — Inventario**
  - Stock actual por producto
  - Movimientos: entrada (OC), salida (factura), ajuste manual
  - Historial con fecha, tipo y usuario
  - Alertas de stock bajo

- [ ] **Fase 8 — RRHH** *(solo Admin)*
  - CRUD empleados: nombre, cargo, sueldo, fecha ingreso
  - Documentos adjuntos (contratos, liquidaciones)
  - Registro de vacaciones

- [ ] **Fase 9 — Dashboard / Reportes**
  - Admin/SubAdmin: ventas del período, cotizaciones pendientes, stock crítico, facturas por cobrar, top clientes, top productos
  - Vendedor: solo métricas propias
  - Filtros por fecha + exportación Excel

---

## Flujo de documentos

```
Cotización → Nota de Venta → Factura
```

Cada etapa hereda datos de la anterior (editables), tiene PDF y email propio.

---

## Fuera de scope (v1)

- Integración SII / factura electrónica DTE
- App móvil
- Multi-empresa / multi-sucursal
- API pública
- Notificaciones en tiempo real
