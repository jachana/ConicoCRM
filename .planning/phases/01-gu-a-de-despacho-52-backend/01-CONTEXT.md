# Phase 1: Guía de Despacho 52 — Backend - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning
**Mode:** `--auto` (decisions auto-selected from boleta DTE 39/41 analog and ROADMAP success criteria)

<domain>
## Phase Boundary

Backend para emitir, consultar y anular Guías de Despacho Electrónicas DTE 52 en Chile vía Lioren — modelo SQLAlchemy `GuiaDespacho` + `GuiaDespachoLinea`, router `/api/guias-despacho`, integración pipeline DTE existente (`DteEmision` + Celery `emit_dte` + polling + webhook), PDF WeasyPrint, email SMTP, anulación mediante NC tipo 61 vinculada, permisos por rol, y auditoría con before/after diff.

**Excluido del scope (otra fase):** UI `/guias-despacho` (Phase 2), refactor stock-on-emit (Phase 3), deploy go-live (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Modelo y schema

- **D-01:** Modelo `GuiaDespacho` mirroring `Boleta` shape (header + lineas tablas), `__tablename__ = "guias_despacho"`. Línea: `GuiaDespachoLinea` con FK CASCADE.
- **D-02:** Campos header: `id, numero (unique index), fecha, cliente_id (FK clientes ON DELETE SET NULL nullable), empresa_id (FK empresas SET NULL nullable), nota_venta_id (FK nota_ventas SET NULL nullable), motivo_traslado (Integer 1..9), direccion_destino (String 255), comuna_destino (String 100), email_envio, vendedor_id (FK users SET NULL), estado (String 20, default 'emitida'), dte_estado (String 20, default 'no_emitida'), xml_raw, track_id, folio_sii, email_enviado_at, created_at, updated_at`.
- **D-03:** Campos línea: copia exacta de `BoletaLinea` (`orden, producto_id nullable, descripcion, cantidad Numeric(10,2), precio_unitario Numeric(12,2), descuento_pct Numeric(5,2), exenta Boolean, total_neto, iva, total_linea`). Totales calculados igual que boleta DTE 39 (precio bruto, IVA 19%) — guía 52 SÍ admite líneas afectas + exentas; totales se calculan para Lioren aunque guía no tenga efecto tributario propio.
- **D-04:** Vínculo opcional `nota_venta_id` — **NO bloquea** la NV (a diferencia de NV→Factura chain locking). NV puede tener múltiples guías o ninguna. Validar en `crear_guia_despacho` que la NV existe y pertenece al mismo `cliente_id` si ambos vienen en payload.
- **D-05:** Validar `motivo_traslado ∈ {1..9}` en Pydantic `GuiaDespachoCreate` (`Literal[1,2,3,4,5,6,7,8,9]`). Persistir como `Integer`. Significados (DTE-01):
  - 1=operación constituye venta, 2=ventas por entregar, 3=consignaciones, 4=entrega gratuita, 5=traslado interno, 6=otros traslados no venta, 7=guía de devolución, 8=traslado para exportación, 9=venta para exportación.
- **D-06:** `GuiaDespachoUpdate` schema = solo metadata accesoria (`direccion_destino, comuna_destino, email_envio`). Sin líneas, sin totales, sin motivo, sin tipo. Igual al patrón `BoletaUpdate`.

### Numeración correlativa

- **D-07:** Reutilizar `_next_numero(db, "guia_despacho_last_id")` desde `app/api/dte.py:25-33` (ya implementado con `SELECT FOR UPDATE` sobre `system_config`). NO duplicar lógica en `app/api/guias_despacho.py`.
- **D-08:** Concurrencia: el lock `with_for_update()` resuelve race conditions bajo Postgres real. Test de concurrencia es Postgres-only (skip SQLite) — replicar el `pytest.mark.skipif` que usan boletas. Considerar agregar el test si W1-04 ya tiene precedente; planner decide alcance.

### Integración con pipeline DTE existente

- **D-09:** Extender `DteEmision` (no crear modelo nuevo) — agregar columna `guia_despacho_id Integer FK guias_despacho ON DELETE CASCADE NULLABLE INDEX` y actualizar `ck_dte_emision_one_document` para incluirla en la suma. Migración Alembic debe `op.drop_constraint` + `op.create_check_constraint` con la nueva expresión (5 FKs ahora).
- **D-10:** Tipo SII `"052"` agregado al universo de strings de `DteEmision.tipo`. Crear `emitir_guia_despacho` endpoint `POST /api/dte/guias-despacho/{id}/emitir` que crea `DteEmision(tipo="052", guia_despacho_id=...)` y dispara `emit_dte.delay(emision.id)` — mismo patrón que `emitir_factura`/`emitir_nc`/etc.
- **D-11:** En `DteService` agregar método `build_guia_payload(guia, db) -> dict` que retorna `{tipo_dte: 52, fecha_emision, emisor, receptor, detalle, totales, referencias: [{tipo: "MOTIVO", valor: motivo_traslado}, ...], destino: {direccion, comuna}}`. Field names exactos contra Lioren v1 — researcher debe validar contra `https://api.lioren.cl/v1/documentos` docs (ver canonical_refs).
- **D-12:** En `app/tasks/dte.py:_process_emit` y `_sync_dte_estado`, agregar rama `elif emision.guia_despacho_id:` con `joinedload(GuiaDespacho.lineas, GuiaDespacho.cliente)` y `db.get(GuiaDespacho, ...)`. **No** revertir stock cuando guía rechaza (a diferencia de boleta) porque guía 52 no descuenta stock por sí misma — solo marcar `dte_estado='rechazada'`.

### Stock impact

- **D-13:** Guía de Despacho 52 **NO** descuenta stock ni revierte stock. Documentado como comentario inline en `crear_guia_despacho` y en `docs/architecture.md` (sección "Inventario / momento de descuento"). Esta decisión es invariante de la fase 3 (stock-on-emit refactor) — guía no es documento tributario por sí mismo.

### Anulación vía Nota de Crédito

- **D-14:** Extender `NotaCredito` con FK `guia_despacho_id Integer FK guias_despacho ON DELETE SET NULL NULLABLE`. Migración Alembic agregar columna sin breaking change (NC existentes quedan con NULL).
- **D-15:** Extender `NotaCreditoCreate` schema con `guia_despacho_id: int | None = None`. Validar en `crear_nc` que si viene `guia_despacho_id`, no viene también `factura_id` (mutual exclusion: NC anula UNA cosa).
- **D-16:** Cuando `DteEmision` de NC tipo 061 vinculada a guía pasa a `aceptada` (vía webhook o polling), en `_sync_dte_estado`, si la NC tiene `guia_despacho_id`: `db.get(GuiaDespacho, nc.guia_despacho_id).estado = 'anulada'`. La guía queda inmutable (`is_locked` → estado != 'emitida'). Razón: solo NC aceptada por SII anula legalmente — no NC en estado 'pendiente' o 'procesando'.
- **D-17:** Frontend Phase 2 usará flujo "Anular guía" que crea NC tipo 61 prellenada (líneas copiadas, razón: "Anulación guía despacho N°{numero}"). Backend solo ofrece la primitiva — no endpoint dedicado `POST /guias-despacho/{id}/anular`.

### PDF y Email

- **D-18:** Template `backend/app/templates/guia_despacho.html` — copiar `boleta.html` y adaptar header (título "Guía de Despacho Electrónica", motivo de traslado visible, dirección destino, vínculo NV si aplica). Incluir folio SII y track_id en el footer cuando estén disponibles.
- **D-19:** Función `generar_pdf_guia_despacho(guia: GuiaDespacho) -> bytes` en `app/services/pdf.py` siguiendo firma de `generar_pdf_boleta`.
- **D-20:** Función `enviar_guia_despacho(guia, destinatario_email, pdf_bytes)` en `app/services/email.py` — copia de `enviar_boleta`. Asunto: `"Guía de Despacho N°{numero} - {emisor}"`.
- **D-21:** Endpoints HTTP: `GET /api/guias-despacho/{id}/pdf` retorna `Response(pdf_bytes, media_type="application/pdf")`. `POST /api/guias-despacho/{id}/email` con body `{email: str}` (default a `email_envio` o `cliente.email`) — síncrono, raise `HTTPException 422` si SMTP no configurado (`EmailNotConfiguredError`).

### Permisos

- **D-22:** Agregar `"guias_despacho"` a `MODULES` en `backend/app/core/permissions.py:5`. Defaults por rol (DTE-06):
  - admin: full (heredado por bucle)
  - subadmin: `view, create, edit, delete` = True
  - vendedor: `view, create, edit` = True; `delete` = False
- **D-23:** Cada endpoint de `app/api/guias_despacho.py` debe declarar `perms: tuple[User, Session] = require_permission("guias_despacho", "<action>")`. Acción `view` para GET, `create` para POST nueva, `edit` para PATCH metadata, `delete` para DELETE (solo admin/subadmin).
- **D-24:** El endpoint `POST /api/dte/guias-despacho/{id}/emitir` requiere `require_permission("guias_despacho", "create")` (consistente con `emitir_factura` que requiere `facturas:create`).

### Auditoría

- **D-25:** Agregar `"GuiaDespacho"` y `"GuiaDespachoLinea"` al set `_AUDITABLE_MODEL_NAMES` en `backend/app/services/auditoria.py:47-68`. El listener global captura before/after diff automáticamente vía `AuditContextMiddleware` — no hay código adicional.
- **D-26:** Verificar que `direccion_destino, motivo_traslado, estado, dte_estado` aparecen en el diff (no son `SENSITIVE_FIELDS`). `track_id` y `folio_sii` también deben quedar registrados (audit log para SII).

### Tests

- **D-27:** `backend/tests/test_guias_despacho.py` cubriendo:
  - `test_crear_guia_basica` — happy path con cliente_id, motivo=1, líneas afectas
  - `test_crear_guia_sin_permiso_403` — vendedor sin perm crea, falla
  - `test_motivo_traslado_invalido_422` — motivo=10 → Pydantic ValueError
  - `test_guia_no_descuenta_stock` — crear guía con producto, verificar `Producto.stock_actual` invariante (regresión INV-04)
  - `test_emitir_guia_dispara_dte` — mock `emit_dte.delay`, verificar que se llama con `emision.id`
  - `test_anular_guia_via_nc_emitida` — crear guía aceptada, crear NC con `guia_despacho_id`, simular webhook estado=aceptado, verificar `guia.estado == 'anulada'`
  - `test_pdf_genera` — render template Jinja2, verificar bytes no vacíos
  - `test_audit_log_diff` — crear+editar+anular guía, verificar 3 entries en `audit_log` con diff coherente
- **D-28:** Test de concurrencia `test_numeracion_concurrente_guias` — `pytest.mark.skipif(SQLite)`, dos transacciones simultáneas no deben colisionar en `numero`. Marcado con `@pytest.mark.smoke` (excluido por default según `pytest.ini addopts = -m "not smoke"`); planner decide si entra en este sprint o se difiere.

### Router y wiring

- **D-29:** Nuevo archivo `backend/app/api/guias_despacho.py`. Endpoints (referencia patrón `boletas.py`):
  - `POST /` → crear (devuelve `GuiaDespachoOut`, 201)
  - `GET /` → listar paginado con filtros (`estado`, `dte_estado`, `cliente_id`, `desde`, `hasta`)
  - `GET /{id}` → detalle con líneas joinedload
  - `PATCH /{id}` → metadata only (`direccion_destino, comuna_destino, email_envio`)
  - `DELETE /{id}` → soft? **NO** — DELETE elimina solo si `dte_estado == 'no_emitida'`. Si ya emitida, retornar `409 Conflict` con detail "No se puede eliminar guía emitida; usá NC para anular". Igual que boleta.
  - `GET /{id}/pdf` → bytes PDF
  - `POST /{id}/email` → enviar SMTP
- **D-30:** Wiring en `backend/app/main.py`: `app.include_router(guias_despacho.router, prefix="/api/guias-despacho", tags=["guias-despacho"])`.
- **D-31:** Endpoint emisión va en `backend/app/api/dte.py` bajo sección `# ── Guías de Despacho ──`, no en `guias_despacho.py` — coherente con `emitir_factura`/`emitir_nc`/`emitir_nd`/`emitir_boleta` que viven todos juntos en `dte.py`.

### Schemas Pydantic

- **D-32:** Archivo nuevo `backend/app/schemas/guia_despacho.py` con: `GuiaDespachoLineaCreate`, `GuiaDespachoLineaOut`, `GuiaDespachoCreate`, `GuiaDespachoUpdate`, `GuiaDespachoOut`, `GuiaDespachoListOut`, `ClienteMinOut` (reusar tipo si se puede importar desde `schemas/boleta.py`, sino duplicar — la convención del codebase es duplicar Min schemas). Validators: `lineas_no_vacias`, `motivo_traslado_valido`.
- **D-33:** `GuiaDespachoListOut` incluye campos pequeños (id, numero, fecha, cliente_id, motivo_traslado, total, estado, dte_estado, track_id) — sin líneas. `GuiaDespachoOut` incluye líneas con `selectinload`.

### Migraciones Alembic

- **D-34:** Una migración monolítica `xxxxxxxxxxxx_add_guias_despacho.py` que:
  1. `op.create_table('guias_despacho', ...)` con todas las columnas, índices, FKs.
  2. `op.create_table('guia_despacho_lineas', ...)`.
  3. `op.add_column('dte_emisiones', sa.Column('guia_despacho_id', ...))` + `op.create_foreign_key` + `op.create_index`.
  4. `op.drop_constraint('ck_dte_emision_one_document', 'dte_emisiones', type_='check')` + `op.create_check_constraint(name, 'dte_emisiones', '<nueva expresión con 5 FKs>')`.
  5. `op.add_column('notas_credito', sa.Column('guia_despacho_id', ...))` + FK + índice.
  6. `op.execute("INSERT INTO system_config(key, value) VALUES ('guia_despacho_last_id', '0') ON CONFLICT DO NOTHING")` para inicializar contador.
- **D-35:** `downgrade()` debe ser reverso completo y testeable. Documentar con docstring "Reversible — guías y NCs vinculadas se pierden si downgrade tras emisión real".

### Claude's Discretion

- Naming exacto de campos en payload Lioren — researcher debe consultar docs Lioren v1 (`canonical_refs`). Si difiere de lo asumido en D-11, planner ajusta `build_guia_payload`.
- Exact email subject/body wording — copiar de boleta y adaptar texto, no requiere decisión del usuario.
- `pytest.mark.smoke` para test concurrencia — planner decide si entra en sprint o queda pendiente como W1-04 lo dejó.

### Folded Todos

Ninguno — STATE.md "Open Todos" lista próximos comandos GSD, no scope-cuestiones para esta fase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements (locked)

- `.planning/ROADMAP.md` §"Phase 1: Guía de Despacho 52 — Backend" — goal, success criteria, requirements DTE-01..07.
- `.planning/REQUIREMENTS.md` §"DTE / SII" — texto completo de cada requirement, motivos de traslado SII (1..9).
- `.planning/PROJECT.md` §"Active" + §"Key Decisions" — W1-05 priorización, Lioren como provider único.
- `.planning/STATE.md` §"Current Position" + §"Risks" — concurrencia Postgres-only test, deadline 2026-04-30.

### Codebase canon (analog: boleta DTE 39/41)

- `backend/app/models/boleta.py` — modelo + línea pattern a copiar.
- `backend/app/api/boletas.py` — router pattern: `_asignar_numero_*`, `_calcular_lineas_y_totales`, `_load_*`, validators, CRUD shape (líneas 1-100 son la receta).
- `backend/app/schemas/boleta.py` — `BoletaCreate/Update/Out/ListOut`, validators con `@field_validator @classmethod`, `Literal[...]` para enums.
- `backend/app/api/dte.py:25-33` — `_next_numero(db, key)` reutilizable. §"Notas de Crédito" (líneas 107-180) — patrón anulación que extender con `guia_despacho_id`.
- `backend/app/services/dte_service.py` — `build_factura_payload, build_nc_payload, build_nd_payload, build_boleta_payload` como referencia; agregar `build_guia_payload` siguiendo el mismo shape.
- `backend/app/tasks/dte.py` — `_process_emit`, `_sync_dte_estado`, `emit_dte`, `poll_dte_status` — extender ramas para `guia_despacho_id`.
- `backend/app/models/dte_emision.py` — check constraint `ck_dte_emision_one_document` que MUST update (5 FKs).
- `backend/app/models/nota_credito.py` — modelo a extender con FK `guia_despacho_id`.
- `backend/app/services/auditoria.py:47-68` — `_AUDITABLE_MODEL_NAMES` set a extender.
- `backend/app/core/permissions.py:5-46` — `MODULES` + `_DEFAULT` defaults a extender (DTE-06).
- `backend/app/services/pdf.py` + `backend/app/templates/boleta.html` — patrón PDF.
- `backend/app/services/email.py` — `enviar_boleta` patrón SMTP síncrono.
- `backend/app/services/boleta_stock.py` — referencia de **lo que NO** debemos hacer en guía (no llamar nada similar). Confirma D-13 (no stock impact).
- `backend/migrations/versions/` — buscar la migración más reciente de boleta o NC para el shape de `op.create_table` + `op.create_check_constraint`.

### Codebase maps

- `.planning/codebase/STRUCTURE.md` §"Where to Add New Code" — receta de 8 pasos para nueva entidad. Seguir exacto (model → schema → router → main.py → permissions → migration → auditoria → tests).
- `.planning/codebase/CONVENTIONS.md` §"Backend (Python)" + §"Error Handling" — naming Spanish, snake_case, HTTPException con detail Spanish corto, status codes 201/204/404/409/422, `db.rollback()` siempre antes de raise.
- `.planning/codebase/INTEGRATIONS.md` §"DTE / SII" — Lioren endpoints `/v1/documentos` POST/GET, webhook HMAC, mapping de estados.
- `.planning/codebase/CONCERNS.md` — concurrencia numeración Postgres-only, performance `_get_config_dict` reload (no aplica a guía).
- `.planning/codebase/TESTING.md` — fixtures pytest, conftest patterns.

### External (researcher must validate)

- Lioren API v1 — exact field names para `tipo_dte: 52` payload (motivo, destino, referencias). Researcher debe consultar docs oficiales o ejemplos en código previo. Hipótesis en D-11 puede no ser exacta.
- SII (https://www.sii.cl/factura_electronica/) — Guía de Despacho Electrónica formato XML, motivos de traslado oficiales 1..9. Confirmar que la lista en DTE-01 es vigente.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`_next_numero(db, key)` en `app/api/dte.py:25`** — concurrent-safe correlativo con `with_for_update`. Reutilizar tal cual con key `guia_despacho_last_id`.
- **`require_permission(module, action)` en `app/api/deps.py`** — RBAC dependency. Solo agregar `"guias_despacho"` a MODULES.
- **`AuditContextMiddleware` (registrado en `app/main.py:69`)** — ya inyecta user_id/ip en `session.info`. Auditoría es zero-code adicional, solo agregar nombres de clase a whitelist.
- **`emit_dte` Celery task** — polimórfico sobre `DteEmision.<doc>_id`. Agregando rama para `guia_despacho_id` se reutiliza retry, polling, webhook handling.
- **`generar_pdf_boleta`, `enviar_boleta`** — copiar+adaptar (renombrar, cambiar template y subject).
- **Pydantic `BoletaCreate.lineas_no_vacias` validator** — replicable para `GuiaDespachoCreate`.

### Established Patterns

- **Spanish-first naming** (`crear_guia_despacho, listar_guias_despacho, _asignar_numero_guia_despacho`). URL en kebab: `/api/guias-despacho`.
- **`tuple[User, Session] = require_permission(...)` + `_, db = perms`** — patrón consistente en TODOS los routers. No usar `Depends(get_db)` separado.
- **HTTPException con `detail` Spanish corto** — `"Guía no encontrada"`, `"Motivo de traslado inválido"`, `"No se puede eliminar guía emitida"`.
- **`db.rollback()` siempre dentro de `except` antes de raise.**
- **DELETE retorna 409 si ya emitida** (no soft-delete; usar NC para anular).
- **Migración Alembic con `op.drop_constraint` + `op.create_check_constraint`** para extender check constraints polimórficos.
- **`pytest.mark.skipif(SQLITE_ONLY)` para tests Postgres-only** — replicar de `test_chain_locking.py` o boleta tests.

### Integration Points

- **`backend/app/main.py`** — `app.include_router(guias_despacho.router, prefix="/api/guias-despacho", tags=["guias-despacho"])` después de los routers existentes.
- **`backend/app/celery_app.py`** — NO requiere cambios. `emit_dte` y `poll_dte_status` ya están registradas y son polimórficas vía DteEmision.
- **`backend/tests/conftest.py`** — agregar `from app.models import guia_despacho  # noqa: F401` para registrar el modelo con `Base.metadata` antes de `create_all`.
- **`backend/app/api/dte.py`** — agregar sección "── Guías de Despacho ──" con `emitir_guia_despacho` endpoint.
- **`backend/app/schemas/dte.py`** — extender `NotaCreditoCreate` con campo `guia_despacho_id` y validator `xor con factura_id`.

</code_context>

<specifics>
## Specific Ideas

- **Patrón canónico:** copia mecánica de boleta DTE 39/41 (W1-04, ya en master `HEAD 2481d8e` per memoria) — toda decisión que no esté explícita aquí debe asumir "como boleta" para mantener consistencia.
- **Vinculación con NV:** el flujo típico Conico es Cotización → NV → Factura. Guía es satélite (despacho físico), no parte de la chain tributaria. Por eso `nota_venta_id` es nullable y NO bloquea la NV.
- **Anulación legal:** SII chilena exige NC tipo 61 emitida y aceptada para anular guía 52. NC en estado pendiente NO es anulación válida — el flag `guia.estado='anulada'` solo se setea cuando la NC pasa a `aceptada` (vía webhook o polling), no al momento de crear la NC.
- **Guía sin stock:** invariante explícito (D-13) — comentario de código `# Guía DTE 52 NO descuenta stock — el documento tributario asociado lo hace (ver INV-04 / docs/architecture.md)` en el endpoint `crear_guia_despacho`.

</specifics>

<deferred>
## Deferred Ideas

- **Flujo `POST /guias-despacho/{id}/anular` dedicado** — útil pero la primitiva (crear NC con `guia_despacho_id` + emitir) es suficiente. Si UX en Phase 2 lo demanda, agregar después como sugar layer (no scope Phase 1).
- **Bulk emisión** — emitir múltiples guías en una llamada. No requerido por DTE-01..07. Difiere a futuro si Conico opera volumen alto.
- **Folio CAF management** — Lioren maneja CAF transparentemente. Si en futuro se cambia provider, hay que tomar control de folios. Difiere.
- **Test Postgres-only de concurrencia** — si planner decide diferirlo, dejar TODO con ticket explícito (ej. `# TODO(W1-05-followup)`). No bloqueante para go-live.
- **Reapertura de guía anulada** — SII no permite. Si llega request, rechazar en API (`409 Conflict`). No requiere endpoint dedicado.

### Reviewed Todos (not folded)

Ninguno — STATE.md no listaba todos relevantes a esta fase.

</deferred>

---

*Phase: 1-Guía de Despacho 52 — Backend*
*Context gathered: 2026-04-26*
*Mode: --auto (decisions derived from boleta DTE 39/41 analog + ROADMAP success criteria + REQUIREMENTS DTE-01..07)*
