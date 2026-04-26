---
phase: 01-gu-a-de-despacho-52-backend
plan: "02"
subsystem: backend
tags: [crud, router, fastapi, permissions, auditoria, dte52]
dependency_graph:
  requires: ["01-01"]
  provides: ["router-guias-despacho", "rbac-guias-despacho", "audit-guias-despacho"]
  affects: ["backend/app/main.py", "backend/app/core/permissions.py", "backend/app/services/auditoria.py"]
tech_stack:
  added: []
  patterns: ["require_permission RBAC dependency", "_next_numero SELECT FOR UPDATE", "SQLAlchemy joinedload/selectinload", "Celery emit_dte.delay", "FastAPI APIRouter CRUD"]
key_files:
  created:
    - backend/app/api/guias_despacho.py
  modified:
    - backend/app/core/permissions.py
    - backend/app/services/auditoria.py
    - backend/app/main.py
decisions:
  - "tipo='052' con cero lider (Pitfall 8) para DteEmision"
  - "Guia no descuenta stock (D-13) — invariante documentado como comentario inline"
  - "DELETE solo si dte_estado='no_emitida', sino 409 Conflict"
  - "_next_numero importado desde app.api.dte, no duplicado (D-07)"
  - "PATCH solo expone direccion_destino, comuna_destino, email_envio (D-06)"
metrics:
  duration: "~15 minutos"
  completed: "2026-04-26T16:03:04Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 3
---

# Phase 1 Plan 02: Router CRUD /api/guias-despacho + Permisos + Auditoría Summary

Router FastAPI completo para Guía de Despacho 52 con RBAC por rol (vendedor sin delete), auditoría automática via SQLAlchemy listener, y disparo de emit_dte Celery al crear.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Permissions + auditoría whitelist + main.py wiring | 69a6bdf | permissions.py, auditoria.py, main.py |
| 2 | Router /api/guias-despacho CRUD completo | 0de75ee | guias_despacho.py (nuevo) |

## Decisions Made

1. `tipo="052"` — cadena exacta de 3 chars con cero líder para `DteEmision`, requerido por Lioren API (Pitfall 8 del RESEARCH).
2. Numeración correlativa via `_next_numero(db, "guia_despacho_last_id")` importado desde `app.api.dte` — no duplicar la lógica `SELECT FOR UPDATE` (D-07).
3. Guía DTE 52 no descuenta stock — invariante documentado con comentario inline (D-13), consistente con arquitectura Phase 3.
4. DELETE retorna 409 si `dte_estado != 'no_emitida'` — misma semántica que boleta, anulación legal via NC tipo 61 (D-17).
5. `GuiaDespachoUpdate` solo expone 3 campos de metadata (D-06) — protege contra tampering de totales/lineas via PATCH.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Coverage

All STRIDE mitigations from the plan's threat model are implemented:

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-02-01 | `require_permission("guias_despacho", action)` en cada endpoint |
| T-02-02 | `_DEFAULT["vendedor"]["guias_despacho"]["delete"] = False` |
| T-02-03 | Guard `if guia.dte_estado != "no_emitida": 409` en DELETE |
| T-02-04 | `GuiaDespacho` y `GuiaDespachoLinea` en `_AUDITABLE_MODEL_NAMES` |
| T-02-05 | `GuiaDespachoUpdate` solo expone direccion/comuna/email |
| T-02-07 | `_next_numero` con `with_for_update()` desde app.api.dte |

## Known Stubs

None — el router es funcional para wiring. Los endpoints PDF/email son scope de Plan 04.

## Self-Check: PASSED

- [x] `backend/app/api/guias_despacho.py` creado (203 lineas)
- [x] `backend/app/core/permissions.py` contiene `guias_despacho` (3 matches)
- [x] `backend/app/services/auditoria.py` contiene `GuiaDespacho` y `GuiaDespachoLinea`
- [x] `backend/app/main.py` contiene `include_router(guias_despacho.router, prefix="/api/guias-despacho")`
- [x] Commit 69a6bdf existe (Task 1)
- [x] Commit 0de75ee existe (Task 2)
- [x] `python -c "from app.main import app"` exit 0
- [x] Routes responden 401 sin auth (`GET /api/guias-despacho/` -> 401, `POST /api/guias-despacho/` -> 401)
