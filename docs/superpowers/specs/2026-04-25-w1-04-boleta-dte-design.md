# W1-04 — Boleta Electrónica DTE 39 / 41

**Fecha:** 2026-04-25
**Owner:** fullstack
**Esfuerzo:** L
**Branch:** `feat/W1-04-boleta-dte-39-41`
**Wave:** 1 (Hardening producción)

---

## 1. Objetivo

Pyme retail/servicios en Chile no puede operar sin boleta electrónica. Habilitar emisión DTE 39 (afecta) y 41 (exenta) vía Lioren, con flujo retail rápido (sin Cotización ni Nota de Venta previa), búsqueda por patente vehículo, receptor anónimo y descuento de stock al emitir.

## 2. Decisiones tomadas en brainstorm

1. **Origen:** boleta es **standalone** — no se crea desde NV. Override del backlog original. Razón: ventas por boleta son rápidas y directas, no se hace cotización ni NV.
2. **Stock:** boleta **descuenta stock al emitir**. Decisión más amplia confirmada por cliente: stock se descuenta al emitir documento tributario (factura/boleta), no al crear NV. Refactor de NV/Factura va en task aparte W1-08.
3. **Receptor anónimo permitido:** RUT genérico SII `66666666-6` cuando no hay cliente registrado. Campos opcionales `nombre_receptor`, `email_envio`, `patente_vehiculo`.
4. **Patente vehículo:** campo opcional en boleta. Indexado para que vendedor pueda buscar "qué le vendí a esta patente" cuando el cliente vuelve sin RUT.
5. **Pago inline:** método de pago + monto pagado se registran en la boleta. Estado nace `pagada` casi siempre.
6. **Email opcional:** PDF se puede enviar al receptor por email.
7. **Approach técnico:** modelo `Boleta` paralelo a `Factura` (Approach 1). Aislamiento total, riesgo regresión cero, audit log automático por whitelist.
8. **Unidades alternativas (caja/detalle):** fuera de scope. Es feature cross-cutting que afecta toda la cadena de venta. Requiere brainstorm propio. Nueva task en backlog.

## 3. Modelo de datos

### Tabla `boletas`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | int PK | |
| `numero` | int unique | auto, secuencial bajo lock vía `system_config.boleta_last_id` |
| `fecha` | date | default hoy |
| `tipo_dte` | str(2) | `'39'` afecta o `'41'` exenta |
| `cliente_id` | int FK clientes | nullable (anónima) |
| `empresa_id` | int FK empresas | nullable |
| `patente_vehiculo` | str(10) | nullable, indexed, normalizada (mayúsculas, sin espacios) |
| `email_envio` | str | nullable |
| `nombre_receptor` | str | nullable; usado cuando `cliente_id` es null |
| `rut_receptor` | str | nullable; default `66666666-6` si null y cliente_id null |
| `vendedor_id` | int FK users | required |
| `metodo_pago` | enum | `efectivo`, `debito`, `credito`, `transferencia`, `otro` |
| `total_neto` | decimal | |
| `total_iva` | decimal | 0 si tipo_dte=41 |
| `total` | decimal | bruto |
| `monto_pagado` | decimal | default = total |
| `estado` | enum | `emitida`, `anulada` |
| `dte_estado` | enum | `no_emitida`, `pendiente`, `procesando`, `aceptada`, `rechazada` |
| `xml_raw` | text | nullable |
| `track_id` | str | nullable, Lioren |
| `folio_sii` | int | nullable |
| `email_enviado_at` | datetime | nullable |
| `created_at`, `updated_at` | datetime | |

### Tabla `boleta_lineas`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | int PK | |
| `boleta_id` | int FK boletas | cascade delete |
| `producto_id` | int FK productos | required |
| `descripcion` | str | snapshot |
| `cantidad` | decimal | |
| `precio_unitario` | decimal | bruto en boleta (incluye IVA si tipo=39) — guardar también neto + iva calculados |
| `descuento_pct` | decimal | default 0 |
| `exenta` | bool | default false; permite mix de líneas exentas en boleta 39 |
| `total_linea` | decimal | bruto |

### Cambios en tablas existentes

- `dte_emisiones`:
  - Agregar `boleta_id FK` nullable.
  - Recrear check constraint: exactamente uno de (`factura_id`, `nota_credito_id`, `nota_debito_id`, `boleta_id`) no nulo.
  - Tipos válidos extendidos: `'039'`, `'041'`.
- `notas_credito`:
  - Agregar `boleta_id FK` nullable. Permite NC referencie boleta para anulación.
- `system_config`:
  - Seed `boleta_last_id = 0`.
- `permisos`:
  - Seed `boletas:ver`, `boletas:emitir`, `boletas:anular`, `boletas:exportar`. Asignados a roles Admin (todos) y Vendedor (`ver`, `emitir`).

