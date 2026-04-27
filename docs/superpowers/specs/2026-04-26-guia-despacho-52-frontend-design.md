# Phase 2 — Guía de Despacho 52 (Frontend) — Design

**Date:** 2026-04-26
**Milestone:** M1 — Beta Hardening (deadline 2026-04-30)
**Depends on:** Phase 1 (Guía de Despacho 52 Backend) — done, 4/5 SC verified
**Roadmap reference:** `.planning/ROADMAP.md` §"Phase 2: Guía de Despacho 52 — Frontend"
**Requirement:** DTE-05 (UI list/nueva/detalle con polling DTE)

---

## Goal

El usuario puede gestionar guías de despacho 52 desde la UI con flujo `lista → crear → detalle` con polling de estado DTE, reutilizando los componentes canónicos del PMS (`ClienteSelectModal`, `ProductoAutocomplete`, `EmailModal`, `DteEstadoBadge`). Corrige el patrón de `BoletaNueva` que usaba entrada raw — guía exige receptor identificado vía modal.

---

## Success Criteria

Heredados de ROADMAP §Phase 2:

1. El usuario navega a `/guias-despacho` y ve lista paginable con filtros (estado DTE, fecha, receptor) usando componentes canónicos del PMS.
2. El usuario puede crear una guía en `/guias-despacho/nueva` reutilizando autocomplete de productos y `ClienteSelectModal` (no entrada raw como BoletaNueva), con motivo de traslado SII seleccionable.
3. En `/guias-despacho/:id` el usuario observa estado DTE actualizándose en vivo (polling TanStack Query) sin refresh manual; ve líneas, totales, PDF descargable y acciones de email/anular según permisos.

Adicionales (este spec):

4. Crear guía desde NV existente: selector NV opcional en form pobla cliente, líneas, dirección y comuna desde la NV; toda autopoblación queda editable.
5. Anulación: botón "Anular" (solo si `dte_estado=='aceptada'` y guía no anulada) redirige a `/notas-credito/nueva?guia_despacho_id={id}` con form NC precargado.
6. Cobertura tests: render + interacción en list, nueva y detalle (incluyendo polling activo en estado procesando).

---

## Architecture

### Páginas

```
/guias-despacho           → GuiasDespachoList.tsx
/guias-despacho/nueva     → GuiaDespachoNueva.tsx
/guias-despacho/:id       → GuiaDespachoDetalle.tsx
/notas-venta/:id          → botón "Generar guía" agregado a NotaVentaDetalle.tsx existente
/notas-credito/nueva      → soporta query param ?guia_despacho_id=X (extender NotaCreditoNueva.tsx existente)
```

### Componentes reutilizados (no nuevos)

- `ClienteSelectModal` — receptor (scope empresa, query invalidation)
- `EmpresaSelectModal` + dropdown de sedes despacho — auto-pobla `direccion_destino` + `comuna_destino`
- `ProductoAutocomplete` — líneas con sugerencias por historial cliente/empresa (endpoint `/api/productos/sugerencias`)
- `EmailModal` — envío SMTP (existing, parametrizado)
- `AnularConfirmModal` — confirmación previa a redirect NC (reusable)
- `DteEstadoBadge` — chip con color por estado SII

### Hooks (TanStack Query)

```ts
// frontend/src/api/guiasDespacho.ts
useGuiasDespacho(filters)           // GET /api/guias-despacho
useGuiaDespacho(id, { polling })    // GET /api/guias-despacho/{id} con refetchInterval condicional
useCreateGuiaDespacho()             // POST /api/guias-despacho
useUpdateGuiaDespacho(id)           // PATCH metadata
useDeleteGuiaDespacho(id)           // DELETE (solo si dte_estado=='no_emitida')
useEmitirGuiaDespacho()             // POST /api/dte/guias-despacho/{id}/emitir
useEnviarEmailGuia()                // POST /api/guias-despacho/{id}/email
useGuiaDespachoPdfUrl(id)           // helper para `/api/guias-despacho/{id}/pdf` con auth header
useNotasVentaParaGuia(clienteId?)   // GET /api/notas-venta?cliente_id=&estado_in=pendiente,despachada,entregada,pagada
```

