---
phase: 01-gu-a-de-despacho-52-backend
plan: "03"
subsystem: api
tags: [dte, lioren, celery, guia-despacho, pipeline, python, sqlalchemy]

requires:
  - phase: 01-gu-a-de-despacho-52-backend
    plan: "01"
    provides: "Modelos GuiaDespacho + GuiaDespachoLinea, DteEmision.guia_despacho_id FK, NotaCredito.guia_despacho_id FK"

provides:
  - "DteService.build_guia_payload(guia, db) -> dict con tipo_dte=52, ind_traslado, destino"
  - "Endpoint POST /api/dte/guias-despacho/{id}/emitir (tipo='052')"
  - "Branch elif emision.guia_despacho_id en _process_emit con guard W-6"
  - "Branch elif emision.guia_despacho_id en _sync_dte_estado sin stock reversal"
  - "Lógica NC aceptada con guia_despacho_id marca guía como 'anulada' (D-16)"

affects:
  - "01-gu-a-de-despacho-52-backend plan 04"
  - "01-gu-a-de-despacho-52-backend plan 05"
  - "Celery emit_dte task (polimórfico extendido)"

tech-stack:
  added: []
  patterns:
    - "build_guia_payload sigue patrón idéntico a build_boleta_payload"
    - "elif guia_despacho_id en pipeline polimórfico DTE"
    - "Guard W-6: if not doc: raise ValueError antes de build_*payload"
    - "NC aceptada -> guia.estado='anulada' (D-16, solo estado='aceptada')"

key-files:
  created: []
  modified:
    - backend/app/services/dte_service.py
    - backend/app/api/dte.py
    - backend/app/tasks/dte.py

key-decisions:
  - "GuiaDespacho NO descuenta stock en _sync_dte_estado (D-12/D-13) — comentario inline explica anti-patrón"
  - "Field names ind_traslado/destino son hipótesis LOW confidence (A2/A3) — validación sandbox DEFERRED como Task 4"
  - "Guard W-6 obligatorio antes de build_guia_payload: if not doc: raise ValueError falla rápido (T-03-08)"
  - "NC anula guía SOLO si estado='aceptada' (D-16) — NC pendiente/procesando NO anula"

requirements-completed:
  - DTE-01
  - DTE-02
  - DTE-04

duration: 25min
completed: 2026-04-26
---

# Phase 1 Plan 03: DTE Pipeline Guía Despacho — Backend Summary

**Pipeline DTE Lioren extendido con tipo 052: build_guia_payload, endpoint emitir_guia_despacho, branches polimórficos en _process_emit/_sync_dte_estado, y anulación de guía vía NC aceptada**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-26T00:00:00Z
- **Completed:** 2026-04-26
- **Tasks:** 3 de 4 (Task 4 DEFERRED — checkpoint:human-action)
- **Files modified:** 3

## Accomplishments

- `DteService.build_guia_payload(guia, db)` implementado siguiendo patrón exacto de `build_boleta_payload`, retorna dict con `tipo_dte=52`, `ind_traslado`, `destino`, y `TODO(W1-05-sandbox)` marker
- Endpoint `POST /api/dte/guias-despacho/{id}/emitir` registrado en `dte.py` con `tipo="052"`, guards 409 duplicado/ya-emitida, `require_permission("guias_despacho","create")`
- `_process_emit` extendido con branch `elif emision.guia_despacho_id` + guard W-6 `if not doc: raise ValueError` antes de `build_guia_payload`
- `_sync_dte_estado` extendido con branch guía (actualiza `dte_estado` sin stock) y branch NC extendido para marcar `guia.estado='anulada'` solo cuando `estado=="aceptada" and nc.guia_despacho_id` (D-16)

## Task Commits

1. **Task 1: build_guia_payload en DteService** - `b934037` (feat)
2. **Task 2: Endpoint emitir_guia_despacho en api/dte.py** - `0bfbfff` (feat)
3. **Task 3: Branches tasks/dte.py** - `60bdb1b` (feat)
4. **Task 4: Validación sandbox Lioren** - `[checkpoint:human-action] DEFERRED` — ver sección Sandbox Lioren

## Files Created/Modified

- `backend/app/services/dte_service.py` - Import GuiaDespacho + método `build_guia_payload` (tipo_dte=52, ind_traslado, destino, TODO sandbox)
- `backend/app/api/dte.py` - Import GuiaDespacho + endpoint `emitir_guia_despacho` con guards 409
- `backend/app/tasks/dte.py` - Import GuiaDespacho + branch `elif guia_despacho_id` en `_process_emit` (con guard W-6) y `_sync_dte_estado` + extensión rama NC para anulación guía (D-16)

## Decisions Made

