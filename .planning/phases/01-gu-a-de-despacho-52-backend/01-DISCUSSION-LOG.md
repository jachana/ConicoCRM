# Phase 1: Guía de Despacho 52 — Backend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 1-Guía de Despacho 52 — Backend
**Mode:** `--auto` — all gray areas auto-resolved using boleta DTE 39/41 analog and recommended defaults. No interactive AskUserQuestion calls per `modes/auto.md`.
**Areas discussed:** Modelo y schema, Numeración correlativa, Integración pipeline DTE, Stock impact, Anulación vía NC, PDF y Email, Permisos, Auditoría, Tests, Router y wiring, Schemas Pydantic, Migraciones Alembic.

---

## Modelo y schema

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror Boleta (header + lineas) | Copy-pattern from `app/models/boleta.py` — proven W1-04 analog | ✓ |
| Standalone shape with embedded lineas JSON | Less SQL surface but breaks audit and reporting patterns | |
| Subclass NotaVenta | Couples guía to NV chain — wrong (guía is satellite) | |

**Auto choice (recommended default):** Mirror Boleta.
**Notes:** Boleta DTE 39/41 (W1-04, HEAD 2481d8e per memoria) is the closest precedent — same Lioren shape, same DteEmision FK pattern, same stock-on-emit invariants applied inversely (boleta DOES discount, guía does NOT).

---

## Numeración correlativa

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `_next_numero(db, key)` from `app/api/dte.py` | Already concurrent-safe with `SELECT FOR UPDATE` | ✓ |
| New helper specific to guías | Code duplication, no benefit | |
| Postgres sequence | Bypasses SystemConfig pattern, breaks consistency | |

**Auto choice:** Reuse `_next_numero` with key `guia_despacho_last_id`.
**Notes:** CONCERNS.md flags concurrency tests as Postgres-only. Same skip pattern applies.

---

## Integración pipeline DTE existente

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `DteEmision` with `guia_despacho_id` FK + update check constraint | Reuses Celery emit/poll/webhook infrastructure | ✓ |
| New `GuiaEmision` parallel model | Doubles tracking surface, breaks polimorfismo | |
| Inline DTE state on `GuiaDespacho` table | Loses webhook idempotency and retry tracking | |

**Auto choice:** Extend DteEmision.
**Notes:** Migration must drop and recreate `ck_dte_emision_one_document` to include 5 FKs (factura, NC, ND, boleta, guía).

---

## Stock impact

| Option | Description | Selected |
|--------|-------------|----------|
| Guía NO descuenta stock; documentado en código + docs | Cumple INV-04, invariante con W1-08 | ✓ |
| Guía descuenta stock al emitir | Contradice REQUIREMENTS INV-04 | |
| Stock condicional según motivo_traslado | Complejo, no requerido por SII chileno | |

**Auto choice:** No stock impact.
**Notes:** Stock movement only on tributary document (factura/boleta). Comment inline + entry in `docs/architecture.md`.

---

## Anulación vía Nota de Crédito

| Option | Description | Selected |
|--------|-------------|----------|
| Extend NC with nullable `guia_despacho_id` FK; mark guía anulada on NC aceptada | Backend primitive; UI sugar in Phase 2 | ✓ |
| Dedicated `POST /guias-despacho/{id}/anular` endpoint | Hides NC mechanics — but SII requires NC anyway | |
| Soft-delete on guía table | NOT legally valid in Chile — NC is mandatory | |

**Auto choice:** Extend NC.
**Notes:** Mutual exclusion validator: NC carries either `factura_id`, `boleta_id` (already), or new `guia_despacho_id` — exactly one.

---

## PDF y Email

| Option | Description | Selected |
|--------|-------------|----------|
| Copy boleta template + WeasyPrint + SMTP sync | Stack-coherent | ✓ |
| Async email via Celery | Out of scope; SMTP is sync everywhere else | |
| Skip PDF in v1 | Violates DTE-03 | |

**Auto choice:** Copy boleta pattern.

---

## Permisos

| Option | Description | Selected |
|--------|-------------|----------|
| New `guias_despacho` module in MODULES with defaults per DTE-06 | Coherent with existing RBAC | ✓ |
| Reuse `boletas` permissions | Conflates two distinct DTE flows | |
| Admin-only | Violates DTE-06 (vendedor needs view/create/edit) | |

**Auto choice:** New module.
**Notes:** Defaults: admin=full, subadmin=full, vendedor=view/create/edit (no delete).

---

## Auditoría

| Option | Description | Selected |
|--------|-------------|----------|
| Add `GuiaDespacho`, `GuiaDespachoLinea` to `_AUDITABLE_MODEL_NAMES` | Zero-code via existing listener | ✓ |
| Custom audit hooks per endpoint | Duplicates existing infrastructure | |

**Auto choice:** Whitelist add.

---

## Tests

| Option | Description | Selected |
|--------|-------------|----------|
| Pytest suite mirroring `test_boletas.py` shape, 8 happy-path + edge cases + 1 Postgres-only concurrencia (smoke) | Coverage proporcional al riesgo | ✓ |
| Minimal smoke test only | Bajo cobertura para DTE crítico | |
| Full E2E con sandbox Lioren | Out of scope (Phase 4 OPS-03 cubre smoke post-deploy) | |

**Auto choice:** Mirror boleta tests.
**Notes:** Concurrencia test marked `@pytest.mark.smoke` — planner decides if executed in M1 or deferred.

---

## Router y wiring

| Option | Description | Selected |
|--------|-------------|----------|
| New `app/api/guias_despacho.py` for CRUD + emisión endpoint en `app/api/dte.py` | Coherent: emisión vive con otros DTE | ✓ |
| Todo en `guias_despacho.py` incluyendo emisión | Rompe convención `dte.py` polimórfica | |
| Todo en `dte.py` | Mezcla CRUD con emisión, viola separación | |

**Auto choice:** Two-file split.

---

## Schemas Pydantic

| Option | Description | Selected |
|--------|-------------|----------|
| New `app/schemas/guia_despacho.py` with Create/Update/Out/ListOut + validators | Por convención uno-por-entidad | ✓ |
| Reusar schemas/boleta.py | Acoplamiento incorrecto | |

**Auto choice:** New file.

---

## Migraciones Alembic

| Option | Description | Selected |
|--------|-------------|----------|
| Una migración monolítica (5 ops: 2 tablas + 2 add_column + 1 check_constraint refresh + system_config seed) | Atómica, rollback completo | ✓ |
| Múltiples migraciones (una por cambio) | Complica rollback parcial | |

**Auto choice:** Monolítica.

---

## Claude's Discretion

- Naming exact de fields en payload Lioren v1 — researcher debe validar contra docs Lioren oficiales (potential adjustment in `build_guia_payload`).
- Email subject/body wording — copy de boleta y adaptar.
- Decisión final sobre incluir o no test concurrencia Postgres-only en M1 — planner decide según presupuesto de tiempo (deadline 2026-04-30).

## Deferred Ideas

- Endpoint `POST /guias-despacho/{id}/anular` dedicado — primitivos NC + create suficientes; agregar sugar si UX demanda.
- Bulk emisión.
- Folio CAF management directo (Lioren maneja).
- Reapertura de guía anulada (SII no permite).
