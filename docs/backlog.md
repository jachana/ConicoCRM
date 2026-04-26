# Conico — Backlog Ejecutable

> Snapshot 2026-04-24. Cada tarea es **agent-assignable**: tiene scope cerrado, criterios de aceptación verificables y dependencias declaradas. Ver `docs/AGENTS.md` para reglas del equipo.

Convenciones:
- **P0** = bloquea producción / venta. **P1** = diferenciador competitivo. **P2** = nice-to-have.
- **Owner sugerido**: backend, frontend, fullstack, infra.
- **Esfuerzo**: S (≤1 día) · M (2-4 días) · L (1-2 semanas).

---

## Wave 1 — Hardening producción

### W1-01 — Audit log global
- **Prioridad:** P0 · **Owner:** backend · **Esfuerzo:** M
- **Por qué:** sin auditoría no se puede vender a cliente con >3 usuarios; cualquier cambio sospechoso es no-trazable.
- **Scope:**
  - Modelo `AuditLog(id, user_id, action, entity_type, entity_id, diff_json, ip, user_agent, created_at)`.
  - Middleware FastAPI que captura PATCH/POST/DELETE en routers de cotizaciones, NV, facturas, NC, ND, productos, listas_precios, empresas, clientes, usuarios, permissions, system_config.
  - Diff: snapshot previo vs nuevo, omitir campos sensibles (passwords, tokens).
  - Vista `/admin/auditoria` con filtros por usuario, entidad, acción, rango fecha; export CSV.
- **Aceptación:**
  - Cualquier mutación en módulos listados aparece en `audit_logs` con diff legible.
  - Vista admin filtra y pagina; vendedor 403.
  - Tests: 5 mutaciones distintas + verificación de diff.
- **Dependencias:** ninguna.

### W1-02 — Backups Postgres automáticos
- **Prioridad:** P0 · **Owner:** infra · **Esfuerzo:** S
- **Por qué:** dato comercial sin respaldo es deuda que el cliente paga el día que falla el VPS.
- **Scope:**
  - Servicio `backups` en `docker-compose.prod.yml` con `pg_dump` diario + retención configurable.
  - Subida a S3 / Backblaze B2 / Glacier (config via env).
  - Script `scripts/restore.sh` documentado y probado contra una base local vacía.
  - Documento `docs/runbooks/backup-restore.md`.
- **Aceptación:** smoke restore en staging recupera datos; runbook ejecutable por alguien que no escribió el sistema.

### W1-03 — Pipeline CI
- **Prioridad:** P0 · **Owner:** infra · **Esfuerzo:** M
- **Por qué:** equipo de agentes mergeando en paralelo necesita guardrails objetivos.
- **Scope:**
  - GitHub Actions (o equivalente) con jobs:
    - `backend`: `pip install -r requirements.txt` → `pytest` en SQLite.
    - `frontend`: `npm ci` → `npm run lint` (tsc) → `npm test -- --run`.
    - `docker-build`: build de ambas imágenes (smoke).
  - Branch protection en `master`: requiere CI verde + 1 review.
- **Aceptación:** PR rojo bloquea merge; tiempo total < 6 min.

### W1-04 — Boleta electrónica DTE 39 / 41 — ✅ DONE 2026-04-25
- **Prioridad:** P0 · **Owner:** fullstack · **Esfuerzo:** L
- **Estado:** entregado en branch `feat/W1-04-boleta-dte-39-41`. Modelos `Boleta`/`BoletaLinea`, DTE 39 afecta + 41 exenta, receptor anónimo con patente, stock al emitir + auto-reversa al rechazo SII, anulación → NC 61, frontend list/nueva/detalle, runbook `docs/runbooks/boleta-dte-troubleshooting.md`.
- **Derivadas:** W1-08 (refactor stock al emitir factura, no al crear NV), W5-04 (unidades alternativas).
- **Por qué:** Pyme retail sin boleta electrónica no puede operar legalmente.
- **Scope:**
  - Modelo `Boleta` análogo a Factura (numeración propia, sin retención IVA si es 41 exenta).
  - `DteService.build_boleta_payload` → tipo 39 / 41.
  - UI: botón "Generar Boleta" desde NV (mutuamente excluyente con Factura), página `/boletas` lista + detalle, PDF.
  - Reportes: incluir boletas en agregaciones de venta.