- Field names `ind_traslado` y `destino.{direccion,comuna}` documentados como hipótesis LOW confidence (A2/A3 en RESEARCH.md) — requieren validación sandbox
- Guard W-6 (`if not doc: raise ValueError`) obligatorio antes de `build_guia_payload` para falla rápida y rastreable (T-03-08)
- NC anula guía ÚNICAMENTE cuando `estado == "aceptada"` — no en estado "procesando" o "pendiente" (D-16, T-03-02)
- Comentario en `_sync_dte_estado` guía branch documenta explícitamente el anti-patrón "NO llamar revertir_stock_boleta"

## Sandbox Lioren

**[checkpoint:human-action] DEFERRED — Validación sandbox pendiente**

Task 4 es un checkpoint manual que requiere credenciales Lioren staging (`LIOREN_API_KEY`) y aprobación humana antes de merge a producción.

### Payload generado (estructura hipotética — field names ASSUMED)

El payload que `DteService.build_guia_payload` produce con una guía de ejemplo:

```json
{
  "tipo_dte": 52,
  "fecha_emision": "2026-04-26",
  "emisor": {
    "rut": "<desde system_config rut_emisor>",
    "razon_social": "<desde system_config razon_social_emisor>",
    "giro": "<desde system_config giro_emisor>",
    "direccion": "<desde system_config direccion_emisor>",
    "ciudad": "<desde system_config ciudad_emisor>",
    "comuna": "<desde system_config comuna_emisor>"
  },
  "receptor": {
    "rut": "<guia.cliente.rut>",
    "razon_social": "<guia.cliente.nombre>",
    "giro": "",
    "direccion": "<guia.cliente.direccion_despacho>",
    "ciudad": "<guia.cliente.comuna>",
    "comuna": "<guia.cliente.comuna>"
  },
  "detalle": [
    {
      "nombre": "<linea.descripcion>",
      "cantidad": 10.0,
      "precio_unitario": 1190,
      "descuento_porcentaje": 0.0,
      "exenta": false
    }
  ],
  "totales": {
    "monto_neto": 10000,
    "tasa_iva": 19,
    "iva": 1900,
    "monto_total": 11900
  },
  "ind_traslado": 1,
  "destino": {
    "direccion": "<guia.direccion_destino>",
    "comuna": "<guia.comuna_destino>"
  }
}
```

Un payload de ejemplo completo fue generado en `/tmp/payload_dte52.json` para referencia.

### Pasos para validar (requieren desarrollador con credenciales)

1. `cd backend && python` con venv activo y `.env` con `LIOREN_API_KEY`
2. Construir payload con fixture real: `DteService().build_guia_payload(guia, db)`
3. POST a Lioren sandbox: `curl -X POST https://api.lioren.cl/v1/documentos -H "Authorization: Bearer $LIOREN_API_KEY" -d <payload-json>`
4. Resultado esperado:
   - **200/201**: `track_id` obtenido — eliminar `TODO(W1-05-sandbox)` y reemplazar por comentario con fecha
   - **422/400**: ajustar field names en `build_guia_payload` según error Lioren

### Nota de bloqueo de producción

**Sandbox validation pending — requires Lioren staging credentials and human approval before production emit.**

El TODO `TODO(W1-05-sandbox)` permanece en `backend/app/services/dte_service.py` hasta que este checkpoint sea aprobado. SC-2 del ROADMAP (guía llega efectivamente a Lioren) NO se considera cerrado hasta completar este checkpoint.

## Deviations from Plan

None - plan ejecutado exactamente como especificado para Tasks 1-3. Task 4 es checkpoint:human-action documentado como DEFERRED per instrucciones del orchestrador.

## Issues Encountered

- El verify script de Task 3 (del PLAN) usa regex que captura el comentario de guarda en la rama guía (`# D-12 / D-13: ... NO llamar revertir_stock_boleta`), causando falso positivo "guia branch calls revertir_stock". El código real NO llama `revertir_stock` — solo lo menciona en un comentario como anti-patrón. Verificado con análisis de líneas no-comentario. Los acceptance criteria via grep pasan correctamente.
- WeasyPrint no disponible en entorno Windows de dev (GTK no instalado) — previene import de `app.main` en verificación de Task 2. Acceptance criteria verificados via grep directamente sobre el archivo. Esto es un issue preexistente del entorno, no introducido por este plan.

## Next Phase Readiness

- Pipeline DTE tipo 052 completamente conectado en backend (build, emit, sync, anulación)
- Tasks 1-3 listos para tests unitarios (Plan 05)
- **Bloqueante para producción:** Task 4 sandbox validation PENDING — Plan 04/05 pueden continuar pero release final requiere aprobación del sandbox

## Self-Check

- [x] `backend/app/services/dte_service.py` modificado con `build_guia_payload`
- [x] `backend/app/api/dte.py` modificado con `emitir_guia_despacho`
- [x] `backend/app/tasks/dte.py` modificado con branches guia_despacho_id
- [x] Commits b934037, 0bfbfff, 60bdb1b existen en el worktree
- [x] Task 4 documentada como DEFERRED con nota explícita de sandbox

## Self-Check: PASSED

---
*Phase: 01-gu-a-de-despacho-52-backend*
*Completed: 2026-04-26*
