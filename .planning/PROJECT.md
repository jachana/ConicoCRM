# Conico PMS

## What This Is

Sistema integral de gestión chileno (PMS) para PyMEs — cotizaciones, notas de venta, facturas, boletas, notas de crédito/débito, productos, inventario, clientes/empresas, órdenes de compra, RRHH, dashboard configurable, reportes, tareas, cobranza, integración DTE/SII vía Lioren. Hoy single-tenant para Conico (primer cliente y beta paga); diseñado para evolucionar a SaaS multi-tenant para PyMEs chilenas similares.

## Core Value

**Una PyME chilena puede operar todo su ciclo comercial (cotizar → vender → facturar/boletear con DTE válido en SII → cobrar → controlar stock) desde un solo sistema, sin contador de Excel ni planillas paralelas.**

Si todo lo demás falla pero esto funciona end-to-end con DTE aprobado por SII, el producto cumple su promesa.

## Requirements

### Validated

<!-- Inferred from existing brownfield code (see .planning/codebase/) -->

- ✓ Auth JWT (access + refresh) con roles admin/subadmin/vendedor y permisos por toggle — existing
- ✓ CRUD productos (con marca, IVA configurable, costo por lista de precios, documentos PDF, lotes) — existing
- ✓ CRUD clientes y empresas con sedes de despacho — existing
- ✓ CRUD proveedores — existing
- ✓ Cotizaciones con numeración correlativa, PDF WeasyPrint, email SMTP, Excel — existing
- ✓ Notas de Venta con chain locking desde cotización, expiración bloqueante — existing
- ✓ Facturas (DTE 33) con pagos múltiples, banco receptor, estados emitida→parcial→pagada — existing
- ✓ Boletas (DTE 39/41) con receptor anónimo y descuento de stock al emitir — existing
- ✓ Notas de Crédito (61) y Débito (56) — existing
- ✓ Órdenes de Compra con recepción, movimientos de inventario, PDF y email — existing
- ✓ Inventario: stock, movimientos, alertas stock bajo, ajustes manuales — existing
- ✓ RRHH (admin only): empleados, documentos, vacaciones — existing
- ✓ Dashboard configurable con 8 widgets, layouts por rol, drag-and-drop — existing
- ✓ Reportes (ventas, por marca con multi-cliente, exports Excel/CSV) — existing
- ✓ Tareas y recordatorios (modelo + 6 reglas auto-generadoras + UI) — existing
- ✓ Búsqueda global Cmd+K (8 entidades, permission-aware) — existing
- ✓ Cobranza con bandejas vencidas/próximas/antigüedad — existing
- ✓ Control de crédito por empresa con flujo de aprobación asíncrono — existing
- ✓ Solicitud de ajuste de márgenes con "latest wins" — existing
- ✓ DTE/SII vía Lioren: 33/61/56 con webhook HMAC, polling Celery — existing
- ✓ Hardening parcial: W1-01 audit log, W1-02 backups Postgres + offsite S3/B2, W1-04 boleta DTE 39/41, W1-06 observabilidad (Sentry + loguru + healthz/readyz) — existing

### Active

<!-- Milestone 1: Hardening para go-live de Conico (beta paga). Deadline ~2026-04-30. -->

- [ ] **W1-05** Guía de Despacho Electrónica DTE 52 (modelo standalone, numeración propia, PDF, email, integración Lioren, anulación vía NC, frontend list/nueva/detalle)
- [ ] **W1-08** Refactor stock-on-NV → stock descuenta al emitir factura/boleta (ya parcialmente: boleta sí, factura sí; falta consolidar y eliminar movimientos al crear NV si quedan)
- [ ] Conico go-live en producción (deploy infra + DNS + SSL + smoke tests post-deploy)

### Out of Scope

<!-- Para Milestone 1 (hardening). Reagendado a milestones futuros, NO descartado. -->