- **Aceptación:** ciclo completo NV → boleta → DTE aceptado en SII certificación; export Excel mensual.
- **Dependencias:** ninguna (Lioren ya soporta 39/41).

### W1-05 — Guía de despacho electrónica DTE 52
- **Prioridad:** P0 · **Owner:** fullstack · **Esfuerzo:** M
- **Por qué:** mover mercadería sin guía expone al cliente a multa SII.
- **Scope:**
  - Modelo `GuiaDespacho` con FK a NV, tipo (venta/traslado interno/devolución), líneas, sede de origen/destino.
  - Botón "Generar Guía" en NV; flujo separado del de Factura.
  - DTE 52 vía Lioren.
  - PDF.
- **Aceptación:** guía emitida con XML SII válido, PDF descargable, vinculada a NV.

### W1-06 — Observabilidad
- **Prioridad:** P0 · **Owner:** backend · **Esfuerzo:** S
- **Scope:**
  - `loguru` o `structlog` con JSON logs (request_id, user_id, route, status, latency).
  - Sentry (frontend + backend) con DSN por env.
  - Endpoint `/healthz` (DB ping + Redis ping) y `/readyz`.
- **Aceptación:** dashboard Sentry recibe errores; healthz responde 200/503 según dependencias.

### W1-07 — 2FA TOTP + reset password
- **Prioridad:** P1 · **Owner:** fullstack · **Esfuerzo:** M
- **Scope:**
  - Tabla `user_totp_secret`; QR onboarding; verificación en login después de password.
  - Reset password vía email con token TTL 30 min.
  - Toggle "exigir 2FA a todos" en `system_config` (admin).
- **Aceptación:** login con 2FA funcional; reset email enviado; tests cubren bypass cuando 2FA off.

---

## Wave 2 — CRM diferenciador

### W2-01 — Pipeline / Oportunidades (kanban)
- **Prioridad:** P0 · **Owner:** fullstack · **Esfuerzo:** L
- **Por qué:** sin pipeline no es CRM, es facturador. Diferenciador clave en mercado Pyme chileno.
- **Scope:**
  - Modelo `Oportunidad(id, nombre, cliente_id, empresa_id, monto_estimado, probabilidad, etapa, vendedor_id, fecha_cierre_esperada, motivo_perdida)`.
  - Etapas configurables (`pipeline_etapas` en system_config) con orden y color.
  - API CRUD + transiciones registradas en `OportunidadEvento` (kanban move log).
  - UI `/oportunidades` con kanban drag-and-drop, filtros vendedor/cliente/monto.
  - Botón "Crear cotización desde oportunidad" prefill total.
- **Bloqueante:** decidir etapas fijas vs configurables — recomendación: configurables con seed.
- **Aceptación:** mover tarjetas persiste estado; conversión a cotización linkea ambos lados; tests cubren transiciones inválidas.

### W2-02 — Timeline unificado por cliente/empresa
- **Prioridad:** P0 · **Owner:** fullstack · **Esfuerzo:** M
- **Por qué:** vendedor abre ficha cliente y entiende su historial en 5 segundos.
- **Scope:**
  - Endpoint `/api/clientes/{id}/timeline` y `/api/empresas/{id}/timeline` que une cotizaciones, NV, facturas, NC, ND, pagos, tareas, notas, llamadas (W2-03), oportunidades (W2-01) ordenadas desc.
  - UI tab "Timeline" en EmpresaDetailModal y página Cliente.
  - Filtros por tipo, paginado.
- **Aceptación:** 100 eventos rinden < 300ms; cada item tiene link a su detalle.

### W2-03 — Notas y llamadas
- **Prioridad:** P1 · **Owner:** fullstack · **Esfuerzo:** S
- **Scope:**
  - Modelo `InteraccionCliente(id, cliente_id?, empresa_id?, tipo: nota|llamada|email, contenido, duracion_min?, vendedor_id, created_at)`.
  - Drawer "Agregar interacción" en cliente/empresa; aparece en timeline (W2-02).
