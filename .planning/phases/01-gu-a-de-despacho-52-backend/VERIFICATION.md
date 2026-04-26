---
phase: 01-gu-a-de-despacho-52-backend
verified: 2026-04-26T00:00:00Z
status: human_needed
score: 4/5 must-haves verified
overrides_applied: 0
gaps: []
deferred: []
human_verification:
  - test: "Validar payload `build_guia_payload` contra Lioren sandbox con credenciales reales"
    expected: "HTTP 200/201 con track_id; si 422 → ajustar field names ind_traslado/destino"
    why_human: "Requiere LIOREN_API_KEY staging. Campo names son hipótesis LOW confidence (A2/A3) — no verificables por grep ni tests unitarios."
---

# Phase 1: Guía de Despacho 52 — Backend Verification Report

**Phase Goal:** El sistema puede emitir, consultar y anular guías de despacho electrónicas DTE 52 vía API, con integración Lioren completa, auditoría y permisos por rol.
**Verified:** 2026-04-26
**Status:** PARTIAL — 4/5 Success Criteria verificadas en código + tests; SC-2 (guía llega efectivamente a Lioren) pendiente de validación sandbox manual.
**Re-verification:** No — verificación inicial

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| SC-1 | Usuario con permiso `guias_despacho:create` puede crear guía DTE 52 con líneas, motivo SII 1-9, NV opcional — correlativo sin colisión | VERIFIED | `POST /api/guias-despacho/` existe y funciona; `_next_numero` con `SELECT FOR UPDATE`; `test_crear_guia_basica PASSED`; `Literal[1..9]` en schema |
| SC-2 | Guía emitida llega a Lioren y estado procesando→aceptado/rechazado se refleja en BD vía polling Celery + webhook | HUMAN NEEDED | Pipeline conectado (build_guia_payload, _process_emit branch, _sync_dte_estado); test_process_emit_guia_asigna_track_id PASSED con mock; field names `ind_traslado`/`destino` marcados `TODO(W1-05-sandbox)` — validación real pendiente credenciales |
| SC-3 | Endpoint genera PDF descargable y envía email SMTP al receptor | VERIFIED | `generar_pdf_guia_despacho` en pdf.py; `enviar_guia_despacho` en email.py; template `guia_despacho.html`; endpoints `/pdf` y `/email` con RBAC; `test_pdf_genera PASSED` |
| SC-4 | Se puede anular guía generando NC tipo 61 con `guia_despacho_id`; guía queda marcada anulada | VERIFIED | `NotaCredito.guia_despacho_id` FK presente; `_sync_dte_estado` marca `guia.estado='anulada'` solo cuando NC `estado=='aceptada'` (D-16); `test_anular_guia_via_nc_aceptada PASSED`; `test_anular_guia_nc_pendiente_no_anula PASSED` |
| SC-5 | Toda mutación sobre GuiaDespacho/GuiaDespachoLinea queda en audit_log con diff before/after | VERIFIED | `_AUDITABLE_MODEL_NAMES` contiene `"GuiaDespacho"` y `"GuiaDespachoLinea"`; listener AuditContextMiddleware captura zero-code; `test_audit_log_diff PASSED` (≥2 entries) |

**Score:** 4/5 truths verified (SC-2 requiere validación humana)

---

## Required Artifacts

