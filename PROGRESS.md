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

- [x] **Wave 1 — Hardening producción**
  - **W1-01 — Audit log global**
    - Modelo `AuditLog(id, user_id, action, entity_type, entity_id, diff_json, ip, user_agent, created_at)` con índices compuestos por (entity_type, entity_id) y por created_at
    - SQLAlchemy event listeners (`before_flush` + `after_flush_postexec`) capturan create/update/delete sobre 18 modelos auditables (Cotizacion, NotaVenta, Factura, NotaCredito, NotaDebito + líneas, Producto, ListaPrecios + items, Empresa, Cliente, User, PermissionOverride, SystemConfig); listeners protegidos con guard `try/except + logger.exception` para que un fallo de auditoría nunca tumbe la mutación de negocio
    - Diff legible: create → `{after}`, update → `{before, after, changed[]}`, delete → `{before}`
    - Campos sensibles excluidos del diff: passwords, hashed_passwords, tokens, secrets (denylist explícita)
    - Middleware ASGI `AuditContextMiddleware` extrae user_id (vía JWT), IP (X-Forwarded-For leftmost) y User-Agent en `ContextVar` por request
    - API `GET /api/auditoria` con filtros (user_id, entity_type, action, entity_id, from_date, to_date inclusivo) + paginación (limit ≤200, offset)
    - Export `GET /api/auditoria/export.csv` true streaming via `q.yield_per(500)` + generator con BOM UTF-8 para Excel
    - Permiso: `usuarios:admin` (vendedor 403, route guard también en frontend)
    - Frontend `/admin/auditoria` con tabla, filtros, paginación y modal de diff (JSON pretty); useQuery con `queryKey: ['auditoria', filtros]`
    - Sidebar: entry "Auditoría" admin-only
    - 11 tests pytest (incl. regresión typo ListaPreciosItem + to_date inclusivity); 3 tests vitest para la página; conftest fixture autouse desactiva audit listeners en tests por default (opt-in vía `audit_enabled`)
  - **Wave 1 #6 — Observabilidad (W1-06)**
    - Logs estructurados con `loguru` controlados por `LOG_FORMAT` (json en prod, pretty en dev) y `LOG_LEVEL`
    - Middleware `RequestLoggerMiddleware` emite una línea por request con `request_id` (uuid4 generado o tomado de header `x-request-id`), `user_id` (decodificado del JWT, `None` si no autenticado), `route` (path template `/api/clientes/{id}`), `method`, `status`, `latency_ms`; ERROR para 5xx, INFO para el resto
    - Echo del `x-request-id` en la respuesta para correlación cliente↔servidor
    - Sentry backend (`sentry-sdk[fastapi]`) inicializado en `app/core/observability.py`; DSN, env, sample rate y release vía settings; init no-op cuando `SENTRY_DSN` está vacío
    - Sentry frontend (`@sentry/react`) inicializado en `src/sentry.ts`; `ErrorBoundary` reenvía excepciones a `Sentry.captureException`; DSN vacío = no-op
    - Endpoints `/healthz` y `/readyz` (sin auth, fuera de schema) con ping a Postgres (NullPool engine, desacoplado del pool de la app) + Redis; 200 si todo ok / 503 si DB falla; Redis no configurado se reporta `skipped` sin tumbar la respuesta
    - Settings nuevas: `SENTRY_DSN`, `SENTRY_ENV`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_RELEASE`, `LOG_FORMAT`, `LOG_LEVEL` (documentadas en `.env.prod.example`)
    - `frontend/.env.example` con `VITE_SENTRY_DSN`, `VITE_SENTRY_ENV`, `VITE_SENTRY_TRACES_SAMPLE_RATE`
    - Tests (`tests/test_observabilidad.py`): healthz ok / db down 503 / redis skipped no-503 / readyz; log-line trae todos los campos requeridos; user_id presente con auth; 5xx logs en ERROR; init Sentry sin DSN no crashea; LOG_FORMAT=json emite JSON parseable
  - **W1-02 — Backups Postgres**
    - Servicios `backups` (prodrigestivill/postgres-backup-local:15) + `backups-offsite` (rclone) en `docker-compose.prod.yml`, volumen `pgbackups`
    - Schedule + retención configurables vía `BACKUP_SCHEDULE/KEEP_DAYS/KEEP_WEEKS/KEEP_MONTHS`; offsite opcional vía `S3_BUCKET` (skip graceful si vacío) — soporta S3, B2, Wasabi, MinIO
    - `scripts/restore.sh` con list/restore/dry-run, confirmación tipada, idempotente
    - Runbook `docs/runbooks/backup-restore.md` con flujos local + S3, verificación, rollback
  - **W1-04 — Boleta DTE 39/41**
    - Modelos `Boleta` / `BoletaLinea` standalone (independientes de NV); FK opcional `cliente_id`/`empresa_id`/`vendedor_id`
    - Tipos DTE soportados: 39 (afecta, IVA 19%) y 41 (exenta); validación: tipo 41 obliga `exenta=true` en todas las líneas (422 si no)
    - Receptor anónimo: campos opcionales `nombre_receptor`, `rut_receptor`, `email_envio`, `patente_vehiculo` (búsqueda dedicada por patente para flujo retail/automotor); RUT genérico SII `66666666-6` cuando no hay cliente
    - Numeración correlativa propia con `SystemConfig.boleta_last_id` + `with_for_update()` lock
    - Stock descuenta al emitir (`descontar_stock_boleta` crea `MovimientoInventario` salidas con `referencia_tipo='boleta'`); reversa automática si DTE rechazado o boleta anulada (idempotente, no duplica si ya está anulada manualmente)
    - Pipeline DTE reutilizado: `DteEmision` + Celery `emit_dte` + `_sync_dte_estado`; tipos DTE Lioren `"039"` / `"041"`
    - Anulación genera Nota de Crédito tipo 61 con `boleta_id`; permiso `boletas:delete` (admin/subadmin); migration `a6b7c8d9e0f1` relaja `notas_credito.cliente_id` a nullable para anular boletas anónimas
    - PDF (WeasyPrint, template `boleta.html`), envío email SMTP, export Excel (12 columnas: número, fecha, tipo, receptor, RUT, patente, neto, IVA, total, método pago, estado, DTE, vendedor)
    - Reportes `/api/reportes/ventas` agrega boletas en clave separada `boletas: { total, cantidad, ventas_diarias[] }` con mismo filtro vendedor-role
    - Auditoría: `Boleta` + `BoletaLinea` agregados al whitelist (CRUD se logea con before/after diff)
    - Permisos: vendedor view/create/edit; admin/subadmin full incluye anular
    - Frontend: `/boletas/nueva` (form rápido toggle anónimo/cliente, tipo 39/41, líneas con exenta per-line, métodos pago, atajos Ctrl+Enter/Esc), `/boletas` (lista con filtro patente, fechas, estado, dte_estado, método, vendedor, paginación, export Excel, acciones por fila), `/boletas/:id` (detalle con polling 10s mientras procesando, modales reutilizables anular/email)
    - Tests: 16 backend pytest (creación, listing, anulación, NC con boleta_id, stock descuento+reverso+race con sync_rechazada, email/PDF/Excel, permisos vendedor 403, audit log) + 1 skipped (concurrent numbering — Postgres-only) + 5 vitest (form, lista, detalle)

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

- [ ] **Design System v2 — Refined SaaS migration** *(en progreso, ver `docs/design-system-migration-prd.md`)*
  - **Phase 0 — Foundation** (`07c5f7f`): paleta semántica (brand=amber, success=emerald, warning=amber, danger=rose, info=sky 50-950), shadow-elev-1..4, `font-num` tabular, primitivas en `components/ui/*` (Button, Input, Textarea, FormField, Select, Modal, Card, Table, Badge, EmptyState, Skeleton, Tabs, Tooltip, Popover), sonner `<Toaster />` montado en `main.tsx`
  - **Phase 1.1 — Dashboard** (`b91e5e4`)
  - **Phase 1.2a — NotasVenta list** (`06dd343`)
  - **Phase 1.3 — Inventario + ProductoModal + ProductoHistorial** (`8cf5960`)
  - **Phase 1.4a — Clientes** (`d6fa479`); **1.4b — Empresas list/detail/4 tabs** (`df202e4`)
  - **Phase 1.6a — BoletasList** (`9394195`)
  - **Sidebar polish** (`94cffaa`): tokens `bg-gray-900`, badges `danger-500`/`warning-500`, logout hover `danger`, aria-labels reflejando estado, eliminado branch `pending` muerto
  - **NotaVentaDetalle** (`5f2e2c1`): header buttons + Card shells, popover "Cambiar estado", Badge variants por estado, Table primitives en líneas, sonner reemplaza emailToast, `<Lock>`/`<Receipt>`/`<Truck>` icons, `font-num` en celdas monetarias
  - **Cotizaciones list** (`18c9524`): mobile cards, desktop table interactive, Tooltip-wrapped actions, MargenBadge en tokens, modales delete/export/discard
  - **CotizacionDetalle** (`fe7b967`): subagent-driven; banners Lock/AlertTriangle, autocomplete con shadow-elev-3, Empresa+UserPlus row con `Button size="icon-sm"`, "Crear NV" como `variant="success"`, modal solicitud-margenes en Table primitive
  - **Phase A5 — Facturas list + FacturaDetalle** (`cb81348`): list migrada (Cards mobile, Table interactiva desktop, Tooltip-wrapped action, MargenBadge en tokens, EmptyState/Skeleton, ESTADO_VARIANT `emitida→info, parcial→warning, pagada→success, anulada→danger`); FacturaDetalle vía subagent — Popover "Cambiar estado" reemplaza menú handcrafted, modales emitir-DTE + registrar-pago en `<Modal>`/`<ModalContent>`, sonner reemplaza emailToast, ~24 colores raw → tokens semánticos, `'none'` sentinel en SelectItems opcionales (empresa/banco/método/vendedor)
  - **Phase A6 — BoletaDetalle + BoletaNueva** (`8601261`): detalle con Card/Table primitives, header con `Button variant="outline"` (PDF/Email/Anular), Badge `emitida→info, anulada→danger`, sonner reemplaza toast local, Skeleton en loading; nueva con `FormField`/`Input`/`Select` Radix (5 métodos pago), segmented pills (tipo DTE 39/41 + receptor mode) en tokens semánticos, líneas con grid + `Button size="icon-xs" variant="ghost"` para eliminar, Card de totales con `font-num`. Reemplazado `bg-[#0B1120]` hardcoded dark con tokens theme-aware. Tests boleta (3) pass.
  - **Phase A7 — GuiasDespacho list + Nueva + Detalle** (`0cd2ccf`): subagent-driven; list con Card/Table/Tooltip + EmptyState + filtros (Select Radix con `'all'`/`'none'` sentinels); detalle con header buttons (descargar PDF, enviar email, emitir DTE, anular vía NC) en `Button variant="outline"`, polling DTE 10s preservado, banner anulación en `bg-danger-50/dark:bg-danger-500/10`; nueva con FormField + Input + Select para empresa/cliente/motivo/lineas, banner info migrado a tokens `info-*`. ESTADO_VARIANT: `emitida→info, anulada→danger`. 14/14 tests pass.
  - **Phase B6 — Productos catálogo + ListasPrecios** (`496e0f0`): Productos con header `Button variant="outline" leftIcon={<FileSpreadsheet/>}` (Excel) y `Button leftIcon={<Plus/>}` (Agregar), search en `FormField`+`Input` con `Search` leftAddon, `Card`+`Table density="compact"` con stock-bajo `text-danger-600 font-semibold` y `<Tooltip label="Stock bajo mínimo">` en warning emoji, `font-num` en money/stock, Editar/Eliminar en `Tooltip`+`Button size="icon-sm" variant="ghost"` (eliminar con tokens danger), confirm `Modal` con `Button variant="danger"` reemplaza inline confirm row, `EmptyState (Inbox)` y `Skeleton` loading, sonner toast en delete; `ProductoModal` preservado intacto. ListasPrecios: header `Button leftIcon={<Upload/>}`, uploadResult banner en `Card` con tokens `bg-success-50`/`border-success-500/30` y close `Button ghost icon-xs <X/>`, `Card`+`Table` con items count `font-num`, `Badge variant="success"` (Activa)/`neutral` (Archivada), Descargar como `Tooltip`+anchor con styling ghost, Eliminar en `Tooltip`+ghost con tokens danger, confirm `Modal` reemplaza `confirm()`, `EmptyState`+`Skeleton`. UploadModal migrado a `Modal`+`ModalContent size="md"` con `FormField` wrapping file input + grid 2-col SKU/Costo, error en `text-danger-600`, footer `Button variant="outline"` (Cancelar) + default (Subir). Tests Productos (2/2) pasan. Behavior, queries, endpoints sin cambios.
  - **Phase B5 — Reportes** (`2c19b08`): subagent-driven; `Tabs` primitive (7 tabs principales + 2 subtabs Marca) reemplaza tab-buttons handcrafted (`variant="underline"`); page header en `Card padded` con `FormField`+`Select`+`Input type="date"`; `KpiCard` reescrito sobre `Card`+`CardContent` con tokens `info/success/warning/danger` y `font-num` en valores numéricos; `SectionCard` migrado a `Card`+`CardContent`; tablas (Margenes×2, Marca×2, DTE) migradas a `Table density="compact"` con `font-num` en celdas monetarias/cantidad/%; helper `marginClass()` para semáforo `success/warning/danger` en margen %; `ExportButtons` compartidos (`Button variant="outline" size="sm" leftIcon`) con `FileSpreadsheet`/`FileText`; `Skeleton` en loading + `EmptyState (Inbox)` en error; recharts `Tooltip` renombrado a `RechartsTooltip` para evitar colisión con ui Tooltip; SVG `fill` literals (recharts) preservados intencionalmente. Behavior, queries y endpoints sin cambios.
  - **Phase B4 — Proveedores** (`05d2b8e`): header con `<Button variant="outline" leftIcon={<FileSpreadsheet/>}>` (Excel) y `<Button leftIcon={<Plus/>}>` (Agregar). `Card`+`Table density="compact"`; acciones Editar/Eliminar en `Tooltip`+`Button size="icon-sm" variant="ghost"` (eliminar con tokens `text-danger-*`). `EmptyState` (Inbox) fuera de la tabla, `Skeleton` loading. CRUD `Modal`+`ModalContent`+Header/Body/Footer con grid 2-col preservado y `FormField` wrapping `Input`/`Textarea`. Confirm `Modal` con `Button variant="danger"` reemplaza inline confirm row. Sonner `toast.success` en guardar/eliminar; errores en `text-danger-600`. Tests Proveedores (2/2) pasan. Behavior, queries y rutas sin cambios.
  - **Phase B3 — OrdenesCompra list + Detalle** (`eaf14ea`): list reemplaza `ESTADO_COLORS` por `ESTADO_VARIANT` map (neutral/info/warning/success/danger) y migra a `Card`+`Table density="compact"` con `<TR interactive>`, header con `<Button variant="outline" leftIcon={<Download/>}>` y `<Button leftIcon={<Plus/>}>`, filtros en `Card` con `FormField`+`Select` (sentinel `'all'`) + `Input type="date"`, OC number en `text-info-600 font-mono`, total `font-num`, EmptyState afuera de la tabla, Skeleton loading, Tooltip-wrapped icon-sm ghost Buttons con `e.stopPropagation()`, confirm `Modal` con `Button variant="danger"` reemplaza inline confirm row. Detalle: `ESTADO_LABELS`+`ESTADO_VARIANT` al tope, header back+title+Badge, banners cancelada/completa/readonly/error tokenizados, sonner reemplaza `emailToast`/setTimeout, Cards con FormField+Select+Input+Textarea respetando `canEdit`, Líneas en `Table` con `<Input size="sm">` y `font-num`, autocomplete con `shadow-elev-3`, Trash en Tooltip+ghost icon-xs, action bar con Guardar/Email/Cancelar/PDF/Recepcionar (variants apropiadas), Recepción en `Modal size="xl"`, `window.confirm`/`alert` removidos en favor de Modals + toast. Behavior, queries, rutas sin cambios.
  - **Phase B2 — Cobranza** (`cf68d57`): top-level Tabs primitive reemplaza tab-buttons handcrafted. DashboardTab: helper local `Card` eliminado en favor de ui `Card`/`CardContent` con tokens `text-info-600` (azul), `text-danger-600` (rojo), `text-warning-600` (amarillo); tablas Aging y Por empresa migradas a `Card`+`Table density="compact"` con `font-num` en celdas monetarias; Skeleton en loading; banner danger-500/10 en error. FacturasTab: filter Radix `<Select>` con sentinel `'all'`, "Importar XML" → `<Button>`, table con `<TR interactive>`, ESTADO_VARIANT map al tope (`emitida→info, parcial→warning, pagada→success, anulada→neutral`), origen como `<Badge variant="neutral">`, EmptyState fuera de la tabla. ImportModal: `Modal`/`ModalContent`/Header/Body/Footer; drop-zone hover tokenizado a `border-brand-400`; resultado con `text-success-700`/`text-danger-600`; "Crear empresa" Link en `text-info-600 dark:text-info-400`. RecordatoriosTab: Card+Table, EmptyState, días vencida `text-danger-600 font-num`, sonner `toast.success/error` en mutación. RecordatorioModal: Modal + `FormField` wrapping `Input`/`Textarea`, Button variants outline/default. Behavior, queries, rutas sin cambios.
  - **Phase B1 — Pagos** (`ae72135`): list migrated to Card+Table primitives (mobile cards + desktop compact table), `metodo_pago` chips → `<Badge variant="neutral">`, `font-num` en celdas monetarias; create-abono modal reescrito con `<Modal>/<ModalContent>/<ModalHeader>/<ModalBody>/<ModalFooter>` + `<FormField>` wrapping `<Input>` y Radix `<Select>` (sentinel `'none'` para factura vacía); `window.confirm` reemplazado por confirm `<Modal>` con `<Button variant="danger">`; Tooltip-wrapped `Button size="icon-sm" variant="ghost"` para acción Trash2; setTimeout toast → sonner; tokens: `amber → warning-*`, `red → danger-*`. EmptyState + Skeleton primitives. Behavior, fields, queries y rutas sin cambios.
  - **Phase A8 — NotasCredito + NotasDebito sextet** (`6074a1b`): list con Card+Table interactiva + EmptyState + Skeleton (DteBadge preservado), filas navegan a detalle con `Link` interno; detalle con header `Button` + Send icon, modal Radix de confirmación de emisión DTE (sonner toast en éxito/error reemplaza alert()), Card/CardContent para totales y Table compact para líneas con `font-num` en celdas monetarias; nueva con FormField + Input + Textarea para campos, banner `?guia_despacho_id=X` en NC migrado de `bg-yellow-50` a tokens `warning-*` con AlertTriangle icon, líneas con grid + ghost `icon-sm` Trash2 button. NotaCreditoNueva.test.tsx pasa sin cambios; failures pre-existentes (Empresas/Facturas) ya en baseline master.
  - **Phase C1 — Tareas + TareasConfig** (`263ba6d`): `Tareas.tsx` ahora usa `Tabs`+`TabsList variant="underline"` para el switcher pendiente/hecha/descartada (preservando el `({total})` count junto al tab activo vía `font-num`), `Card`+`Table density="compact"` para la lista desktop con `TR interactive`, y `Card` shells con `cursor-pointer hover:bg-gray-50` para mobile. Acciones `Plus`/`Check`/`X` con `Button leftIcon` y `Button size="icon-sm" variant="ghost"` envueltas en `Tooltip`; descartar usa ghost-danger (`text-gray-500 hover:text-danger-600 hover:bg-danger-500/10`). Emojis 🔴🟡⚪ de `ICONO_PRIORIDAD` preservados pero `Tooltip`-envueltos sobre `prioridad_derivada`. Loading → `Skeleton` rows; empty → `EmptyState icon={Inbox}`; banner error en `bg-danger-50 dark:bg-danger-500/10`. `prompt('Motivo del descarte:')` reemplazado con `Modal`+`FormField`+`Textarea` con state `discardTarget`/`discardMotivo` y footer `Button variant="danger"`. Errores de acción (completar/descartar) por sonner `toast.error`. `TareasConfig.tsx`: `successMsg`+`setTimeout` → `toast.success('Cambios guardados')`/`toast.error`; loading → `Skeleton`; empty → `EmptyState`; tabla en `Card`+`Table density="compact"`; offset cell `Input type="number" size="sm"`, rol cell Radix `Select size="sm"`; dirty-row highlight `bg-warning-50/50 dark:bg-warning-500/10`; footer buttons `Button variant="outline"`/`Button` (default brand). Sin cambios en query keys, endpoints o transitions.
  - **Phase C2 — Aprobaciones** (`f0c2518`): admin approvals page envuelta en `Card` shell con `Table density="compact"`, swap del `<table>` handcrafted por `THead`/`TR`/`TH`/`TBody`/`TD`. Tipo column ahora con `<Badge variant="warning">Crédito</Badge>` y `<Badge variant="info">Margen</Badge>`; Aprobar/Denegar/Rechazar a `<Button variant="success|danger" size="sm">` preservando `disabled={acting}`. Loading → 4 `Skeleton` rows; empty → `<EmptyState icon={Inbox}>`. Chevron expand con `<Tooltip>` + `Button size="icon-sm" variant="ghost">`. Margen detail row mantiene tabla nested pero repinta `bg-blue-50/50` → `bg-info-50/50 dark:bg-info-500/10`, `text-blue-700` → `text-info-700 dark:text-info-300`, y agrega `font-num` en cada celda money/percent. Términos pendientes cards a `<Card padded className="border-warning-500/30">` con `text-warning-700 dark:text-warning-400`. Las tres mutations toast (`'Aprobado'|'Denegado'|'Rechazado'` en éxito, `'Error al procesar'` en error). Removidos `: any` map callbacks por `Omit<…, 'tipo'>[]` casts. `tsc --noEmit` clean; sin test file.
  - **Phase C3 — RRHH** (`d5a6cd4`): drop de constantes `INPUT_CLS`/`LABEL_CLS` en favor de `FormField` + `Input`; header CTA ahora `Button leftIcon={<Plus/>}`; search con `Input` + `<Search size={16}/>` leftAddon. Empleados table a `Card` + `Table density="compact"` con `<TR interactive>`, sueldo right-aligned con `font-num`, Estado como `Badge variant="success|neutral"`. Loading state con `Skeleton` rows; empty con `EmptyState icon={Users}`. Editar/Eliminar como `Tooltip`+`Button size="icon-sm" variant="ghost"`; inline `eliminarEmpleado.mutate(e.id)` reemplazado con confirm `Modal` (state `confirmDelete`, footer `Button variant="danger">Eliminar</Button>`). Tres handcrafted `fixed inset-0 bg-black/50` divs (crear/editar, detalle, vacación) → `Modal`+`ModalContent`+Header/Body/Footer; detalle modal usa `size="xl"` con Documentos y Vacaciones stacked en body scrollable; vacación modal pierde `bg-black/60 z-[60]`. Documentos con Radix `Select size="sm"` para tipo, `Button size="sm" leftIcon={<Upload/>}` trigger, `Badge` chips por row, y `Download`/`Trash2` `Tooltip`+icon-sm ghost dentro de un `Card` shell; Vacaciones con `Card`+`Table` y `font-num` en días. `uploadError` removido en favor de `toast.error`; `vacError` mantenido inline + toast. `e: any` mutation onError handlers retipados a `unknown` con helper `extractErrorDetail`. Toasts en create/update/delete success por convención Productos/Proveedores. Tests 10/10 pasan (RRHH.test.tsx + RRHH.test.js).
  - **Phase C4 — AdminAuditoria** (`42c6427`): los 6 native filter controls (entity_type, action, user_id, entity_id, from_date, to_date) re-envueltos en `<FormField>` + Radix `<Select>`/`<Input>` dentro de `<Card padded>`, con sentinel `'all'` (B2/B3) traduciendo a `undefined` para que el query key `['auditoria', filtros]` quede byte-identical. Action column ahora `<Badge>` driven por mapa `ACTION_VARIANT` (info=create, warning=update, danger=delete) por convención. "Ver diff" colapsado a `<Tooltip>`+`<Button size="icon-sm" variant="ghost"><Eye/></Button>` por idiom Phase B. Paginación a outline `<Button>`s con `ChevronLeft`/`ChevronRight`; diff modal a `<Modal>`/`<ModalContent size="xl">` con pre-block JSON preservado verbatim sobre tokens `bg-gray-50 dark:bg-gray-800/40`. Admin gate ahora renderiza un `<EmptyState icon={Lock}>` token-styled dentro de `<Card>` en vez de `bg-red-100` raw. Loading rows → `<Skeleton>`s; empty → `<EmptyState icon={Inbox}>`; banner error a `bg-danger-50 dark:bg-danger-500/10`. Auth flow (fetch+blob CSV con bearer token) intacto. Tests 3/3 pasan tras swap one-line de `getByText` a `getByLabelText('Ver diff')`.
  - **Phase C5 — Configuracion** (`a86f2aa`): cada section (Datos de la Empresa, Alertas de inventario, Datos Bancarios, Bancos de recepción de pagos, Búsqueda) ahora dentro de `<Card padded>` shell. Removido el bespoke `statusMsg` + `setTimeout` banner cleanup; success/error feedback para `saveMut`, `addBanco`, y `toggleBanco` van por sonner `toast.success/error` (mirroring C3 RRHH). Loading state → tres `<Card padded>` skeleton blocks. Inputs envueltos con `<FormField label hint>` + `<Input>`; descripciones en `FormField` `hint` / muted `<p>` por pattern B6 ProductoModal. Save/Agregar buttons como `<Button>` (brand variant); Agregar con `Plus` `leftIcon`. Bancos rows usan `<Button size="sm" variant="ghost">Desactivar/Activar</Button>` toggle. `BusquedaSection`'s `<select>` swap por Radix `<Select>` + trigger/content/items; literal `bg-[#0B0F1A]` removido (Select primitive theme-aware) y native checkbox con brand tokens. Sin literales de color o hex backgrounds. API paths y query keys sin cambios. `tsc --noEmit` clean.
  - **Phase C6 — Users** (`9192a22`): cierra Phase C (Admin & ops). Header con `<Button leftIcon>`; listing dentro de `Card` + `Table density="compact"` con `Skeleton` rows en fetch. Role y Estado columns vía `Badge` (mapa `ROLE_VARIANT`: vendedor=info, subadmin=warning, admin=success). Editar/Permisos actions a icon-only `Button size="icon-sm" variant="ghost"` dentro de `Tooltip`s, con Permisos hidden para admins. Tres handcrafted `fixed inset-0 bg-black/50` modales reemplazados con `Modal` + `ModalContent` (sizes md/md/lg) — create/edit forms a `FormField` + `Input` + Radix `Select` para role; permissions matrix mantiene native checkboxes con brand tokens dentro de `Table` compact. State inline `formError`/`saveError`/`permissionsError` eliminados en favor de sonner toasts (`'Este email ya está registrado'`, `'No se pudo guardar...'`, `'Error al cargar permisos'`). `err: any` en `createUser.onError` ahora `unknown` con type narrowing para `response.status`. Sin cambios en query keys, endpoints, o FormData submit logic; `tsc --noEmit` clean y 6/6 Users tests pasan.
  - **Phase D Login** (`5764189`): cierra el último page-level item de Phase D (Sidebar y Dashboard ya estaban migrados en `94cffaa` / `b91e5e4`). `Login.tsx` ahora importa `Button` + `Input` desde `components/ui/*`; los dos handcrafted `<input>` se reemplazan por `<Input size="lg">` con className overrides para preservar el dark skin del card (`bg-[#0B1120]` + `border-white/10` + `text-white`), y el `<button>` por `<Button size="lg" fullWidth loading>` manteniendo el invertido amber-sobre-oscuro (`text-gray-900` sobre `bg-brand-500`). Banner de error repintado de `text-red-400`/`bg-red-950/40`/`border-red-900/50` a tokens semánticos `danger-*` y ahora carga `role="alert"`. Labels reciben `htmlFor`/`id` (`login-email`, `login-password`). El bespoke chrome (gradient grid amber, radial glow, mark CO·NI·CO oversized, `bg-[#090E1A]`/`bg-[#111827]`) se preserva intencionalmente — Login es la única auth surface dark-only y no comparte tema con la app. No existe flujo de password reset en el codebase ni en `router.tsx`, por lo que ese sub-item del PRD queda marcado como N/A hasta que se construya. `tsc --noEmit` clean; grep gate `bg-(red\|green\|yellow\|blue\|orange)-[0-9]` returns zero hits en el archivo.
  - **Phase D AppLayout QA** (`073d5a0`): visual QA pass del layout wrapper. La capa ya cumplía el grep gate (sin raw `bg-(red\|green\|yellow\|blue\|orange)-N` en `AppLayout.tsx`), reusa el mobile chrome dark del Sidebar migrado (`bg-[#111827]` + `border-white/5`), y el strip desktop usa el par light/dark token (`bg-white dark:bg-[#0f1422]`, `border-gray-200 dark:border-white/5`). Único hallazgo a corregir: el botón "Más" del bottom-nav móvil era el único control icon-only sin `aria-label` — se agrega `aria-label="Abrir menú completo"` para paridad con el hamburger top-bar (`Abrir menú`). Sin cambios estructurales; behavior/layout idéntico.
  - **Phase D cerrada**. Pendiente: Phase E (visual QA route-by-route en light+dark / mobile+desktop, sweep final de raw color tokens fuera de `components/ui/*`, a11y `aria-label`/`aria-describedby`/focus-visible, Storybook opcional).
  - **Phase E — Semantic-token sweep + a11y pass** (`af817b6`): cierra los dos sub-items mecánicos del PRD en un solo commit. **Strict gate** `grep -rE "bg-(red|green|yellow|blue|orange)-[0-9]" src/pages` retorna cero matches; el sweep amplio sobre `src/components/**` (excluyendo `components/ui/*`) también queda limpio (`components/ui/README.md` preserva tokens raw como ejemplos before/after de la migración). Mapping aplicado: `red→danger`, `green→success`, `yellow|amber|orange→warning`, `blue→info`, preservando rampa numérica (50–950), modificadores de opacidad (`/15`, `/20`, `/40`) y prefijos `dark:`. Páginas tocadas: `RouteError.tsx` (banner repintado + `<Button variant="danger">` reemplaza el `<Link>`-as-button), `Cotizaciones.tsx`/`Facturas.tsx` (filter pill X y chip X de productos reciben `aria-label`). Componentes: `ErrorBoundary` (banner + Reintentar button con focus-visible ring), `DteBadge` (CONFIG map: pendiente/procesando/timeout→`warning-*`, aceptada→`success-*`, rechazada→`danger-*`), `search/items/badge.ts` (helper `badgeClass` repintado), cluster Tareas (`TareaModal`/`TareaDrawer`/`TareasRelacionadas` — labels asterisk, ESTADO_CLASS map, error rows con `role="alert"`), `Boleta{Anular,Email}Modal`, `Producto{HistorialCostos,Documentos}`, `ClienteSelectModal`, `Cliente|Empresa{Filters,Multi-Select,ExportPanel}`, `ExportPreviewPanel`, `Unsaved/CreditWarningModal`, `dashboard/Widget`. **A11y**: 9 icon-only `<button>` reciben `aria-label` ES (Widget Settings/X, EmpresaFilters X×2, ClienteMultiSelect chip-x, Cotizaciones+Facturas filter-x+chip-x); botones que ya cargaban texto o el `<Button>` primitive quedan out-of-scope. 2 native inputs paired con error inline reciben `aria-describedby` + `aria-invalid` (BoletaAnularModal textarea + BoletaEmailModal email); errores form-level summary y controles dentro de `<FormField error>` quedan as-is. 7 raw `<button>` con bg- token reciben `focus-visible:ring-N`. 5 banners danger inline reciben `role="alert"` para paridad con sonner toasts. `tsc --noEmit` clean; baseline tests 81/93 pass (12 fails Empresas/Facturas pre-existentes).
  - **Phase E cerrada parcialmente**. Pendiente: visual QA manual route-by-route (light+dark, mobile+desktop) y Storybook opcional para los `ui/*` primitives — ambos out-of-scope para CLI automation.
  - **Vista como — admin preview de roles** (`d0acdac`): nueva sección admin-only en `Configuración` que permite seleccionar un usuario activo no-admin y previsualizar la UI como ese rol. Implementación frontend-only: `stores/viewAs.ts` (zustand + sessionStorage) guarda el target, `hooks/useEffectivePermissions.ts` calcula la intersección `admin∩target` (matricial sobre `Permissions`) y expone `effectiveRole`. `AppLayout` monta un banner sticky warning con `role="status"` y botón "Salir de vista" siempre visible (única vía de escape). `Sidebar` consume el hook para gating de items module-based + `adminOnly: true`; los counters (`stock-bajo`, `aprobaciones-pendientes`) se silencian cuando el target no tiene la permission. Migrados off de `user.role` directo: `Dashboard` (preset role + edit affordances), `Productos` (prop `userRole` a `ProductoModal`), `TareaDrawer`/`Tareas` (`puedeDescartar`/`puedeEliminar`), `Aprobaciones` (`Navigate` guard + queries), `AdminAuditoria` (`isAdmin` UI gate), `TareasConfig` (`Navigate` guard), `Configuracion` (gate principal + `ViewAsSection`). Logout (`stores/auth.ts`) purga `conico-view-as`. Backend untouched: data sigue siendo del admin — el banner lo explicita. `tsc --noEmit` clean; full suite 81 pass / 12 fails pre-existentes (mismo baseline Phase E); targeted `Productos` + `AdminAuditoria` 5/5. Pendiente: nada — feature cerrada.

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
- [x] **W1-05 — Guía de despacho electrónica 52** — Phase 1 backend + Phase 2 frontend completas
  - **Phase 1 — Backend** (4/5 SC verificadas, 13/14 tests pass + 1 skip)
    - Modelos `GuiaDespacho` + `GuiaDespachoLinea` con FK CASCADE en `DteEmision` y FK SET NULL en `NotaCredito`
    - Migración Alembic monolítica (`c1d2e3f4a5b6`) reversible
    - Router `/api/guias-despacho` CRUD con `_next_numero` (SELECT FOR UPDATE), permisos por rol (vendedor sin DELETE), audit_log zero-code
    - Pipeline DTE 52: endpoint `/emitir`, `DteService.build_guia_payload`, branches en `_process_emit` y `_sync_dte_estado` (incl. NC anula guía D-16)
    - PDF WeasyPrint + email SMTP (template `guia_despacho.html`, asunto canónico D-20)
    - Stock invariante D-13 confirmado por test (guía no descuenta stock)
    - Export Excel `/api/guias-despacho/export.xlsx` con 11 columnas (admin/subadmin)
    - **Pendiente sandbox Lioren**: validar payload tipo 52 con credenciales reales antes de producción (`checkpoint:human-action`, ver `.planning/phases/01-gu-a-de-despacho-52-backend/01-03-SUMMARY.md`)
  - **Phase 2 — Frontend** (4/4 SC verificadas, ~14 tests vitest pass)
    - SC-1: `/guias-despacho` — lista con 5 filtros (búsqueda número/cliente, fechas desde/hasta, estado, dte_estado, motivo) + paginación + Excel export
    - SC-2: `/guias-despacho/nueva` — form con selectores empresa+cliente, motivo (6 opciones), líneas con autocomplete, prefill via `?nv_id=X` (incluye dirección/comuna desde NV.cliente)
    - SC-3: `/guias-despacho/:id` — detalle con acciones state-aware (editar borrador, emitir DTE, descargar PDF, enviar email, anular vía NC), polling DTE 10s en estado `procesando`
    - SC-4: integración con Notas de Crédito vía `?guia_despacho_id=X` (NotaCreditoNueva precarga datos de la guía)
    - Sidebar entry "Guías de despacho" con permiso `guias_despacho:view`
    - Tipos: `direccion_despacho`/`comuna` agregados a `NotaVenta.cliente`; tsconfig lib bumped a ES2022 (Array.at en tests)
    - Tests: GuiasDespachoList (3), GuiaDespachoNueva (5), GuiaDespachoDetalle (6), NotaCreditoNueva (1) — todos pass
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
