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

- [x] **Reportes por Marca**
  - Endpoint `/api/reportes/por-marca` con agregación por marca y por marca+cliente, filtro multi-cliente y filtro por marca
  - Bucket `sin_marca` separado para líneas cuyo producto no tiene marca asignada
  - KPIs: total_neto, total_bruto, ganancia_total, margen_promedio_pct, num_facturas, num_marcas, ticket_promedio, cantidad_total
  - Exports Excel (4 hojas: KPIs, Por Marca, Marca+Cliente, Sin Marca) y CSV (con BOM UTF-8)
  - Vendedor scoping respetado; estado != "anulada" excluido
  - UI: tab "Por Marca" en /reportes con multi-cliente picker, sub-tabs (marca / marca+cliente), botones Excel/CSV

- [x] **Tier A #5 — Tareas y Recordatorios**
  - Modelo `Tarea` con 6 FKs nullables (CHECK: máx 1 entidad vinculada) + `ReglaTarea` con seed 6 reglas
  - API CRUD + acciones (completar/descartar/reasignar) + `/mis-pendientes` + `/timeline/{tipo}/{id}`
  - Permisos `tareas:view/view_all/create/admin` con defaults por rol
  - Job Celery horario: 6 reglas auto-generadoras (cotizacion_vence, factura_vencida, aprobacion_pendiente, nv_despachada_sin_avanzar, cliente_sin_actividad, stock_bajo_minimo) con idempotencia vía `dedup_key` y auto-descarte cuando el evento se resuelve
  - UI: página `/tareas` con tabs pendiente/hecha/descartada, widget "Mis pendientes" en sidebar, sección "Tareas relacionadas" en fichas (cotización, NV, factura), config admin `/admin/tareas/config`
  - Hook: al desactivar usuario se reasignan sus tareas pendientes al primer admin activo; guard bloquea desactivar al último admin
  - Tests: model, API, auto-gen por regla (8 tests), integration e2e

- [x] **Wave 1 #6 — Observabilidad (W1-06)**
  - Logs estructurados con `loguru` controlados por `LOG_FORMAT` (json en prod, pretty en dev) y `LOG_LEVEL`
  - Middleware `RequestLoggerMiddleware` emite una línea por request con `request_id` (uuid4 generado o tomado de header `x-request-id`), `user_id` (decodificado del JWT, `None` si no autenticado), `route` (path template `/api/clientes/{id}`), `method`, `status`, `latency_ms`; ERROR para 5xx, INFO para el resto
  - Echo del `x-request-id` en la respuesta para correlación cliente↔servidor
  - Sentry backend (`sentry-sdk[fastapi]`) inicializado en `app/core/observability.py`; DSN, env, sample rate y release vía settings; init no-op cuando `SENTRY_DSN` está vacío
  - Sentry frontend (`@sentry/react`) inicializado en `src/sentry.ts`; `ErrorBoundary` reenvía excepciones a `Sentry.captureException`; DSN vacío = no-op
  - Endpoints `/healthz` y `/readyz` (sin auth, fuera de schema) con ping a Postgres + Redis; 200 si todo ok / 503 si DB falla; Redis no configurado se reporta `skipped` sin tumbar la respuesta
  - Settings nuevas: `SENTRY_DSN`, `SENTRY_ENV`, `SENTRY_TRACES_SAMPLE_RATE`, `LOG_FORMAT`, `LOG_LEVEL`
  - `frontend/.env.example` con `VITE_SENTRY_DSN`, `VITE_SENTRY_ENV`, `VITE_SENTRY_TRACES_SAMPLE_RATE`
  - Tests (`tests/test_observabilidad.py`): healthz ok / db down 503 / redis skipped no-503 / readyz; log-line trae todos los campos requeridos; user_id presente con auth; 5xx logs en ERROR; init Sentry sin DSN no crashea; LOG_FORMAT=json emite JSON parseable