- **Aceptación:** crear interacción la muestra en timeline en < 1s; export CSV mensual por vendedor.

### W2-04 — Notificaciones in-app + email digest
- **Prioridad:** P1 · **Owner:** fullstack · **Esfuerzo:** L
- **Scope:**
  - Modelo `Notificacion(user_id, tipo, payload_json, leida, created_at)`.
  - Eventos: cotización por vencer, factura vencida, aprobación pendiente, NV lista para despacho, DTE rechazado.
  - Campana en header con dropdown + página `/notificaciones`.
  - Job Celery diario: digest email por usuario configurable.
- **Aceptación:** 5 eventos producen notificación; campana muestra badge no-leídas; email digest enviado y revisable en logs.

### W2-05 — Plantillas de email configurables
- **Prioridad:** P1 · **Owner:** backend · **Esfuerzo:** S
- **Scope:** modelo `EmailTemplate(slug, subject, body_html, variables_json)`; admin edita en `/admin/templates`. Slugs iniciales: cotizacion_envio, factura_envio, recordatorio_pago, oc_envio.
- **Aceptación:** cambiar template afecta el siguiente envío sin redeploy.

### W2-06 — Importación masiva clientes/empresas
- **Prioridad:** P2 · **Owner:** fullstack · **Esfuerzo:** S
- **Scope:** endpoint POST `/api/{clientes|empresas}/import` que acepta xlsx, valida RUT chileno, devuelve preview con errores, confirma import en 2do paso.
- **Aceptación:** import de 500 filas con 10 errores muestra preview; confirmación crea solo válidos.

### W2-07 — Bulk actions
- **Prioridad:** P2 · **Owner:** frontend · **Esfuerzo:** S
- **Scope:** checkbox columna en tablas (cotizaciones, NV, facturas, productos, clientes, empresas) + barra flotante con acciones (cambiar estado, exportar selección, eliminar lote). Backend: endpoints `_bulk` con guard de permisos.
- **Aceptación:** seleccionar 50 facturas y exportar produce un solo Excel.

---

## Wave 3 — Tributario completo

### W3-01 — Recepción / intercambio DTE proveedores
- **Prioridad:** P0 · **Owner:** backend · **Esfuerzo:** L
- **Scope:**
  - Modelo `DteRecibido(rut_emisor, tipo, folio, monto, xml, estado_acuse, factura_proveedor_id?)` mapeando al modelo `OrdenCompra`.
  - Inbox via webhook Lioren / API SII.
  - UI `/dte-recibidos` con bandeja + acuse de recibo (RCV: aceptado, reclamo causal).
- **Aceptación:** un DTE entrante se almacena, se ve en inbox, se puede vincular a una OC, se envía acuse.

### W3-02 — Libro de compras y ventas
- **Prioridad:** P0 · **Owner:** backend · **Esfuerzo:** M
- **Scope:** export mensual de libro ventas (a partir de facturas + NC + ND + boletas) y libro compras (a partir de DTE recibidos) en formato XML SII.
- **Aceptación:** archivos XML válidos según schema SII; periodo seleccionable.

### W3-03 — DTE 34 (factura exenta) y DTE 46 (factura de compra)
- **Prioridad:** P1 · **Owner:** backend · **Esfuerzo:** M
- **Scope:** flag `tipo_dte` en Factura; templates PDF; payload Lioren.
- **Aceptación:** emisión exitosa de cada tipo en certificación SII.

### W3-04 — Propuesta F29 mensual
- **Prioridad:** P1 · **Owner:** backend · **Esfuerzo:** S
- **Scope:** vista `/reportes/f29` que calcula códigos relevantes (502 ventas afectas, 519 IVA débito, 537 IVA crédito, etc.) desde libros W3-02.
- **Aceptación:** valores cuadran contra simulador SII en datos sintéticos.

---

## Wave 4 — Finanzas