### Migración Alembic

Una sola revision: crea `boletas` + `boleta_lineas`, altera `dte_emisiones` (add column + drop+recreate check), altera `notas_credito` (add column), inserta system_config seed y permisos seed.

## 4. API

Router `/api/boletas` (scope permiso `boletas:*`).

| Método | Ruta | Permiso | Descripción |
| --- | --- | --- | --- |
| POST | `/api/boletas` | `boletas:emitir` | Crear + encolar emisión DTE en una sola llamada |
| GET | `/api/boletas` | `boletas:ver` | Listar paginado con filtros |
| GET | `/api/boletas/{id}` | `boletas:ver` | Detalle con líneas + dte_emision |
| PATCH | `/api/boletas/{id}` | `boletas:emitir` | Solo metadata accesoria (email, patente). Bloqueado si `dte_estado='aceptada'` |
| POST | `/api/boletas/{id}/anular` | `boletas:anular` | Genera NC asociada (DTE 61), revierte stock |
| POST | `/api/boletas/{id}/pdf` | `boletas:ver` | Genera PDF (idempotente) |
| GET | `/api/boletas/{id}/pdf` | `boletas:ver` | Descarga PDF |
| POST | `/api/boletas/{id}/email` | `boletas:emitir` | Envía PDF al receptor |
| GET | `/api/boletas/export/excel` | `boletas:exportar` | Excel filtrado |

### Filtros listado

`fecha_desde`, `fecha_hasta`, `cliente_id`, `patente` (case-insensitive, normalizado), `estado`, `dte_estado`, `metodo_pago`, `vendedor_id`, paginado.

### Reglas

- POST crear: numeración bajo lock (mismo patrón Factura). Validar líneas, calcular totales (neto/IVA según tipo_dte y por línea exenta), descontar stock, crear `DteEmision`, encolar tarea Celery `emit_dte`.
- DELETE no existe. Solo anulación vía NC.
- PATCH bloquea cambios estructurales (líneas, totales, tipo_dte, totales) — solo email, patente, nombre_receptor mientras DTE no aceptado.
- Búsqueda por patente: normaliza input (uppercase, strip whitespace) antes de comparar contra columna ya normalizada.

## 5. Servicios DTE

### `DteService.build_boleta_payload(boleta) -> dict`

- `tipo_dte = 39` o `41` según `boleta.tipo_dte`.
- `emisor`: igual que factura (config tenant).
- `receptor`:
  - Si `cliente_id` no nulo → datos cliente.
  - Si nulo → `{rut: '66666666-6', razon_social: nombre_receptor or 'Consumidor Final'}`.
- `detalle`: cada línea con `precio_unitario` bruto. Internamente Boleta guarda neto + IVA para reportes/libros.
- DTE 39: enviar IVA agregado. DTE 41: todo exento.
- `referencia`: si `patente_vehiculo` presente, agregar referencia documental tipo `"PATENTE"` (no estándar SII pero útil interno).

### `tasks/dte.py`

- `_process_emit`: agregar branch `Boleta` (eager load lineas + cliente, build payload, emit, store track_id + folio).
- `_sync_dte_estado`: sincronizar estado boleta cuando webhook responde (mismo patrón factura).

### Webhook Lioren

Sin cambios. Endpoint `/api/dte/webhook` ya despacha por `emision_id`.

### Anulación

Anular boleta → genera NC tipo 61 referenciando boleta (FK `boleta_id` agregada a `notas_credito`). Al confirmarse la emisión exitosa de la NC, revertir stock vía `MovimientoInventario(tipo='nc_anulacion_boleta', cantidad=+N)` por cada línea original. Boleta pasa a `estado='anulada'`.

### Stock

Crear `MovimientoInventario(tipo='boleta_emit', boleta_id=X, cantidad=-N)` por línea **sincrónicamente al crear la boleta**, antes de encolar `emit_dte`. Razón: mercadería sale físicamente al emitir; no podemos esperar la respuesta async del SII para reservar inventario, sino se vendería dos veces el mismo stock entre creación y aceptación.

Si SII rechaza vía webhook (`dte_estado='rechazada'`) → revertir movimientos automáticamente vía hook en `_sync_dte_estado` y dejar boleta en estado `anulada`.

Si la boleta queda `dte_estado='procesando'` indefinidamente (sin respuesta SII), el stock permanece descontado — operación manual reconciliará. Documentar en runbook.

## 6. Frontend

### Rutas

- `/boletas` — lista + filtros.
- `/boletas/nueva` — formulario rápido emisión.
- `/boletas/:id` — detalle.

### `/boletas/nueva` — flujo retail rápido

