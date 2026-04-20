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

- [ ] **Fase 4a — Empresa + Cliente (actualización)**
  - Nuevo módulo Empresa: CRUD, búsqueda, Excel
  - Clientes asociados a Empresa (FK nullable); campos heredados read-only en formulario
  - Nuevos campos en Cliente: recibe_correo, forma_pago, despacho_o_retiro, comuna, direccion_despacho, ultimo_contacto, forma_captacion, compromiso, es_nuevo
  - Migración cotizaciones: agregar empresa_id nullable

- [x] **Fase 4b — Nota de Venta + Factura**
  - [x] **Fase 4b-1 — Nota de Venta**: creación desde cero o desde cotización (líneas editables, selección parcial)
  - Numeración correlativa propia (nv_last_id)
  - Estados: Pendiente → Despachada → Entregada → Pagada | Cancelada
  - [x] **Fase 4b-2 — Factura**: generada manualmente desde NV (botón "Generar Factura")
  - Factura hereda líneas y totales desde NV; registro de pago opcional
  - PDF mismo formato que cotización + email
  - Número correlativo propio (factura_last_id)
  - Estados: Emitida → Pagada → Anulada
  - Fecha de vencimiento + registro de pago (fecha, monto, método)
  - PDF + email

- [ ] **Fase 6 — Órdenes de Compra**
  - Asociada a proveedor
  - Estados: Borrador → Enviada → Recibida parcial → Recibida completa → Cancelada
  - Al recepcionar: actualiza stock en inventario
  - PDF + email al proveedor

- [x] **Fase 7 — Inventario**
  - Stock actual por producto
  - Movimientos: entrada (OC recepcionada), salida (NV creada), ajuste manual con motivo
  - Historial global y por producto (con filtros tipo/fecha/producto)
  - Alertas de stock bajo: badge en sidebar, banner en /inventario, indicador en catálogo
  - Ajuste manual: suma/resta, motivo fijo (conteo_fisico, merma, correccion, otro), nota opcional

- [x] **Fase 8 — RRHH** *(solo Admin)*
  - CRUD empleados: nombre, cargo, sueldo, fecha ingreso
  - Documentos adjuntos (contratos, liquidaciones) — almacenados en disco, descarga protegida
  - Registro de períodos de vacaciones
  - Volumen Docker `uploads_data` para persistencia de archivos

- [x] **Fase 10 — Control de crédito + aprobaciones**
  - `GET /api/empresas/{id}/credito`: calcula crédito usado (facturas no pagadas) y disponible
  - Cotización: advertencia no bloqueante si se excede el crédito al guardar
  - NV nueva: si excede el crédito, flujo de aprobación asíncrono (no se crea hasta que admin apruebe)
  - `AprobacionCredito`: modelo con origen (cotizacion/directa), payload JSON de la NV, estado (pendiente/aprobada/denegada)
  - Admin aprueba → NV se crea automáticamente y vendedor es redirigido
  - Admin deniega → vendedor ve error y permanece en el formulario
  - `CreditWarningModal`: modo warning (cotización) y modo request (NV) con spinner de espera y polling cada 3s
  - Página `/aprobaciones`: solo admin/subadmin; lista pendientes con Aprobar/Denegar por fila; badge en sidebar

- [x] **Fase 9 — Dashboard configurable**
  - 8 widgets: ventas período, cotizaciones abiertas, top clientes, top productos, stock crítico, NV por cobrar, cotizaciones/ventas por vendedor
  - Layout persistido por rol en DB (dashboard_layouts); admin edita layouts con drag-and-drop (react-grid-layout)
  - Modo edición: agregar/mover/redimensionar/eliminar widgets; configurar tipo de gráfico y rango de tiempo
  - Templates predefinidos: Ventas, Operacional, Completo
  - Vendedor ve datos filtrados automáticamente a sus propias ventas; sin acceso a widgets admin-only
  - Gráficos: KPI, barras, línea (Recharts); tablas inline

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