### W4-01 — Conciliación bancaria
- **Prioridad:** P0 · **Owner:** fullstack · **Esfuerzo:** L
- **Scope:**
  - Modelo `MovimientoBancario(banco_id, fecha, monto, descripcion, contraparte, conciliado_con_pago_id?)`.
  - Importadores cartola: BCI, Banco de Chile, Santander (al menos uno; resto por CSV genérico).
  - UI matching: lista no-conciliada izquierda (movimientos banco), derecha pagos pendientes; sugerencias auto por monto+fecha+RUT; confirmación manual.
- **Aceptación:** match 1:1 marca pago como conciliado; reporte semanal de no-conciliados.

### W4-02 — Comisiones por vendedor
- **Prioridad:** P0 · **Owner:** backend · **Esfuerzo:** M
- **Scope:**
  - Config `% comisión` por usuario (o tramo por monto).
  - Cálculo desde facturas pagadas en el mes (descuenta NC).
  - Reporte `/reportes/comisiones` exportable Excel con detalle factura×línea.
- **Aceptación:** 3 vendedores con 20 facturas → reporte cuadra al peso.

### W4-03 — Multi-moneda + UF
- **Prioridad:** P1 · **Owner:** backend · **Esfuerzo:** L
- **Scope:**
  - Campo `moneda` en Cotización/NV/Factura (CLP default; USD, EUR, UF).
  - Tipo de cambio por fecha (`tipo_cambio` tabla).
  - Reportes muestran totales en moneda base + conversión histórica.
- **Aceptación:** cotización en UF se factura en CLP usando TC del día factura; reporte agrega bien.

### W4-04 — Exportación a contabilidad
- **Prioridad:** P1 · **Owner:** backend · **Esfuerzo:** L
- **Scope:** al menos un conector elegido (sugerencia: Defontana por API o ContaNet por archivo). Mapping cuentas configurable.
- **Aceptación:** export mensual cuadra contra cierre de venta.

### W4-05 — Cash flow + estado resultado
- **Prioridad:** P2 · **Owner:** fullstack · **Esfuerzo:** M
- **Scope:** vista `/reportes/financiero` con cash flow proyectado (cuentas por cobrar - por pagar) y P&L mensual simplificado (ingresos - costos directos).
- **Aceptación:** valores cuadran contra Excel manual de la operación real.

### W4-06 — Facturación recurrente
- **Prioridad:** P2 · **Owner:** backend · **Esfuerzo:** M
- **Scope:** modelo `Suscripcion(cliente_id, plan, monto, frecuencia: mensual|anual)`; job Celery genera factura en fecha.
- **Aceptación:** suscripción activa genera factura el día correcto y la emite vía DTE.

---

## Wave 5 — Operación avanzada

### W5-01 — Multi-bodega
- **Prioridad:** P1 · **Owner:** backend · **Esfuerzo:** L
- **Scope:** modelo `Bodega`; `MovimientoInventario.bodega_id`; transferencias entre bodegas; stock por bodega + total agregado.
- **Aceptación:** NV puede descontar de bodega específica; reporte de stock muestra columna por bodega.

### W5-02 — Trazabilidad lote/serie
- **Prioridad:** P1 · **Owner:** backend · **Esfuerzo:** M
- **Scope:** consolidar Lotes existentes en ProductoModal; vincular líneas de OC y NV con lote_id; reporte de trazabilidad (de qué OC vino el lote vendido).
- **Aceptación:** dado un cliente y producto, sistema responde de qué lote/OC se despachó.

### W5-03 — POS minimal
- **Prioridad:** P2 · **Owner:** fullstack · **Esfuerzo:** L
- **Scope:** vista `/pos` con búsqueda rápida por código de barras, totales en vivo, generación de boleta DTE 39, registro de pago (efectivo/débito/crédito). Soporte impresora térmica vía PDF.
- **Aceptación:** flujo "agregar producto → cobrar → boleta DTE → ticket impreso" en < 30 segundos.

---

## Wave 6 — SaaS (opcional según decisión de modelo de negocio)

