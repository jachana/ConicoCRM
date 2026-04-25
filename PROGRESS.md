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

- [x] **Fase 4a — Empresa + Cliente**
  - Módulo Empresa: CRUD, búsqueda, Excel, página con tabs (Clientes, Facturas, Productos, Cotizaciones)
  - EmpresaDetailModal con 4 tabs, filtros, sort por columna, export
  - Clientes asociados a Empresa (FK nullable); campos heredados read-only en formulario
  - Campos Cliente: recibe_correo, forma_pago, despacho_o_retiro, comuna, direccion_despacho, ultimo_contacto, forma_captacion, compromiso, es_nuevo
  - ClienteSelectModal en flujo Cotización/NV con scope por empresa
  - Cotizaciones/NVs con empresa_id nullable

- [x] **Fase 4b — Nota de Venta + Factura**
  - **Fase 4b-1 — Nota de Venta**: creación desde cero o desde cotización (líneas editables, selección parcial)
  - Numeración correlativa propia (nv_last_id)
  - Estados: Pendiente → Despachada → Entregada → Pagada | Cancelada
  - **Fase 4b-2 — Factura**: generada manualmente desde NV (botón "Generar Factura")
  - Factura hereda líneas y totales desde NV; registro de pago opcional
  - PDF mismo formato que cotización + email
  - Número correlativo propio (factura_last_id)
  - Estados: Emitida → Pagada → Anulada
  - Fecha de vencimiento + registro de pago (fecha, monto, método)
  - Chain locking: cotización se bloquea al crear NV; NV se bloquea al crear factura; factura siempre 403 en PATCH
  - Banner de bloqueo y campos deshabilitados en UI downstream
  - Banco receptor y método de pago con dropdown en FacturaDetalle

- [x] **Fase 6 — Órdenes de Compra**
  - OrdenCompra + OrdenCompraLinea, numeración correlativa (orden_compra_last_id)
  - Estados: borrador → enviada → recibida parcial → recibida completa → cancelada
  - API CRUD completa + endpoints de recepción
  - PDF via WeasyPrint + template HTML
  - Email SMTP con PDF adjunto al proveedor
  - Recepción: crea MovimientoInventario (entrada) y actualiza stock
  - Frontend: páginas OrdenesCompra list + detail, wired al router

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

- [x] **Fase 9 — Dashboard configurable**
  - 8 widgets: ventas período, cotizaciones abiertas, top clientes, top productos, stock crítico, NV por cobrar, cotizaciones/ventas por vendedor
  - Layout persistido por rol en DB (dashboard_layouts); admin edita layouts con drag-and-drop (react-grid-layout)
  - Modo edición: agregar/mover/redimensionar/eliminar widgets; configurar tipo de gráfico y rango de tiempo
  - Templates predefinidos: Ventas, Operacional, Completo
  - Vendedor ve datos filtrados automáticamente a sus propias ventas; sin acceso a widgets admin-only
  - Gráficos: KPI, barras, línea (Recharts); tablas inline

- [x] **Fase 10 — Control de crédito + aprobaciones**
  - `GET /api/empresas/{id}/credito`: calcula crédito usado (facturas no pagadas) y disponible
  - Cotización: advertencia no bloqueante si se excede el crédito al guardar
  - NV nueva: si excede el crédito, flujo de aprobación asíncrono (no se crea hasta que admin apruebe)
  - `AprobacionCredito`: modelo con origen (cotizacion/directa), payload JSON de la NV, estado (pendiente/aprobada/denegada)
  - Admin aprueba → NV se crea automáticamente; admin deniega → vendedor ve error
  - `CreditWarningModal`: sin polling — vendedor envía solicitud y ve banner de estado al volver
  - Página `/aprobaciones`: lista unificada de solicitudes de crédito y margen con badge de tipo

- [x] **Fase 11 — Solicitud de ajuste de márgenes**
  - `AprobacionMargen`: modelo con `cotizacion_id`, snapshot JSON de líneas propuestas, estado pendiente/aprobada/denegada
  - "Latest wins": nueva solicitud auto-deniega la pendiente anterior para la misma cotización
  - API `/api/aprobaciones_margen/`: POST (vendedor), GET list (filtrable por cotizacion_id/estado), GET detail, PATCH (admin)
  - En aprobación: aplica `valor_neto_propuesto` a cada línea, recalcula márgenes desde precio_costo, actualiza totales cotización
  - Vendedor edita márgenes con input de borde punteado (propuesta local, no modifica datos guardados); precio propuesto se muestra inline
  - Botón "Solicitar ajuste de márgenes" aparece cuando hay propuestas; abre modal con tabla resumen + nota
  - Admins editan valor_neto y margen directamente; vendedores ven ambos campos como solo lectura (excepto propuesta)
  - Banners en CotizacionDetalle para estado de solicitud de crédito y de margen

