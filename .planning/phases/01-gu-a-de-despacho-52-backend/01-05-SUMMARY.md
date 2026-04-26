---
phase: 01-gu-a-de-despacho-52-backend
plan: "05"
subsystem: backend/tests
tags: [tdd, tests, guia-despacho, dte-52, verification]
dependency_graph:
  requires: ["01-01", "01-02", "01-03", "01-04"]
  provides: ["test-coverage-dte-01-07"]
  affects: []
tech_stack:
  added: []
  patterns: ["pytest-patch", "audit-entity-type", "_process_emit-mock", "DteService-init-mock"]
key_files:
  created:
    - backend/tests/test_guias_despacho.py
  modified:
    - backend/app/schemas/guia_despacho.py
decisions:
  - "_process_emit firma es (db, emision, svc) — plan decía (svc, emision, db); ajustado al código real"
  - "DteService() requiere credenciales — tests mockean __init__ y emit juntos para aislar polling path"
  - "AuditLog usa entity_type, no model_name — test_audit_log_diff ajustado a campo real"
  - "VendedorMinOut.username corregido a name (User model no tiene username)"
  - "Usadas fixtures vendedor_token/vendedor_user de conftest en lugar de helper _crear_vendedor_token"
metrics:
  duration: "~10 min"
  completed: "2026-04-26"
  tasks_completed: 1
  files_created: 1
  files_modified: 1
requirements_closed: [DTE-01, DTE-02, DTE-03, DTE-04, DTE-06, DTE-07]
---

# Phase 1 Plan 05: Test Suite Guías Despacho DTE 52 — Summary

Suite pytest de 13 tests cubriendo todos los REQ-IDs de Phase 1 (DTE-01..04, 06, 07) incluyendo el polling path completo de DTE-02 via `_process_emit` con `DteService.emit` mockeado.

## What Was Built

Archivo `backend/tests/test_guias_despacho.py` con 13 funciones de test:

| Test | Cubre | Estado |
|------|-------|--------|
| test_crear_guia_basica | DTE-01: POST 201, motivo=1, dte_estado=pendiente, emit_dte.delay | PASSED |
| test_crear_guia_sin_permiso_403 | DTE-06: vendedor sin perm delete → 403 | PASSED |
| test_motivo_traslado_invalido_422 | D-05: motivo=10 → 422 ValidationError | PASSED |
| test_lineas_vacias_422 | D-05: lineas=[] → 422 | PASSED |
| test_guia_no_descuenta_stock | D-13/INV-04: stock_actual invariante, 0 MovimientoInventario | PASSED |
| test_emitir_guia_dispara_dte | DTE-02: emit_dte.delay llamado con int | PASSED |
| test_process_emit_guia_asigna_track_id | DTE-02 polling (B-1): _process_emit asigna track_id="TRK-12345" y persiste | PASSED |
| test_anular_guia_via_nc_aceptada | D-16: NC aceptada → guia.estado="anulada" | PASSED |
| test_anular_guia_nc_pendiente_no_anula | D-16 guard: NC procesando → estado="emitida" (invariante) | PASSED |
| test_pdf_genera | DTE-03: GET /pdf → 200, content-type=application/pdf, magic bytes %PDF- | PASSED |
| test_delete_guia_emitida_409 | D-29: DELETE guía pendiente → 409 con hint "anular" | PASSED |
| test_audit_log_diff | DTE-07: crear+editar → ≥2 AuditLog con entity_type="GuiaDespacho" | PASSED |
| test_numeracion_concurrente_guias | D-28: skipif sqlite (Postgres-only) | SKIPPED |

**Resultado final:** `12 passed, 1 skipped, exit 0`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] VendedorMinOut.username no existe en User model**
- **Found during:** Task 1 (primera ejecución de tests — ResponseValidationError)
- **Issue:** `backend/app/schemas/guia_despacho.py` definía `VendedorMinOut` con campo `username` pero `User` model expone `name` (no `username`). Plan 02 copió boleta pattern incorrectamente.
- **Fix:** Cambiado `username: str` → `name: str` en `VendedorMinOut` de `guia_despacho.py`, igual al patrón en `schemas/boleta.py`
- **Files modified:** `backend/app/schemas/guia_despacho.py`
- **Commit:** 0811b81

**2. [Rule 1 - Adjustment] Firma de _process_emit difiere del plan**
- **Found during:** Task 1 lectura de app/tasks/dte.py línea 63
- **Issue:** El plan especificaba `_process_emit(svc, emision, db)` pero la firma real implementada en Plan 03 es `_process_emit(db, emision, svc)` (parámetros en diferente orden)
- **Fix:** Tests usan firma real con keyword arguments para evitar confusión: `_process_emit(db=db, emision=emision, svc=svc)`
- **Files modified:** `backend/tests/test_guias_despacho.py`

**3. [Rule 1 - Adjustment] DteService() requiere credenciales**
- **Found during:** Task 1 (TypeError al instanciar DteService sin args)
- **Issue:** Plan asumía `DteService()` sin args, pero requiere `api_key, api_url, webhook_secret`
- **Fix:** Test mockea `DteService.__init__` además de `DteService.emit` para aislar el path sin credenciales reales
- **Files modified:** `backend/tests/test_guias_despacho.py`

**4. [Rule 1 - Adjustment] AuditLog usa entity_type, no model_name**
- **Found during:** Task 1 (InvalidRequestError: no property "model_name")
- **Issue:** Plan y template del PLAN usaban `filter_by(model_name=...)` pero `AuditLog` model expone `entity_type`
- **Fix:** `filter_by(entity_type="GuiaDespacho")`
- **Files modified:** `backend/tests/test_guias_despacho.py`

**5. [Adjustment] vendedor_token fixture disponible en conftest**
- **Found during:** Lectura de conftest.py
- **Issue:** Plan proponía helper `_crear_vendedor_token(client, admin_token)` pero conftest ya tiene fixtures `vendedor_user` y `vendedor_token` listas para usar
- **Fix:** Test `test_crear_guia_sin_permiso_403` usa fixture `vendedor_token` de conftest directamente
- **No deviation desde perspectiva de REQs — mejora de simplicidad**

## Threat Flags

Ninguno — plan de tests no introduce superficie de red ni endpoints nuevos.

## Known Stubs

Ninguno — los tests verifican comportamiento real de la implementación; no hay stubs de datos.

## Self-Check: PASSED

- FOUND: `backend/tests/test_guias_despacho.py`
- FOUND: commit `0811b81` fix(01-05) — schema bug fix
- FOUND: commit `a252027` test(01-05) — test suite
- `pytest tests/test_guias_despacho.py` → 12 passed, 1 skipped, exit 0
