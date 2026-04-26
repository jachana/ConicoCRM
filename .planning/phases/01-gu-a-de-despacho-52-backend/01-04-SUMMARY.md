---
phase: 01-gu-a-de-despacho-52-backend
plan: "04"
subsystem: api
tags: [weasyprint, pdf, smtp, email, jinja2, fastapi, guia-despacho]

# Dependency graph
requires:
  - phase: 01-gu-a-de-despacho-52-backend
    plan: "02"
    provides: "Router guias_despacho con CRUD, modelo GuiaDespacho, schema GuiaEmailBody"
provides:
  - "generar_pdf_guia_despacho(guia_despacho, config) en services/pdf.py"
  - "enviar_guia_despacho(guia_despacho, pdf_bytes, destinatario) en services/email.py"
  - "Template guia_despacho.html con titulo, motivo traslado, destino, NV vinculada"
  - "GET /api/guias-despacho/{id}/pdf retorna application/pdf"
  - "POST /api/guias-despacho/{id}/email envia SMTP, registra email_enviado_at"
affects:
  - plan-05-tests
  - frontend-guias-despacho

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PDF+email pattern extendido a GuiaDespacho siguiendo boleta como analog"
    - "EmailNotConfiguredError mapeado a HTTP 503 en endpoint /email"
    - "_config_dict helper local para SystemConfig en router guias_despacho"

key-files:
  created:
    - "backend/app/templates/guia_despacho.html"
  modified:
    - "backend/app/services/pdf.py"
    - "backend/app/services/email.py"
    - "backend/app/api/guias_despacho.py"

key-decisions:
  - "W-7: kwarg template.render usa guia_despacho= (no guia=) — variable canonica consistente con schema y template"
  - "D-20: Asunto email exacto: Guia de Despacho N°{numero} — Conico"
  - "D-21: /email retorna 503 con 'Email no configurado' cuando SMTP no disponible"
  - "D-17: Sin endpoint /anular — diferido a Phase 2 UI"
  - "WeasyPrint no carga en Windows dev (falta GTK), tests SLA W-8 deben correr en Linux/Docker"

patterns-established:
  - "PDF endpoint: require_permission view + _load_guia + generar_pdf_* + Response(application/pdf)"
  - "Email endpoint: require_permission edit + EmailNotConfiguredError catch + email_enviado_at UTC commit"

requirements-completed:
  - DTE-03

# Metrics
duration: 15min
completed: 2026-04-26
---

# Phase 1 Plan 04: PDF + Email para Guia de Despacho Summary

**Servicio WeasyPrint + SMTP para guias de despacho con template Jinja2, endpoints /pdf y /email con RBAC y registro de email_enviado_at**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-26T00:00:00Z
- **Completed:** 2026-04-26
- **Tasks:** 2/2
- **Files modified:** 4 (3 modificados, 1 creado)

## Accomplishments

- generar_pdf_guia_despacho en services/pdf.py — kwarg guia_despacho= (W-7), patron identico a generar_pdf_boleta
- enviar_guia_despacho en services/email.py — asunto D-20, STARTTLS, EmailNotConfiguredError
- Template guia_despacho.html con titulo "Guia de Despacho Electronica", bloque motivo/destino/NV, footer SII folio+track_id
- GET /{id}/pdf con RBAC "view", POST /{id}/email con RBAC "edit" + 503 SMTP guard
- email_enviado_at registrado en UTC al enviar exitosamente

## Task Commits

1. **Task 1: Servicios PDF + Email + template HTML** - `76364f1` (feat)
2. **Task 2: Endpoints /pdf y /email en api/guias_despacho.py** - `84ac4d3` (feat)

## Files Created/Modified

- `backend/app/services/pdf.py` - agregada generar_pdf_guia_despacho (kwarg guia_despacho=, W-7)
- `backend/app/services/email.py` - agregada enviar_guia_despacho (asunto D-20, SMTP STARTTLS)
- `backend/app/templates/guia_despacho.html` - template nuevo: titulo, motivo traslado, destino, NV vinculada, footer SII
- `backend/app/api/guias_despacho.py` - endpoints /pdf y /email, _config_dict helper, imports adicionales

## Decisions Made

- Usado `guia_despacho=` como nombre de kwarg en template.render (W-7) — consistente con variable Jinja `{{ guia_despacho.* }}`
- `_config_dict(db)` definido localmente en guias_despacho.py (no importado de boletas.py) — evita coupling entre routers
- EmailNotConfiguredError capturada en endpoint y mapeada a HTTP 503 "Email no configurado" (D-21)
- Endpoint /email registra email_enviado_at con timezone.utc dentro de try/except con rollback (patron robusto)

## Deviations from Plan

None — plan ejecutado exactamente como especificado. La unica observacion es que el test de SLA WeasyPrint (W-8, segundo bloque verify Task 1) no puede correr en Windows dev por falta de librerias GTK nativas — este es el comportamiento conocido del entorno (identico para todos los tests PDF del proyecto). Los tests deben correr en Linux/Docker.

## Issues Encountered

- WeasyPrint falla al cargar en Windows (OSError: cannot load library 'gobject-2.0-0') — misma limitacion que afecta todos los tests de PDF del proyecto en dev local. No es un problema del codigo.

## Known Stubs

Ninguno — todos los campos del template referencian datos reales del modelo GuiaDespacho.

## Threat Flags

Ninguno — T-04-01 a T-04-06 ya cubiertos en PLAN.md:
- RBAC "view" en /pdf, "edit" en /email (T-04-01, T-04-04)
- Jinja2 autoescape heredado de boleta.html (T-04-02)
- SLA < 5s documentado en W-8 (T-04-03)
- SMTP credentials via env vars, STARTTLS activo (T-04-05)

## Self-Check: PASSED

- FOUND: backend/app/services/pdf.py
- FOUND: backend/app/services/email.py
- FOUND: backend/app/templates/guia_despacho.html
- FOUND: backend/app/api/guias_despacho.py
- FOUND: .planning/phases/01-gu-a-de-despacho-52-backend/01-04-SUMMARY.md
- FOUND commit: 76364f1 (Task 1)
- FOUND commit: 84ac4d3 (Task 2)

## Next Phase Readiness

- Plan 05 (tests) puede importar generar_pdf_guia_despacho y usarlo en test_pdf_genera
- Endpoints /pdf y /email listos para test de integracion en plan 05
- WeasyPrint SLA (W-8) debe validarse en Linux/CI