### W6-01 — Multi-tenant
- **Prioridad:** P0 · **Owner:** backend · **Esfuerzo:** L (refactor amplio)
- **Scope:**
  - `tenant_id` en todas las tablas (excepto `users` que pasa a tener N tenants).
  - Middleware FastAPI inyecta tenant del JWT en `Session.info`; SQLAlchemy event listener filtra queries.
  - Particionar uploads por tenant (`uploads/{tenant_id}/...`).
  - Vista superadmin para crear/desactivar tenants.
- **Aceptación:** dos tenants en la misma DB no se ven datos; auditoría confirma aislamiento.

### W6-02 — Customer portal
- **Prioridad:** P0 · **Owner:** fullstack · **Esfuerzo:** L
- **Scope:** subdominio o ruta `/portal`; login cliente externo con email + token magic-link; ve sus cotizaciones, facturas (PDF), estado de pagos. Sin acceso a backend interno.
- **Aceptación:** cliente accede, descarga PDFs, marca cotización como aceptada (genera evento).

### W6-03 — Mobile / PWA
- **Prioridad:** P1 · **Owner:** frontend · **Esfuerzo:** L
- **Scope:** layouts responsive en cotización/NV/factura/búsqueda; manifest PWA; service worker para acceso offline a últimas cotizaciones del vendedor.
- **Aceptación:** vendedor crea cotización completa desde móvil sin scroll horizontal.

### W6-04 — Pasarelas de pago
- **Prioridad:** P1 · **Owner:** backend · **Esfuerzo:** M cada uno
- **Scope:** Webpay (Transbank), Mercado Pago, Khipu. Link de pago en factura; webhook marca pago.
- **Aceptación:** pago vía Webpay actualiza estado factura → pagada en < 30s.

### W6-05 — WhatsApp Business
- **Prioridad:** P2 · **Owner:** backend · **Esfuerzo:** M
- **Scope:** envío de cotizaciones/facturas por WhatsApp via API oficial (Meta) o proveedor (Twilio/360dialog).
- **Aceptación:** botón "Enviar por WhatsApp" en cotización envía PDF al cliente.

### W6-06 — SSO Google / Microsoft
- **Prioridad:** P2 · **Owner:** backend · **Esfuerzo:** S
- **Scope:** OAuth2 con providers; mapeo email → user; admin habilita por dominio.
- **Aceptación:** usuario empresa con cuenta Google entra sin password.

### W6-07 — API pública + webhooks salientes
- **Prioridad:** P2 · **Owner:** backend · **Esfuerzo:** M
- **Scope:** API keys por tenant; rate limit; webhook config por evento (factura.creada, pago.recibido, dte.aceptado).
- **Aceptación:** integrador externo puede consumir cotizaciones y recibir webhooks firmados.

---

## Cross-cutting (cualquier wave)

- **CC-01** — Mover seeds reales a `data_seed/` con script idempotente.
- **CC-02** — Centralizar permisos en un solo módulo (hoy `core/security.py` + `api/deps.py`); auditar deuda.
- **CC-03** — Refactor `frontend/src/api/` para usar un solo cliente axios con interceptors (auth, errors, tracing).
- **CC-04** — Eliminar archivos `.js` duplicados de `.tsx` en `frontend/src/pages/` y `components/` (fueron build artifacts checked-in).
- **CC-05** — Documentar en `docs/runbooks/` los flujos críticos: rotación de keys SII, restore DB, deploy, rollback.

---

## Reglas para agentes

1. Antes de empezar, **leer la tarea completa** y `docs/architecture.md`.
2. Cada tarea = una rama `feat/Wn-XX-slug` y un PR.
3. Un PR cubre **una sola tarea** del backlog. Si el scope crece, dividir.
4. Tests obligatorios: backend pytest; frontend al menos un vitest por flujo nuevo.
5. Actualizar `PROGRESS.md` en el mismo PR cuando una tarea queda lista.
6. Si la tarea descubre una decisión bloqueante, anotar en `docs/dudas-cliente.md` y pausar.
7. Ver `docs/AGENTS.md` para reglas de paralelismo y partición de trabajo.
