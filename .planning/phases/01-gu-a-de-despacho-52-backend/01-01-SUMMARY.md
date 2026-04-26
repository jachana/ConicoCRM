---
phase: 01-gu-a-de-despacho-52-backend
plan: "01"
subsystem: backend
tags: [models, schemas, migrations, dte52, guia-despacho]
dependency_graph:
  requires: []
  provides:
    - GuiaDespacho ORM model + GuiaDespachoLinea
    - GuiaDespachoCreate/Update/Out/ListOut Pydantic schemas
    - DteEmision.guia_despacho_id FK + check constraint con 5 FKs
    - NotaCredito.guia_despacho_id FK SET NULL
    - NotaCreditoCreate._xor_anulacion model_validator (D-15)
    - Migración Alembic c1d2e3f4a5b6 (tablas + FKs + seed)
  affects:
    - Plans 02/03/04/05 (consumen estos contratos de datos)
tech_stack:
  added: []
  patterns:
    - SQLAlchemy 2.0 ORM declarativo (mapped_column)
    - Pydantic v2 Literal validator + field_validator + model_validator
    - Alembic dual-dialect SQLite/Postgres migration
key_files:
  created:
    - backend/app/models/guia_despacho.py
    - backend/app/schemas/guia_despacho.py
    - backend/migrations/versions/c1d2e3f4a5b6_add_guias_despacho.py
  modified:
    - backend/app/models/dte_emision.py
    - backend/app/models/nota_credito.py
    - backend/app/schemas/dte.py
    - backend/tests/conftest.py
    - backend/migrations/versions/a060211ee1c6_add_dte_emision_check_constraint.py
decisions:
  - "Revision ID c1d2e3f4a5b6 (no a1b2c3d4e5f6 que ya existe para facturas)"
  - "Migración dual SQLite/Postgres: SQLite solo batch_alter, Postgres FK+constraint completo"
  - "pre-existing migration a060211ee1c6 fixed: pg_constraint query sin dialect check"
metrics:
  duration: "~45min"
  completed: "2026-04-26"
  tasks_completed: 4
  tasks_total: 4
  files_created: 3
  files_modified: 5
---

# Phase 01 Plan 01: Modelos, Schemas y Migración Guía de Despacho DTE 52 — Summary

**One-liner:** Modelo SQLAlchemy GuiaDespacho+GuiaDespachoLinea, schemas Pydantic con Literal[1..9] y XOR validator, extensión DteEmision (5 FKs) + NotaCredito, y migración Alembic monolítica c1d2e3f4a5b6.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Crear modelo GuiaDespacho + GuiaDespachoLinea | e3fdecc | guia_despacho.py, conftest.py |
| 2 | Extender DteEmision y NotaCredito con guia_despacho_id | 7e43b36 | dte_emision.py, nota_credito.py |
| 3 | Schemas Pydantic GuiaDespacho* + extender NotaCreditoCreate | d9d5fae | schemas/guia_despacho.py, schemas/dte.py |
| 4 | Migración Alembic monolítica add_guias_despacho | ab729c1 | c1d2e3f4a5b6_add_guias_despacho.py |

## Success Criteria Verification

- [x] GuiaDespacho.__tablename__ == "guias_despacho" (verified)
- [x] GuiaDespachoLinea.__tablename__ == "guia_despacho_lineas" (verified)
- [x] DteEmision tiene columna guia_despacho_id y check constraint con 5 FKs (verified)
- [x] NotaCredito tiene columna guia_despacho_id (FK SET NULL) (verified)
- [x] GuiaDespachoCreate rechaza motivo=10 con ValidationError (verified)
- [x] GuiaDespachoCreate rechaza lineas=[] con ValidationError (verified)
- [x] NotaCreditoCreate acepta guia_despacho_id opcional (verified)
- [x] NotaCreditoCreate define _xor_anulacion @model_validator(mode="after") D-15 (verified)
- [x] conftest.py importa app.models.guia_despacho (verified)
- [x] Migración c1d2e3f4a5b6 aplica correctamente en SQLite desde b7c8d9e0f1g2 (verified)
- [x] system_config seed guia_despacho_last_id=0 sembrado por migración (verified)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Revision ID a1b2c3d4e5f6 ya existe (facturas migration)**
- **Found during:** Task 4
- **Issue:** El plan especificaba usar revision ID `a1b2c3d4e5f6` para la migración de guías, pero esa ID ya está en uso por `a1b2c3d4e5f6_add_facturas.py`, causando un "Cycle is detected" en Alembic.
- **Fix:** Se usó revision ID `c1d2e3f4a5b6` y archivo `c1d2e3f4a5b6_add_guias_despacho.py` en su lugar.
- **Files modified:** Nuevo archivo con nombre diferente.
- **Commit:** ab729c1

**2. [Rule 3 - Bug] Migration a060211ee1c6 queries pg_constraint sin dialect check**
- **Found during:** Task 4 (bloqueaba alembic upgrade head en SQLite)
- **Issue:** `a060211ee1c6_add_dte_emision_check_constraint.py` ejecuta `SELECT 1 FROM pg_constraint` sin verificar el dialecto, causando `OperationalError: no such table: pg_constraint` en SQLite.
- **Fix:** Agrega `if conn.dialect.name == "postgresql":` guard alrededor de la query y la creación del constraint. SQLite ahora es no-op (check constraints no se enforzan de todos modos).
- **Files modified:** backend/migrations/versions/a060211ee1c6_add_dte_emision_check_constraint.py
- **Commit:** ab729c1

### Out of Scope (Deferred)

Las demás migraciones anteriores (`e43dce1d2bd5` y otras) tienen `ALTER COLUMN` sin dialect check, lo que impide `alembic upgrade head` desde cero en SQLite. Este es un problema pre-existente sistemático fuera del scope de este plan. Los tests del proyecto usan `Base.metadata.create_all()` (no alembic), por lo que la suite de tests no se ve afectada. Documentado en `deferred-items.md` para seguimiento.

## Known Stubs

Ninguno — este plan entrega modelos, schemas y migración sin stubbing. Los Plans 02/03/04/05 construyen sobre estos artefactos.

## Threat Surface Scan

Las mitigaciones del threat model de este plan están implementadas:
- T-01-01: `Literal[1,2,3,4,5,6,7,8,9]` para motivo_traslado — implementado
- T-01-02: `lineas_no_vacias` field_validator — implementado
- T-01-03: `ck_dte_emision_one_document` con 5 FKs — implementado en modelo + migración
- T-01-04: `_xor_anulacion` @model_validator — implementado (D-15)
- T-01-05: String(500) cap en descripcion linea — implementado
- T-01-06: created_at/updated_at en modelo — implementado

Ninguna superficie de seguridad nueva no contemplada en el threat model.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| backend/app/models/guia_despacho.py | FOUND |
| backend/app/schemas/guia_despacho.py | FOUND |
| backend/migrations/versions/c1d2e3f4a5b6_add_guias_despacho.py | FOUND |
| .planning/phases/01-gu-a-de-despacho-52-backend/01-01-SUMMARY.md | FOUND |
| Commit e3fdecc (Task 1) | FOUND |
| Commit 7e43b36 (Task 2) | FOUND |
| Commit d9d5fae (Task 3) | FOUND |
| Commit ab729c1 (Task 4) | FOUND |
