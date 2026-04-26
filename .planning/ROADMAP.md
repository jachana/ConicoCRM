# Conico PMS — Roadmap (Milestone 1: Beta Hardening)

**Milestone deadline:** 2026-04-30
**Granularity:** coarse (4 phases, 1-3 plans each)
**Coverage:** 15/15 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: Guía de Despacho 52 — Backend** — Modelo, API, pipeline DTE Lioren, anulación vía NC, permisos y auditoría
- [ ] **Phase 2: Guía de Despacho 52 — Frontend** — UI lista/nueva/detalle con polling DTE
- [ ] **Phase 3: Stock-on-Emit Refactor** — Consolidar descuento de stock en emisión tributaria, limpiar movimientos huérfanos
- [ ] **Phase 4: Go-Live Conico** — Deploy producción, smoke tests, backups verificados, runbook rollback

---

## Phase Details

### Phase 1: Guía de Despacho 52 — Backend
**Goal**: El sistema puede emitir, consultar y anular guías de despacho electrónicas DTE 52 vía API, con integración Lioren completa, auditoría y permisos por rol.
**Depends on**: Nothing (puede ejecutarse en paralelo con Phase 3)
**Requirements**: DTE-01, DTE-02, DTE-03, DTE-04, DTE-06, DTE-07
**Success Criteria** (what must be TRUE):
  1. Un usuario con permiso `guias_despacho:create` puede crear una guía 52 vía `POST /api/guias-despacho` con líneas, motivo de traslado SII (1-9) y vínculo opcional a NV — el correlativo se asigna sin colisión bajo concurrencia.
  2. La guía emitida llega a Lioren y su estado (`procesando` → `aceptado|rechazado`) se refleja en la BD vía polling Celery + webhook HMAC, observable por `GET /api/guias-despacho/{id}`.
  3. El endpoint genera PDF (WeasyPrint) descargable y envía email SMTP al receptor cuando se solicita.
  4. Se puede anular una guía generando una NC tipo 61 vinculada (`guia_despacho_id` nullable en NC); la guía queda marcada como anulada.
  5. Toda mutación sobre `GuiaDespacho` y `GuiaDespachoLinea` queda registrada en `audit_log` con diff before/after.
**Plans**: TBD

### Phase 2: Guía de Despacho 52 — Frontend
**Goal**: El usuario puede gestionar guías de despacho 52 desde la UI con flujo lista → crear → detalle con polling de estado DTE.
**Depends on**: Phase 1
**Requirements**: DTE-05
**Success Criteria** (what must be TRUE):
  1. El usuario navega a `/guias-despacho` y ve la lista paginable con filtros (estado DTE, fecha, receptor) usando los componentes canónicos del PMS.
  2. El usuario puede crear una guía en `/guias-despacho/nueva` reutilizando el autocomplete de productos y `ClienteSelectModal` (no entrada raw como BoletaNueva), con motivo de traslado SII seleccionable.
  3. En `/guias-despacho/:id` el usuario observa el estado DTE actualizándose en vivo (polling TanStack Query) sin refresh manual; ve líneas, totales, PDF descargable y acciones de email/anular según permisos.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Stock-on-Emit Refactor
**Goal**: El descuento de stock ocurre exclusivamente en emisión tributaria (factura/boleta). Las NV no producen movimientos de inventario, y los movimientos huérfanos históricos quedan limpios sin alterar el stock auditado actual.
**Depends on**: Nothing (puede ejecutarse en paralelo con Phase 1)
**Requirements**: INV-01, INV-02, INV-03, INV-04
**Success Criteria** (what must be TRUE):
  1. Crear una NV (desde cero o desde cotización) NO genera registros en `MovimientoInventario` ni cambia `Producto.stock_actual` — verificado por test de regresión.
  2. Emitir una factura desde NV descuenta stock; emitir una boleta directa descuenta stock; cancelar/anular una factura emitida reversa el stock — verificado por tests.
  3. Una migración Alembic limpia los movimientos huérfanos vinculados a NVs históricas si existen, garantizando que el stock actual auditado de cada producto no cambia (verificación pre/post migración).
  4. Emitir una guía de despacho 52 NO descuenta stock por sí misma (la responsabilidad la tiene el documento tributario asociado), con la decisión documentada en código (comentario en el endpoint) y en `docs/`.
**Plans**: TBD

### Phase 4: Go-Live Conico
**Goal**: Conico opera en producción con SSL, healthchecks verdes, Sentry recibiendo eventos, backups offsite verificados y un runbook de rollback probado.
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04
**Success Criteria** (what must be TRUE):
  1. El dominio de Conico responde sobre HTTPS con certificado válido; `/healthz` y `/readyz` retornan 200; Sentry (backend + frontend) muestra eventos del entorno `prod`.
  2. El backup diario de Postgres ejecuta y se sube a S3/B2; un `scripts/restore.sh --dry-run` post-deploy confirma que el backup más reciente es restaurable.
  3. Smoke tests post-deploy completan exitosamente el flujo: login → crear cotización → crear NV → emitir factura DTE 33 (sandbox) → emitir boleta DTE 39 → emitir guía 52 → anular vía NC.
  4. Existe un runbook documentado y ejecutado al menos una vez en staging que cubre rollback (revertir a tag previo, restore DB desde backup más reciente) en menos de 30 min.
**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Guía de Despacho 52 — Backend | 0/? | Not started | - |
| 2. Guía de Despacho 52 — Frontend | 0/? | Not started | - |
| 3. Stock-on-Emit Refactor | 0/? | Not started | - |
| 4. Go-Live Conico | 0/? | Not started | - |

---

## Dependency Graph

```
Phase 1 (W1-05 backend) ──┐
                           ├──> Phase 4 (Go-Live)
Phase 2 (W1-05 frontend) ──┤
       ▲                   │
       └── depends on ─ Phase 1
                           │
Phase 3 (W1-08 stock) ─────┘
```

Phases 1 and 3 can run in parallel (different code areas: boleta-pattern model vs stock movement logic).
Phase 2 depends on Phase 1 backend contracts.
Phase 4 requires all functional work merged.

---

## Coverage

| Category | Requirements | Phase |
|----------|--------------|-------|
| DTE / SII | DTE-01, DTE-02, DTE-03, DTE-04, DTE-06, DTE-07 | Phase 1 |
| DTE / SII (UI) | DTE-05 | Phase 2 |
| Inventario | INV-01, INV-02, INV-03, INV-04 | Phase 3 |
| Operations | OPS-01, OPS-02, OPS-03, OPS-04 | Phase 4 |

**Mapped:** 15/15 v1 requirements
**Orphans:** 0

---

*Last updated: 2026-04-25 (initialization)*
