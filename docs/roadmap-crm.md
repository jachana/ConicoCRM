# Roadmap CRM — Conico

Objetivo: CRM completo y fácil de usar. Priorización por impacto × esfuerzo.

---

## Tier S — Alto impacto, bajo esfuerzo

1. **Fase 4a — Campos cliente/empresa**
   Nuevos campos en Cliente: `recibe_correo`, `forma_pago`, `despacho_o_retiro`, `comuna`, `direccion_despacho`, `ultimo_contacto`, `forma_captacion`, `compromiso`, `es_nuevo`.
   Migración cotizaciones: agregar `empresa_id` nullable.
   Base CRM; sin esto no hay ficha cliente.

2. **Reportes por marca + filtros**
   Agregaciones por marca en ventas/inventario/márgenes.
   Filtros cliente + marca en UI `/reportes`.
   Pedido explícito cliente (2026-04-22).

3. **Sedes despacho — integración UI**
   Modelo existe. Falta: CRUD admin bajo Empresa, selector en Cotización/NV/Factura, migración `direccion` legacy.

---

## Tier A — Alto impacto, medio esfuerzo

4. **Timeline por cliente/empresa**
   Feed unificado en ficha Cliente/Empresa: cotizaciones, NV, facturas, pagos, notas manuales, llamadas registradas.
   Ordenado cronológicamente; filtro por tipo.
   Depende de #1 (Fase 4a).

5. **Tareas y recordatorios**
   Modelo `Tarea`: asignado_a, due_date, cotizacion_id/cliente_id opcional, estado (pendiente/hecha).
   Sidebar widget "Mis pendientes".
   Auto-crea tareas: cotización próxima a vencer, factura vencida, crédito por aprobar.

6. **Pipeline comercial / Oportunidades**
   Modelo `Oportunidad`: estados prospecto → contactado → propuesta → ganado/perdido.
   Kanban board. Genera cotización desde oportunidad.
   **Bloqueante:** ¿estados fijos o configurables por admin?

7. **Búsqueda global Cmd+K**
   Input modal, busca: productos (SKU/nombre/tag), clientes (RUT/nombre), NV, facturas, cotizaciones.
   Atajo Cmd+K / Ctrl+K.

8. **Notificaciones**
   Campana in-app + email resumen diario.
   Eventos: cotización por vencer, factura vencida, aprobación pendiente, NV lista para despacho.

---

## Tier B — Alto impacto, alto esfuerzo

9. **Mobile / PWA**
   Vendedor crea cotizaciones desde teléfono. Layouts responsive para módulos core.

10. **Auditoría / Activity log**
    `AuditLog`: user_id, action, entity_type, entity_id, diff_json, timestamp.
    Vista admin filtrable. Crítico multi-usuario.

11. **Comisiones vendedor**
    Cálculo automático desde facturas pagadas. Config % por vendedor o por rango.
    Reporte mensual exportable.

---

## Tier C — Pulido UX

- Bulk actions en tablas (editar estado, eliminar masivo)
- Import masivo empresas/clientes (xlsx)
- Plantillas de email configurables
- Atajos de teclado globales
- Tours onboarding primera sesión
- Empty states con CTAs
- Help tooltips contextuales

---

## Plan de ejecución

### Sprint 1 (paralelo) — Tier S
3 frentes independientes sin dependencias entre sí:
- A: Fase 4a campos cliente/empresa
- B: Reportes por marca
- C: Sedes despacho integración UI

### Sprint 2 — Tier A parcial
Depende de Sprint 1:
- Timeline cliente (requiere #1)
- Tareas y recordatorios
- Notificaciones (después de Tareas)

### Sprint 3 (paralelo) — Tier A restante
- Pipeline/Oportunidades
- Búsqueda global Cmd+K
- Auditoría log (inicio Tier B)

### Sprint 4 — Tier B
- Mobile/PWA
- Comisiones vendedor

### Backlog — Tier C
Pulir según feedback uso real.

---

## Dudas bloqueantes

- **Marca**: ¿entidad con CRUD o string libre en producto? → afecta #2
- **Pipeline**: ¿estados fijos hardcoded o configurables por admin? → afecta #6
- **Stock NV**: ¿descuenta al crear NV o al despachar? → pendiente desde 2026-04-22
- **Tareas**: ¿auto-generación de recordatorios on/off por usuario? → afecta #5