- [x] **Tier A #7 — Búsqueda global Cmd+K**
  - Endpoint `/api/search` con fan-out a 8 entidades (productos, clientes, empresas, cotizaciones, NV, facturas, OC, empleados)
  - Permission-aware: omite categorías sin permiso; vendedor solo ve documentos propios
  - Modal cmdk con grupos por categoría, recientes en localStorage, debounce 200ms, AbortController
  - Atajo configurable (Ctrl+K / Ctrl+P / Ctrl+Shift+F / Alt+S) con detección Mac (⌘ vs Ctrl)
  - Botón en header configurable por usuario; sección `/configuracion` guardada en `users.preferencias` JSON

- [x] **Notas de Crédito y Notas de Débito**
  - Modelos `NotaCredito` / `NotaDebito` con líneas, razón, numeración correlativa propia
  - Páginas list + nueva + detalle; vinculación opcional a Factura
  - Integración DTE (61 NC, 56 ND) vía DteEmision

- [x] **Pagos múltiples por Factura**
  - Modelo `Pago` 1..N por Factura; método, fecha, monto, banco receptor
  - Estado factura: `emitida → parcial → pagada`
  - Página `/pagos` y registro inline desde FacturaDetalle

- [x] **Cobranza**
  - Modelo `CobranzaConfig` por empresa (frecuencia recordatorios)
  - Página `/cobranza` con bandejas: vencidas, próximas, antigüedad de saldos
  - Campo `ultimo_recordatorio` en Factura (envío manual; envío automático pendiente)

- [x] **DTE / SII (parcial)**
  - `DteService` (httpx) integrado con Lioren como proveedor SII
  - Soporta: factura 33, NC 61, ND 56
  - Modelo `DteEmision` con tracking de folio, estado, respuesta SII, intentos de poll
  - Webhook entrante validado con HMAC SHA256
  - Celery task `tasks/dte.py` con polling de estado
  - **Pendiente:** boleta 39/41, guía de despacho 52, factura exenta 34, factura de compra 46, libros, intercambio DTE recepción

---

## Flujo de documentos

```
Cotización → Nota de Venta → Factura → Pago(s)
                                ↓
                          NotaCredito / NotaDebito
                                ↓
                            DteEmision (SII)
```

Cada etapa hereda datos de la anterior (editables), tiene PDF y email propio. Al crear el documento downstream, el upstream queda bloqueado (inmutable).

---

## Estado vs roadmap CRM

Ver `docs/state-of-product.html` para snapshot ejecutivo y `docs/backlog.md` para tareas accionables.

### Pendientes de Tier A original
- [ ] **#4 Timeline unificado por cliente/empresa** (parcial: tareas tienen timeline propio; falta vista que une cotis + NV + facturas + notas + llamadas)
- [ ] **#6 Pipeline / Oportunidades** (no iniciado; bloqueante: etapas fijas vs configurables)
- [ ] **#8 Notificaciones in-app + email digest** (no iniciado; tareas suplen parcialmente)

### Hardening producción (Wave 1 — ver backlog)
- [ ] Audit log global
- [x] **W1-02 — Backups Postgres automáticos + restore documentado**
  - Servicio `backups` (prodrigestivill/postgres-backup-local:15) en `docker-compose.prod.yml` con dump diario y rotación 7d/4w/6m configurable por env
  - Servicio `backups-offsite` (rclone/rclone:1.65) con copy a S3/B2/Wasabi; skip graceful si `S3_BUCKET` vacío
  - `scripts/restore.sh`: list/restore con confirmación, target-db parametrizado, dry-run, idempotente
  - Runbook `docs/runbooks/backup-restore.md` con flujos local + offsite, smoke checks y rollback
  - `.env.prod.example` extendido con placeholders de retención y S3
- [ ] CI (lint + tests + build Docker)
- [ ] Boleta electrónica 39/41
- [ ] Guía de despacho electrónica 52
- [ ] Observabilidad (Sentry + structured logs + healthz)
- [ ] 2FA TOTP + reset password

---

## Fuera de scope (v1)

- Multi-empresa / multi-tenant SaaS *(ver Wave 6 si se decide pivotear a SaaS)*
- App móvil nativa *(PWA en Wave 6)*
- API pública *(Wave 6)*
- Notificaciones push tiempo real
- POS / códigos de barras *(Wave 5)*
- Conciliación bancaria *(Wave 4)*
- Multi-moneda / UF *(Wave 4)*