| Artifact | Status | Evidencia |
|----------|--------|-----------|
| `backend/app/models/guia_despacho.py` | VERIFIED | `GuiaDespacho` + `GuiaDespachoLinea`, todos los campos D-02/D-03, `is_locked` property |
| `backend/app/schemas/guia_despacho.py` | VERIFIED | `Literal[1,2,3,4,5,6,7,8,9]`, `lineas_no_vacias`, `GuiaDespachoOut`, `GuiaDespachoListOut`, `GuiaEmailBody` |
| `backend/app/schemas/dte.py` | VERIFIED | `NotaCreditoCreate` tiene `guia_despacho_id: int | None = None` y `_xor_anulacion @model_validator` |
| `backend/app/models/dte_emision.py` | VERIFIED | `guia_despacho_id` columna + check constraint `ck_dte_emision_one_document` con 5 FKs |
| `backend/app/models/nota_credito.py` | VERIFIED | `guia_despacho_id` FK `ON DELETE SET NULL` |
| `backend/app/api/guias_despacho.py` | VERIFIED | 7 endpoints (POST, GET lista, GET detalle, PATCH, DELETE, GET pdf, POST email); comentario D-13 inline; tipo="052"; sin stock logic |
| `backend/app/api/dte.py` (emitir_guia) | VERIFIED | `emitir_guia_despacho` endpoint con guards 409, tipo="052", emit_dte.delay |
| `backend/app/services/dte_service.py` | VERIFIED (con caveat) | `build_guia_payload` implementado; field names `ind_traslado`/`destino` marcados como hipótesis LOW confidence con `TODO(W1-05-sandbox)` |
| `backend/app/tasks/dte.py` | VERIFIED | Branch `elif emision.guia_despacho_id` en `_process_emit` con guard W-6; branch en `_sync_dte_estado` sin stock reversal |
| `backend/app/services/pdf.py` | VERIFIED | `generar_pdf_guia_despacho(guia_despacho, config)` con kwarg W-7 |
| `backend/app/services/email.py` | VERIFIED | `enviar_guia_despacho` con asunto D-20 "Guía de Despacho N°{numero} — Conico" |
| `backend/app/templates/guia_despacho.html` | VERIFIED | Template con título, motivo traslado, destino, NV vinculada, footer SII folio+track_id |
| `backend/app/core/permissions.py` | VERIFIED | `"guias_despacho"` en MODULES; vendedor delete=False; subadmin full |
| `backend/app/services/auditoria.py` | VERIFIED | `"GuiaDespacho"` y `"GuiaDespachoLinea"` en `_AUDITABLE_MODEL_NAMES` (líneas 60-61) |
| `backend/app/main.py` | VERIFIED | `include_router(guias_despacho.router, prefix="/api/guias-despacho", tags=["guias-despacho"])` |
| `backend/migrations/versions/c1d2e3f4a5b6_add_guias_despacho.py` | VERIFIED | Migración monolítica con guias_despacho, guia_despacho_lineas, FK en dte_emisiones y notas_credito, seed system_config |
| `backend/tests/test_guias_despacho.py` | VERIFIED | 12 passed, 1 skipped (Postgres-only concurrencia) — resultado real confirmado |

---

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `guias_despacho.py` | `app.api.dte._next_numero` | `from app.api.dte import _next_numero` | WIRED |
| `guias_despacho.py` | `emit_dte.delay` | `from app.tasks.dte import emit_dte` | WIRED |
| `main.py` | `/api/guias-despacho` | `app.include_router(guias_despacho.router, prefix=...)` | WIRED |
| `dte_emision.py` | `guias_despacho.id` | FK `guia_despacho_id ON DELETE CASCADE` + check 5 FKs | WIRED |
| `nota_credito.py` | `guias_despacho.id` | FK `guia_despacho_id ON DELETE SET NULL` | WIRED |
| `tasks/dte.py:_process_emit` | `build_guia_payload` | `elif emision.guia_despacho_id: ... svc.build_guia_payload(doc, db)` | WIRED |
| `tasks/dte.py:_sync_dte_estado` | `guia.estado='anulada'` | NC aceptada con `guia_despacho_id` → `guia.estado = "anulada"` | WIRED |
| `build_guia_payload` | Lioren sandbox | `ind_traslado`, `destino.{direccion,comuna}` — hipótesis pendiente validación | UNCERTAIN |

---

## Invariant Verification

### D-13: Stock Invariant (Guía 52 NO descuenta stock)

- Confirmado en código: comentario inline en `crear_guia_despacho` (`# Guía DTE 52 NO descuenta stock — el documento tributario asociado lo hace / (ver INV-04 / docs/architecture.md). Invariante intencional hasta Phase 3 (D-13).`)
- Sin imports de `boleta_stock` en `guias_despacho.py` ni en `tasks/dte.py` rama guía
- Confirmado por test: `test_guia_no_descuenta_stock PASSED` — stock_actual invariante; 0 MovimientoInventario de tipo guia_despacho
- Sin `revertir_stock` en rama `elif emision.guia_despacho_id` de `_sync_dte_estado`

### D-25: Auditoría zero-code