- CI pipeline (lint + tests + build Docker) — Milestone 2 (post-beta hardening)
- 2FA TOTP + reset password — Milestone 2
- Factura exenta DTE 34 — Milestone 3 (DTE coverage)
- Factura de compra DTE 46 — Milestone 3
- Libros SII (compra/venta) — Milestone 3
- Intercambio DTE recepción (XML entrante de proveedores) — Milestone 3
- Timeline unificado por cliente/empresa — Milestone 4 (CRM Tier A finish)
- Pipeline / Oportunidades — Milestone 4
- Notificaciones in-app + email digest — Milestone 4
- Multi-tenant SaaS (separación de datos, billing, onboarding self-service) — Milestone 5+
- App móvil nativa — fuera v1 (PWA en SaaS milestone si aplica)
- POS / códigos de barras — fuera v1
- Conciliación bancaria, multi-moneda/UF — fuera v1

## Context

**Estado del código:** brownfield maduro. Mapeo completo en `.planning/codebase/` (ARCHITECTURE.md, STACK.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, INTEGRATIONS.md, CONCERNS.md). Ver `PROGRESS.md` para fases ya cerradas.

**Stack:** Python 3.11 + FastAPI + SQLAlchemy + Alembic + Celery + Postgres + Redis (backend); React 18 + TypeScript + Vite + Tailwind + React Query (frontend). PDFs vía WeasyPrint, DTE vía Lioren API + webhook HMAC, observabilidad Sentry + loguru.

**Cliente actual:** Conico — empresa chilena (rubro determinado en el código por features: cotizaciones B2B con márgenes, OC, inventario por marca). Es el primer beta paga; segunda tienda confirmada para H2 2026 (mismo tenant, no multi-tenant todavía).

**Visión a 12 meses:** convertir Conico PMS en SaaS para PyMEs chilenas. Posicionamiento, pricing y GTM ya esbozados en `docs/saas-*` (ICP, tiers BYOL, frase ancla "Tu contador sigue con el suyo", competencia real Bsale/Manager/Nubox).

**Tech debt conocido (de CONCERNS.md):** stock se descuenta al emitir factura/boleta (no al crear NV) — refactor pendiente W1-08; race conditions en numeración resueltas con `SELECT FOR UPDATE` por entidad pero no auditadas en boletas concurrentes (test skipped Postgres-only).

## Constraints

- **Timeline**: Milestone 1 (W1-05 + W1-08 + go-live) cierra **2026-04-30** — 5 días desde inicio. Conico ya confirmó como beta paga.
- **Tech stack**: Lock-in con stack actual (FastAPI/React/Postgres/Lioren). Cambios de stack requieren milestone dedicado.
- **DTE/SII**: Cualquier feature que toque tributario debe pasar Lioren → SII. No hay flujo offline; si Lioren cae, emisión queda en cola Celery.
- **Multi-tenant**: NO ahora. Todo el código asume single-tenant; refactor a multi-tenant es Milestone 5+.
- **Compliance**: Chile — IVA 19%, RUT, formato DTE SII, retención de documentos electrónicos. Boletas anónimas usan RUT genérico `66666666-6`.
- **Beta loyalty**: Conico debe poder operar sin downtime durante la rampa. Backups diarios + offsite ya configurados (W1-02).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Continuar single-tenant para Milestone 1; SaaS multi-tenant es milestone separado | Reducir scope para alcanzar beta este mes; pivot a SaaS necesita dataset Conico real para diseñar bien | — Pending |
| Conico = primer cliente beta paga (no piloto gratis) | Compromiso económico valida producto; segunda tienda H2 2026 reafirma | — Pending |
| W1-05 (guía 52) antes que cualquier otro DTE pendiente (34/46/libros) | Conico necesita guía de despacho operacional; otros DTE son nice-to-have post-beta | — Pending |
| W1-08 stock-on-NV descartado en favor de stock-on-emit | Auditoría real de stock requiere documento tributario emitido, no NV (NV puede cancelarse) | ✓ Good (memoria proyecto, decisión vigente) |
| Lioren como proveedor SII único | Migración a otro provider (e.g. SimpleAPI) sería milestone dedicado; abstracción `DteService` permite cambio futuro | — Pending |
| Skip CI/2FA/factura exenta para Milestone 1 | Conico go-live es bloqueante; resto puede esperar | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-25 after initialization (brownfield, post-codebase-map)*