- Header compacto: `[Tipo: 39 afecta | 41 exenta]`, fecha (default hoy).
- Receptor: toggle `[Anónimo | Cliente registrado]`.
  - Anónimo: campos opcionales `nombre_receptor`, `email`, `patente_vehiculo`.
  - Cliente: autocomplete RUT/nombre, autorelleno.
- Líneas: tabla con autocomplete producto (Cmd+K-style ya existente), cantidad, precio (default lista), descuento. Suma totales en vivo.
- Pago: select `metodo_pago` + `monto_pagado` (default = total).
- Botón **Emitir** → POST → redirige a `/boletas/:id` con toast.
- Atajos: Ctrl+Enter emite, Esc cancela.

### `/boletas` (lista)

- Tabla: número, fecha, receptor (cliente o `nombre_receptor`/RUT genérico), patente, total, método pago, estado, dte_estado, vendedor.
- Acciones por fila: ver, PDF, reenviar email, anular.
- Filtro patente prominente (input dedicado).
- Botón **Exportar Excel** filtrado.

### `/boletas/:id` (detalle)

- Header con número, folio SII, dte_estado badge.
- Líneas, totales, pago, receptor, patente.
- Acciones: descargar PDF, enviar email, anular (genera NC), ver XML.

### Sidebar nav

Entrada "Boletas" bajo grupo "Ventas" (junto a Cotizaciones, NV, Facturas).

### PDF

`templates/boleta.html` — formato 80mm-friendly (ticket-style) y carta opcional. Contenido: logo, datos emisor, folio, fecha, líneas, total, método pago, patente, código TED/timbre desde Lioren.

### Email

Template `boleta_envio` hardcoded simple (sin EmailTemplate dinámico — esa pieza llega con W2-05).

## 7. Reportes

- `reporte_ventas` extiende totales: separar columna boletas + facturas.
- Endpoint nuevo `/reportes/boletas` opcional para detalle puro.
- Aggregations sobre `DteEmision` incluyen tipos `'039'` y `'041'`.

## 8. Audit log

Agregar `Boleta`, `BoletaLinea` al set `_AUDITABLE_MODEL_NAMES` en `services/auditoria.py`. Cobertura automática por listener global.

## 9. Tests

### Backend (`tests/test_boletas.py`)

1. POST crea boleta + líneas + dte_emision encolada.
2. POST anónima sin `cliente_id` → receptor genérico `66666666-6`.
3. POST con patente → indexada y buscable case-insensitive.
4. POST descuenta stock por cada línea.
5. POST tipo 41 → totales sin IVA.
6. POST tipo 39 → IVA 19% calculado.
7. Anulación → genera NC + revierte stock.
8. PATCH bloquea cambios si `dte_estado='aceptada'`.
9. GET con filtro patente case-insensitive.
10. PDF endpoint devuelve bytes válidos.
11. Email endpoint marca `email_enviado_at`.
12. Permisos: vendedor sin `boletas:anular` → 403.
13. Numeración bajo lock concurrente (test paralelo).
14. Sync estado: webhook actualiza dte_estado.

### DTE service

15. `build_boleta_payload(39)` produce payload válido shape.
16. `build_boleta_payload(41)` sin IVA.
17. Patente aparece en referencia.

### Frontend (vitest)

18. Página `/boletas/nueva` emite boleta anónima exitosamente (mock API).
19. Filtro patente en lista.

## 10. Aceptación

- Crear boleta standalone → DTE aceptado en SII certificación (testeable contra Lioren sandbox).
- Boleta anónima con patente queda buscable.
- Stock baja al emitir, sube al anular.
- Export Excel mensual incluye boletas con filtros aplicados.
- Email con PDF llega al receptor.
- Audit log captura todas las mutaciones.
- Tests pasan en CI.

## 11. Out of scope (tasks separadas)

- **W1-08 nueva** — Refactor stock: mover descuento desde NV (hoy) a Factura (futuro). Requerido para coherencia con boleta.
- **Unidades alternativas** (caja/pack/detalle) — feature cross-cutting, brainstorm propio.
- **POS** (W5-03) — caja con boleta + impresora térmica + código de barras.
- **EmailTemplate dinámico** (W2-05) — boleta usa template hardcoded por ahora.

## 12. Riesgos

- **Lioren sandbox 39/41:** verificar que la cuenta tenga ambos tipos habilitados antes de empezar implementación.
- **Stock duplicado:** cuando llegue W1-08 (refactor stock factura), validar que boleta + factura no descuenten dos veces el mismo producto. Bandera de feature flag o test específico.
- **Patente como referencia DTE:** SII no la valida. Ningún riesgo legal pero requiere documentar interno.
- **Boleta 41 con líneas mixtas:** el flag `exenta` por línea permite líneas exentas dentro de boleta 39, pero boleta 41 todas las líneas deben ser exentas — validar en API.