- [x] **Productos v2 — Catálogo extendido + costos por lista de precios**
  - Campos nuevos: Marca (FK a Marcas con CRUD admin), Volumen, IVA configurable, precio_con_iva, costo_con_iva computados
  - ProductoModal con tabs: datos, Documentos (hasta 5 PDFs), Historial costos, Lotes
  - ProductoDocumento: upload/download/delete con permiso catalogo:delete
  - Sistema de costos basado en listas de precios (reemplazó FIFO): tabla ListaPrecios + ListaPrecioItem, campo precio_costo_actualizado_en en Producto
  - Página `/listas-precios` con modal upload (Excel/CSV) admin-only
  - Panel de costo admin-only en ProductoModal con stale-cost indicator
  - Columna + filtro stale-cost en página /inventario con threshold configurable
  - OC recepción ya no usa FIFO: costo viene de la lista de precios vigente
  - Historial de costos paginado por producto

- [x] **Sedes de Despacho**
  - Modelo SedeDespacho (FK a Empresa), reemplaza campo `direccion_despacho` de Cliente
  - Subtable en Empresa edit modal (CRUD inline)
  - NV referencia sede_despacho_id (FK nullable)

- [x] **Sugerencias de productos por historial**
  - Endpoint `/api/productos/sugerencias` con ranking por historial de facturas del cliente/empresa
  - Índices en facturas/líneas para performance
  - Autocomplete en input vacío sugiere productos previos del cliente/empresa
  - Autocomplete de cotización usa endpoint /buscar (incluye búsqueda por tag)

- [x] **Sprint A — Quick wins**
  - Enforce al_contado cuando empresa sin línea de crédito (cotización + NV)
  - Lock payment terms UI cuando no hay línea de crédito
  - Expiración de cotización: bloquear creación de NV desde cotización vencida (409)
  - ClienteSelectModal scope por empresa con query invalidation

- [x] **Tier A #5 — Tareas y Recordatorios**
  - Modelo `Tarea` con 6 FKs nullables (CHECK: máx 1 entidad vinculada) + `ReglaTarea` con seed 6 reglas
  - API CRUD + acciones (completar/descartar/reasignar) + `/mis-pendientes` + `/timeline/{tipo}/{id}`
  - Permisos `tareas:view/view_all/create/admin` con defaults por rol
  - Job Celery horario: 6 reglas auto-generadoras (cotizacion_vence, factura_vencida, aprobacion_pendiente, nv_despachada_sin_avanzar, cliente_sin_actividad, stock_bajo_minimo) con idempotencia vía `dedup_key` y auto-descarte cuando el evento se resuelve
  - UI: página `/tareas` con tabs pendiente/hecha/descartada, widget "Mis pendientes" en sidebar, sección "Tareas relacionadas" en fichas (cotización, NV, factura), config admin `/admin/tareas/config`
  - Hook: al desactivar usuario se reasignan sus tareas pendientes al primer admin activo; guard bloquea desactivar al último admin
  - Tests: model, API, auto-gen por regla (8 tests), integration e2e

- [x] **Tier A #7 — Búsqueda global Cmd+K**
  - Endpoint `/api/search` con fan-out a 8 entidades (productos, clientes, empresas, cotizaciones, NV, facturas, OC, empleados)
  - Permission-aware: omite categorías sin permiso; vendedor solo ve documentos propios
  - Modal cmdk con grupos por categoría, recientes en localStorage, debounce 200ms, AbortController
  - Atajo configurable (Ctrl+K / Ctrl+P / Ctrl+Shift+F / Alt+S) con detección Mac (⌘ vs Ctrl)
  - Botón en header configurable por usuario; sección `/configuracion` guardada en `users.preferencias` JSON

---

## Flujo de documentos

```
Cotización → Nota de Venta → Factura
```

Cada etapa hereda datos de la anterior (editables), tiene PDF y email propio. Al crear el documento downstream, el upstream queda bloqueado (inmutable).

---

## Fuera de scope (v1)

- Integración SII / factura electrónica DTE
- App móvil
- Multi-empresa / multi-sucursal
- API pública
- Notificaciones en tiempo real