`queryKey` convention: `['guias-despacho', filters]` (lista), `['guias-despacho', id]` (detalle). Invalidación cross-page tras crear/emitir/anular.

---

## GuiasDespachoList

### Filtros (sticky header)

- `estado`: `<select>` con `todas | emitida | anulada`
- `dte_estado`: `<select>` con `todas | no_emitida | procesando | aceptada | rechazada`
- `desde` / `hasta`: date pickers (default: últimos 30 días)
- `cliente_id` / `empresa_id`: pickers con búsqueda
- `motivo_traslado`: `<select>` con 9 opciones SII (texto descriptivo)
- `vendedor_id`: solo visible para admin/subadmin
- Búsqueda libre: campo "buscar por N°" (search por número exacto)

Filtros sincronizados a URL search params (`?desde=...&estado=...`) para shareable links + back/forward navegación.

### Tabla

| Columna | Fuente | Notas |
|---|---|---|
| N° | `numero` | clic → detalle |
| Fecha | `fecha` | format DD/MM/YYYY |
| Cliente | `cliente_nombre` | "(Sin cliente)" si null |
| Motivo | `motivo_traslado` | mostrar texto descriptivo, no el int |
| NV | `nota_venta_numero` | link `/notas-venta/{id}` si existe |
| Total | `total` | format `$N.NNN` |
| Estado | `estado` | badge gris (emitida) / rojo (anulada) |
| DTE | `dte_estado` | `<DteEstadoBadge>` |
| Acciones | — | menú "⋮" con: Ver, PDF, Email, Anular (condicional) |

Vendedor scoping: backend ya filtra automáticamente. Frontend no replica lógica.

### Export

Botón "Exportar Excel" → `GET /api/guias-despacho/export.xlsx?<filtros vigentes>` (backend ya implementa para boleta — agregar análogo). 12 columnas.

### Paginación

Server-side. `limit=50` default, controles `<<  <  página X de Y  >  >>` al pie.

---

## GuiaDespachoNueva

### Layout (single column, top → bottom)

#### Sección 1 — Origen (opcional)

Botón secundario `[ Cargar desde NV existente ]` → abre modal con lista de NVs no anuladas (filtra por cliente si ya seleccionado, o todas si vacío). Al elegir:

- Pobla `cliente_id`, `empresa_id`, `direccion_destino`, `comuna_destino` desde NV
- Pobla `lineas` con productos+cantidades de la NV (totales se recalculan client-side)
- Setea `nota_venta_id` en el payload
- Banner: "Cargado desde NV N°{numero}. Edita lo que necesites."

#### Sección 2 — Receptor

- `[ Seleccionar cliente ]` → `ClienteSelectModal` (obligatorio para submit)
- Si cliente tiene `empresa_id`, mostrar nombre empresa (read-only chip)

#### Sección 3 — Motivo de traslado

`<select>` obligatorio con 9 opciones SII:

```
1 — Operación constituye venta
2 — Ventas por entregar
3 — Consignaciones
4 — Entrega gratuita
5 — Traslado interno
6 — Otros traslados no venta
7 — Guía de devolución
8 — Traslado para exportación
9 — Venta para exportación
```

Default: `1` (caso más común retail/B2B).

#### Sección 4 — Destino

- `direccion_destino` (text input, max 255)
- `comuna_destino` (text input, max 100)
- `email_envio` (opcional, validate email)

Si la empresa del cliente tiene sedes de despacho registradas:
- Dropdown "Cargar desde sede" → autocompleta `direccion_destino` + `comuna_destino`. No bloquea edición.

#### Sección 5 — Líneas

Tabla editable, mismo componente que cotización/NV/boleta:

| Col | Editable | Notas |
|---|---|---|
| Producto | `ProductoAutocomplete` | sugerencias por historial cliente |
| Descripción | sí | autocompleta del producto, editable |
| Cantidad | sí | Numeric(10,2) |
| Precio unit | sí | bruto, Numeric(12,2) |
| Desc % | sí | Numeric(5,2) |
| Exenta | checkbox | per-line |
| Total | calculado | display |

Botón `[ + Agregar línea ]`. Cada línea tiene botón "🗑" para eliminar.

#### Sección 6 — Totales

Calculados client-side: `Neto`, `IVA 19%`, `Total`. Validados server-side al submit.

#### Sección 7 — Acciones

```
[ Cancelar ]   [ Guardar borrador ]   [ Guardar y emitir DTE ]
```

- **Cancelar** → confirma si form dirty, redirect `/guias-despacho`
- **Guardar borrador** → POST `/api/guias-despacho` (estado `emitida`, dte_estado `no_emitida`) → redirect `/guias-despacho/{id}` (puede emitir desde detalle después)
- **Guardar y emitir DTE** → POST crear → POST `/dte/guias-despacho/{id}/emitir` → redirect `/guias-despacho/{id}` (que hace polling automáticamente)

Atajos teclado:
- `Ctrl+Enter` → Guardar y emitir
- `Esc` → Cancelar (con confirmación si dirty)

### Validaciones client (antes de submit)

- ≥1 línea con `cantidad > 0`
- `motivo_traslado ∈ {1..9}` (garantizado por select)
- `cliente_id` no null
- `direccion_destino` no vacía (`>= 3` chars)
- `comuna_destino` no vacía
- Totales coherentes (`Math.abs(client_total - sum_lineas) < 0.01`)

Errores server-side (422) se renderizan inline en el campo correspondiente.

---