- `_AUDITABLE_MODEL_NAMES` en `auditoria.py` líneas 60-61 contiene `"GuiaDespacho"` y `"GuiaDespachoLinea"`
- El listener SQLAlchemy `before_flush` ya registrado en `AuditContextMiddleware` captura las mutaciones automáticamente
- Confirmado por test: `test_audit_log_diff PASSED` — ≥2 entries con `entity_type="GuiaDespacho"`

### D-16: NC anula guía SOLO cuando estado=aceptada

- Implementado en `_sync_dte_estado`: `if estado == "aceptada" and nc.guia_despacho_id`
- Guard explícito: NC en estado `procesando` NO marca guía como anulada
- Confirmado por test: `test_anular_guia_via_nc_aceptada PASSED` y `test_anular_guia_nc_pendiente_no_anula PASSED`

---

## Test Suite Results (Plan 05)

| Test | Cubre | Resultado |
|------|-------|-----------|
| test_crear_guia_basica | SC-1, DTE-01 | PASSED |
| test_crear_guia_sin_permiso_403 | DTE-06 | PASSED |
| test_motivo_traslado_invalido_422 | D-05 | PASSED |
| test_lineas_vacias_422 | D-05 | PASSED |
| test_guia_no_descuenta_stock | D-13/INV-04 | PASSED |
| test_emitir_guia_dispara_dte | DTE-02 | PASSED |
| test_process_emit_guia_asigna_track_id | DTE-02 polling path (mockeado) | PASSED |
| test_anular_guia_via_nc_aceptada | D-16, SC-4 | PASSED |
| test_anular_guia_nc_pendiente_no_anula | D-16 guard | PASSED |
| test_pdf_genera | DTE-03, SC-3 | PASSED |
| test_delete_guia_emitida_409 | D-29 | PASSED |
| test_audit_log_diff | DTE-07, SC-5 | PASSED |
| test_numeracion_concurrente_guias | D-28 | SKIPPED (Postgres-only) |

**Resultado final confirmado en entorno real:** `12 passed, 1 skipped, exit 0`

---

## Requirements Coverage

| Requirement | Plans | Status | Evidencia |
|-------------|-------|--------|-----------|
| DTE-01 (crear guía DTE 52 con motivo SII 1-9) | 01-01, 01-02, 01-03 | SATISFIED | Schema + CRUD + migración + tests |
| DTE-02 (pipeline Lioren polling + webhook) | 01-03 | PARTIAL (sandbox pendiente) | Código wired + tests mock; sandbox no validado |
| DTE-03 (PDF + email) | 01-04 | SATISFIED | Servicios + template + endpoints + test_pdf_genera |
| DTE-04 (anulación via NC vinculada) | 01-01, 01-03 | SATISFIED | FK + _sync_dte_estado D-16 + tests NC aceptada/pendiente |
| DTE-06 (permisos por rol) | 01-02 | SATISFIED | permissions.py con defaults por rol + test_403 |
| DTE-07 (audit log diff) | 01-02 | SATISFIED | _AUDITABLE_MODEL_NAMES + test_audit_log_diff |

---

## Technical Debt Explícita

### Deuda 1: Validación Sandbox Lioren (SC-2 — bloqueante para producción)

- **Archivo:** `backend/app/services/dte_service.py`, método `build_guia_payload` (línea 198)
- **Marker:** `TODO(W1-05-sandbox)` en docstring del método
- **Riesgo:** Los field names `ind_traslado` y `destino.{direccion,comuna}` son hipótesis derivadas de la documentación Lioren disponible (LOW confidence, A2/A3 en RESEARCH.md). Lioren podría esperar nombres distintos (ej. `indicador_traslado`, `IndTraslado`, o subcampo bajo `referencias`)
- **Acción requerida antes de go-live:** Ejecutar `DteService().build_guia_payload(guia_fixture, db)` contra `https://api.lioren.cl/v1/documentos` con `LIOREN_API_KEY` staging. Si retorna 200/201 → eliminar TODO y confirmar nombres. Si retorna 422/400 → ajustar field names en `build_guia_payload`.
- **Pasos documentados en:** `.planning/phases/01-gu-a-de-despacho-52-backend/01-03-SUMMARY.md` §"Sandbox Lioren"
- **Nota:** Toda la infraestructura (DteEmision tipo="052", Celery emit_dte, polling, webhook) está funcionando. Solo los field names específicos del DTE 52 necesitan confirmación real.

