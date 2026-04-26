# Conico PMS — Requirements

Living document. v1 = Milestone 1 (Hardening for Conico beta go-live, deadline 2026-04-30). Subsequent milestones tracked under "Deferred to Future Milestones".

---

## v1 Requirements (Milestone 1: Hardening for Beta)

### DTE / SII

- [ ] **DTE-01**: Sistema emite Guía de Despacho Electrónica (DTE 52) con numeración correlativa propia, vínculo opcional a NV, líneas con detalle de productos y cantidades, motivo de traslado SII (1=operación constituye venta, 2=ventas por entregar, 3=consignaciones, 4=entrega gratuita, 5=traslado interno, 6=otros traslados no venta, 7=guía de devolución, 8=traslado para exportación, 9=venta para exportación)
- [ ] **DTE-02**: Guía de Despacho 52 se envía a SII vía Lioren con webhook HMAC + polling Celery; estados aceptado/rechazado/procesando reflejados en UI
- [ ] **DTE-03**: Guía de Despacho genera PDF (WeasyPrint) y email SMTP al receptor
- [ ] **DTE-04**: Guía de Despacho se puede anular generando Nota de Crédito tipo 61 vinculada (`guia_despacho_id` nullable en NC)
- [ ] **DTE-05**: Frontend `/guias-despacho` (lista con filtros), `/guias-despacho/nueva` (form), `/guias-despacho/:id` (detalle con polling estado DTE)
- [ ] **DTE-06**: Permisos `guias_despacho:view/create/edit/delete` con defaults por rol (admin/subadmin full; vendedor view/create/edit)
- [ ] **DTE-07**: Auditoría: `GuiaDespacho` + `GuiaDespachoLinea` agregados al whitelist de audit_log con before/after diff

### Inventario

- [ ] **INV-01**: Refactor consolida descuento de stock únicamente en momento de emisión tributaria (factura/boleta); NV no genera `MovimientoInventario` de salida bajo ninguna ruta
- [ ] **INV-02**: Migración limpia movimientos de inventario huérfanos vinculados a NVs históricas (si existen) sin afectar stock actual auditado
- [ ] **INV-03**: Tests de regresión confirman: crear NV → stock NO cambia; emitir factura desde NV → stock descuenta; emitir boleta directa → stock descuenta; cancelar factura → stock se reversa
- [ ] **INV-04**: Guía de Despacho 52 NO descuenta stock por sí misma (el documento tributario que la antecede o sucede ya lo hizo); decisión auditada en código y docs

### Operations / Go-Live

- [ ] **OPS-01**: Deploy de producción para Conico — server provisioned, DNS configurado, SSL/TLS válido, healthz/readyz responden 200, Sentry recibiendo eventos
- [ ] **OPS-02**: Backup diario Postgres + offsite S3/B2 verificado funcionando (ejecutar `scripts/restore.sh --dry-run` post-deploy)
- [ ] **OPS-03**: Smoke tests post-deploy ejecutados — login, crear cotización, crear NV, emitir factura DTE 33 (sandbox), emitir boleta DTE 39, emitir guía 52, anular vía NC
- [ ] **OPS-04**: Runbook de rollback documentado y probado (revertir a tag previo, restore DB desde backup más reciente)

---

## Deferred to Future Milestones

### Milestone 2 — Hardening continuado (post-beta)
- CI pipeline (GitHub Actions): lint backend (ruff), lint frontend (eslint), tests pytest + vitest, build Docker, push registry
- 2FA TOTP + reset password (email link, expiración 1h)

### Milestone 3 — DTE/SII coverage completa
- Factura exenta DTE 34
- Factura de compra DTE 46
- Libros SII (compra y venta, formato XML)
- Intercambio DTE recepción (XML entrante de proveedores → reconciliación con OC)

### Milestone 4 — CRM Tier A finish
- Timeline unificado por cliente/empresa (cotis + NV + facturas + notas + tareas + llamadas)
- Pipeline / Oportunidades (etapas configurables)
- Notificaciones in-app + email digest

### Milestone 5+ — SaaS multi-tenant
- Separación de datos por tenant (schema-per-tenant o row-level)
- Onboarding self-service
- Billing (Transbank / Stripe)
- BYOL (bring your own Lioren credentials) per tier
- Marketing site, pricing page, docs públicos

---

## Out of Scope (v1 entire product, not just Milestone 1)

- App móvil nativa — PWA contemplada en SaaS milestone
- POS / códigos de barras — fuera roadmap
- Conciliación bancaria — fuera roadmap (integración Banco Estado/BCI requiere otro engagement)
- Multi-moneda / UF — fuera roadmap
- Notificaciones push tiempo real — fuera roadmap

---

## Traceability

| REQ-ID | Phase | Plan |
|--------|-------|------|
| DTE-01 | Phase 1 | TBD |
| DTE-02 | Phase 1 | TBD |
| DTE-03 | Phase 1 | TBD |
| DTE-04 | Phase 1 | TBD |
| DTE-05 | Phase 2 | TBD |
| DTE-06 | Phase 1 | TBD |
| DTE-07 | Phase 1 | TBD |
| INV-01 | Phase 3 | TBD |
| INV-02 | Phase 3 | TBD |
| INV-03 | Phase 3 | TBD |
| INV-04 | Phase 3 | TBD |
| OPS-01 | Phase 4 | TBD |
| OPS-02 | Phase 4 | TBD |
| OPS-03 | Phase 4 | TBD |
| OPS-04 | Phase 4 | TBD |

**Coverage:** 15/15 requirements mapped. No orphans.

---

*Last updated: 2026-04-25 (roadmap created)*