## GuiaDespachoDetalle

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ Guía de Despacho N°1234       [estado] [DTE badge]       │
│ Fecha: 26/04/2026                       Folio SII: 5678  │
│                                         Track ID: ...     │
├─────────────────────────────────────────────────────────┤
│ Receptor                                                  │
│ Cliente: Juan Pérez (RUT 11.111.111-1)                   │
│ Empresa: ACME SpA                                         │
├─────────────────────────────────────────────────────────┤
│ Motivo: 1 — Operación constituye venta                   │
│ Destino: Av. Providencia 1234, Providencia               │
│ Email envío: cliente@example.com                          │
├─────────────────────────────────────────────────────────┤
│ Nota de Venta vinculada: N°5678 →                        │
├─────────────────────────────────────────────────────────┤
│ Líneas                                                    │
│  [tabla read-only líneas]                                 │
│ Totales: Neto $X | IVA $Y | Total $Z                     │
├─────────────────────────────────────────────────────────┤
│ [Banner si anulada: "Anulada vía NC N°XXX →"]            │
├─────────────────────────────────────────────────────────┤
│ Acciones (depende de estado)                              │
└─────────────────────────────────────────────────────────┘
```

### Polling DTE

```ts
useGuiaDespacho(id, {
  refetchInterval: (data) => data?.dte_estado === 'procesando' ? 10_000 : false
})
```

10s mientras procesando, stop al transicionar a aceptada/rechazada. Mismo patrón que BoletaDetalle.

### Acciones por estado

| `estado` | `dte_estado` | Acciones visibles |
|---|---|---|
| emitida | no_emitida | Editar metadata, Eliminar, **Emitir DTE**, PDF, Email |
| emitida | procesando | PDF, Email (con tooltip "DTE en proceso") |
| emitida | aceptada | PDF, Email, **Anular** |
| emitida | rechazada | PDF, Email, **Reintentar emisión**, Eliminar |
| anulada | * | Solo lectura, link a NC vinculada |

### Detalle acciones

- **Editar metadata** → modal inline con `direccion_destino, comuna_destino, email_envio` (PATCH parcial). Solo estos 3 campos editables (líneas/totales/motivo inmutables).
- **Eliminar** → confirm modal, DELETE. Backend rechaza con 409 si `dte_estado != 'no_emitida'`.
- **Emitir DTE** → POST `/dte/guias-despacho/{id}/emitir`. UI muestra spinner + transition a procesando, polling arranca.
- **PDF** → abre `/api/guias-despacho/{id}/pdf` en nueva pestaña (con auth header via fetch + blob URL).
- **Email** → `EmailModal` reusable, default a `email_envio` o `cliente.email`.
- **Anular** → `AnularConfirmModal` ("¿Crear NC tipo 61 para anular esta guía?") → on confirm → `navigate('/notas-credito/nueva?guia_despacho_id={id}')`.
- **Reintentar emisión** → mismo endpoint que Emitir DTE; backend permite reintento si última `DteEmision` está en estado `rechazada`.

### Audit trail

Link "Ver historial" → abre modal con últimas 20 entries de `/api/auditoria?entity_type=GuiaDespacho&entity_id={id}`. Reusa componente existente.

---

## Integración con NotaVentaDetalle (existing)

Agregar botón en sección "Acciones" de `NotaVentaDetalle.tsx`:

- Visible si `nv.estado in ['pendiente', 'despachada', 'entregada']` y user tiene `guias_despacho:create`
- Texto: `[ Generar guía de despacho ]`
- Acción: `navigate('/guias-despacho/nueva?nv_id={id}')` — el form auto-carga la NV al montar si query param presente

---

## Integración con NotaCreditoNueva (existing)

Extender `NotaCreditoNueva.tsx` para leer query param `guia_despacho_id`:

- Si presente, fetch `/api/guias-despacho/{id}` y precargar:
  - Líneas (copiar de la guía)
  - `razon`: "Anulación guía de despacho N°{numero}"
  - `tipo`: 61 (anula)
  - `guia_despacho_id` en payload final
  - Banner read-only: "Esta NC anulará la Guía de Despacho N°{numero}"
- Submit normal → redirect a `/notas-credito/{id}`. Cuando NC sea aceptada por SII, el backend marca `guia.estado = 'anulada'` automáticamente (D-16 del backend).

---

## Routing + Sidebar

### App.tsx

```tsx
<Route path="/guias-despacho" element={
  <RequirePermission module="guias_despacho" action="view">
    <GuiasDespachoList />
  </RequirePermission>
} />
<Route path="/guias-despacho/nueva" element={
  <RequirePermission module="guias_despacho" action="create">
    <GuiaDespachoNueva />
  </RequirePermission>
} />
<Route path="/guias-despacho/:id" element={
  <RequirePermission module="guias_despacho" action="view">
    <GuiaDespachoDetalle />
  </RequirePermission>
} />
```

### Sidebar (existing component)

Agregar entry "Guías de Despacho" en grupo "Documentos" (después de "Boletas", antes de "Notas de Crédito"):

```tsx
{
  label: 'Guías de Despacho',
  to: '/guias-despacho',
  icon: <Truck size={18} />,
  module: 'guias_despacho',
  action: 'view',
}
```

---

## Tests (Vitest + Testing Library)

### `GuiasDespachoList.test.tsx`

- Renderiza tabla con datos mock
- Aplica filtros → query refetch llamado con params correctos
- Botón "Nueva" navega a `/guias-despacho/nueva`
- Export Excel descarga blob (mock fetch)
- Vendedor no ve filtro `vendedor_id`

### `GuiaDespachoNueva.test.tsx`

- Render form vacío
- ClienteSelectModal abre y selecciona cliente → `cliente_id` poblado
- Cargar desde NV → autopobla cliente + líneas + dirección
- Validación: submit sin líneas muestra error
- Validación: submit sin cliente muestra error
- "Guardar y emitir" llama POST crear + POST emitir, redirect a detalle
- Atajo Ctrl+Enter dispara submit-emitir

### `GuiaDespachoDetalle.test.tsx`

- Render con guía aceptada → muestra acciones correctas
- Render con guía procesando → polling activo (mock setInterval, verifica refetch tras 10s)
- Render con guía aceptada → botón "Anular" visible y navega a `/notas-credito/nueva?guia_despacho_id={id}`
- Render con guía anulada → solo lectura + banner con link NC
- Render con guía rechazada → botón "Reintentar emisión" visible
- Editar metadata → PATCH llamado solo con campos editables

---

## Out of Scope (explicit)

- Bulk emisión (emitir múltiples guías en una sola acción)
- Vista timeline de todas las guías de un cliente (cubierto por Tier A #4 futuro)
- Reapertura de guía anulada (SII no permite)
- App móvil / PWA optimization (Wave 6)
- Endpoint export Excel `/export.xlsx` si no existe en backend — agregar como TODO en backend si falta (revisar al iniciar implementación; export de boleta ya tiene patrón)

---

## File Inventory (esperado)

### Nuevo

- `frontend/src/pages/GuiasDespachoList.tsx`
- `frontend/src/pages/GuiasDespachoList.test.tsx`
- `frontend/src/pages/GuiaDespachoNueva.tsx`
- `frontend/src/pages/GuiaDespachoNueva.test.tsx`
- `frontend/src/pages/GuiaDespachoDetalle.tsx`
- `frontend/src/pages/GuiaDespachoDetalle.test.tsx`
- `frontend/src/api/guiasDespacho.ts` (hooks + types)

### Modificado

- `frontend/src/App.tsx` — 3 rutas nuevas
- `frontend/src/components/Sidebar.tsx` (o equivalente) — entry nueva
- `frontend/src/pages/NotaVentaDetalle.tsx` — botón "Generar guía"
- `frontend/src/pages/NotaCreditoNueva.tsx` — soporte query param `guia_despacho_id`
- Backend (si falta): endpoint `GET /api/guias-despacho/export.xlsx` (revisar al inicio)

---

## Risks

- **Polling N+1 si lista tiene muchas guías procesando:** la lista no hace polling per-row; solo el detalle. Lista usa refetch on focus + invalidation post-mutación. OK.
- **NotaCreditoNueva ya complejo:** agregar otro query param podría romper lógica existing. Mitigación: feature flag implícito (solo activa precarga si query param presente, sin else if).
- **Sedes de despacho no siempre cargadas:** dropdown sedes solo renderiza si `cliente.empresa_id` y `empresa.sedes.length > 0`. Sin sedes → fallback al input manual. No bloquea.
- **Test polling:** `vi.useFakeTimers()` puede ser frágil en CI. Mitigación: helper de test que avanza timers + flushes promesas.

---

## Implementation Order (sugerido al planner)

1. **Wave 1 — Plumbing**
   - `frontend/src/api/guiasDespacho.ts` (hooks + types)
   - Routing en App.tsx + Sidebar entry
2. **Wave 2 — Páginas core (paralelo posible)**
   - `GuiasDespachoList.tsx` + tests
   - `GuiaDespachoNueva.tsx` + tests (sin integración NV todavía)
   - `GuiaDespachoDetalle.tsx` + tests (sin polling todavía)
3. **Wave 3 — Integraciones cross-page**
   - Polling DTE en detalle (con tests timers)
   - Botón "Generar guía" en NotaVentaDetalle
   - Soporte `?guia_despacho_id=` en NotaCreditoNueva
   - Cargar desde NV en GuiaDespachoNueva
4. **Wave 4 — Pulido**
   - Atajos teclado, banners de estado, validaciones inline
   - Export Excel (backend si falta)
   - Smoke test e2e manual: lista → nueva → emitir → detalle polling → anular vía NC

---

*Spec for /superpowers:writing-plans next step.*