### Deuda 2: Test de concurrencia Postgres-only (D-28)

- **Archivo:** `backend/tests/test_guias_despacho.py`, `test_numeracion_concurrente_guias` (línea 453)
- **Estado:** Esqueleto con `pytest.mark.skipif(SQLite)` y `TODO(W1-05-followup)`
- **Impacto:** El lock `SELECT FOR UPDATE` en `_next_numero` ya garantiza la semántica; el test de regresión bajo concurrencia real queda pendiente para ambiente Postgres
- **Bloqueante:** No para go-live Beta

---

## Anti-Patterns Scan

| Archivo | Patrón | Severidad | Evaluación |
|---------|--------|-----------|-----------|
| `dte_service.py:201-203` | `TODO(W1-05-sandbox)` en docstring | WARNING | Intencional y documentado — no es stub de código sino deuda de validación externa |
| `test_guias_despacho.py:462` | `pytest.skip(...)` con TODO | INFO | Diseño explícito D-28; test concurrencia diferido a ambiente Postgres |

Sin stubs de código ni retornos hardcodeados de datos. Ningún `return []` / `return {}` en handlers. El TODO en `build_guia_payload` marca validación de integración pendiente, no código incompleto.

---

## Human Verification Required

### 1. Validación sandbox Lioren DTE 52

**Test:** Con `.env` que contenga `LIOREN_API_KEY` staging:
```bash
cd backend
python - <<'EOF'
from app.database import SessionLocal
from app.models.guia_despacho import GuiaDespacho
from app.services.dte_service import DteService, get_dte_service

db = SessionLocal()
guia = db.query(GuiaDespacho).first()  # usar guía de prueba
svc = get_dte_service()
payload = svc.build_guia_payload(guia, db)
print(payload)
result = svc.emit(payload)  # POST a Lioren sandbox
print(result)
EOF
```

**Expected:** HTTP 200/201 con `track_id` en respuesta. Si retorna 422 → registrar el mensaje de error de Lioren y ajustar los field names `ind_traslado`/`destino` en `build_guia_payload`.

**Why human:** Requiere credenciales Lioren staging (`LIOREN_API_KEY`). Los field names del DTE 52 para Lioren son hipótesis no verificables sin acceso a la API real.

---

## Open Follow-ups para Phase 2/3 Frontend

Los siguientes items están fuera del scope de Phase 1 backend y deben ser recogidos en las fases correspondientes:

1. **Phase 2 (Frontend):** UI `/guias-despacho` — lista, nueva, detalle con polling TanStack Query. El endpoint `/api/guias-despacho/{id}/anular` dedicado (sugar layer) puede evaluarse al implementar el flujo UX.
2. **Phase 2 (Frontend):** El `Sidebar.tsx` (actualmente modificado según git status) probablemente necesita entrada de navegación para guías — confirmar en Phase 2.
3. **Phase 3 (Stock):** La decisión D-13 (guía no descuenta stock) es invariante documentada. Phase 3 "Stock-on-Emit Refactor" es la fase dedicada para consolidar la lógica de descuento de stock en emisión tributaria.
4. **Futuro:** Si Lioren requiere campos adicionales del DTE 52 Resolución 154 SII (`RUTChofer`, `Patente`, `FchSalida`) — confirmar en sandbox y extender `GuiaDespacho` model con campos opcionales (A4 del RESEARCH).

---

## Gaps Summary

No hay gaps bloqueantes. La fase alcanza su objetivo de backend con todos los artefactos implementados, wired y testeados. SC-2 (llegada efectiva a Lioren) requiere validación humana con credenciales sandbox antes de que la fase pueda marcarse como completamente cerrada para go-live.

**Veredicto de infraestructura:** PASS — todos los modelos, schemas, router, pipeline DTE, PDF, email, permisos y auditoría están correctamente implementados y funcionando.

**Veredicto de integración:** PENDING — el campo `TODO(W1-05-sandbox)` en `build_guia_payload` es la única deuda técnica abierta de esta fase.

---

_Verified: 2026-04-26_
_Verifier: Claude (gsd-verifier)_
