# Búsqueda global Cmd+K — Design Spec

**Fecha:** 2026-04-24
**Estado:** Aprobado, listo para plan de implementación
**Roadmap:** Tier A #7 (`docs/roadmap-crm.md`)

## Objetivo

Modal de búsqueda global accesible vía atajo de teclado, que permita encontrar productos, clientes, empresas, documentos comerciales y empleados desde cualquier página, respetando los permisos del usuario.

## Alcance

### Entidades buscables

| Entidad | Match | Permiso | Filtro adicional |
|---|---|---|---|
| Productos | `nombre` ILIKE, `sku` ILIKE | `catalogo:view` | — |
| Clientes | `nombre` ILIKE, `rut` ILIKE | `clientes:view` | — |
| Empresas | `nombre` ILIKE, `rut` ILIKE | `empresas:view` | — |
| Cotizaciones | `CAST(numero AS TEXT) LIKE 'q%'` | `cotizaciones:view` | vendedor: solo propias |
| Notas de venta | `CAST(numero AS TEXT) LIKE 'q%'` | `notas_venta:view` | vendedor: solo propias |
| Facturas | `CAST(numero AS TEXT) LIKE 'q%'` | `facturas:view` | vendedor: solo de NV propias |
| Órdenes de compra | `CAST(numero AS TEXT) LIKE 'q%'` | `ordenes_compra:view` | — |
| Empleados | `nombre` ILIKE | `rrhh:view` | — |

### Fuera de alcance v1

- Notas de crédito/débito
- Pagos
- Tareas
- Atajos de navegación ("Ir a /reportes", "Nueva cotización")
- Validación de recientes (un recent borrado lleva a 404; aceptable)
- Highlight de matched substring en resultado
- Tests E2E con Playwright

## Arquitectura

### Componentes nuevos

**Backend:**
- `GET /api/search?q=X&limit=5` — endpoint único, fan-out secuencial a 8 categorías
- Migración: `users.preferencias JSONB NOT NULL DEFAULT '{}'::jsonb`
- `GET /api/users/me/preferencias` — retorna prefs con defaults aplicados
- `PATCH /api/users/me/preferencias` — merge parcial sobre JSONB

**Frontend:**
- Dependencia nueva: `cmdk@^1.0.0`
- `<GlobalSearchModal>` — montado en `AppLayout`
- `<SearchButton>` — header desktop, visible según preferencia
- `useGlobalShortcut()` — registra listener según atajo configurado
- `useGlobalSearch(q)` — react-query hook con debounce + AbortController
- `useRecentEntities()` — localStorage, max 5
- `usePreferencesStore` (zustand) — hidrata desde `/api/users/me/preferencias` al login
- Sección "Búsqueda" en `/configuracion`

### Flujo

1. **Login** → fetch `/api/users/me/preferencias` → hidrata `usePreferencesStore`
2. **Usuario presiona atajo** (default Ctrl+K / Cmd+K en Mac) → modal abre
3. **Query vacío o < 2 chars** → renderiza "Recientes" desde localStorage
4. **Query ≥ 2 chars** → debounce 200ms → `GET /api/search?q=X` → render agrupado por categoría
5. **Enter o click en resultado** → push a localStorage recientes (dedup por `tipo+id`, FIFO max 5) → `navigate(detalleUrl)` → modal cierra
6. **Esc** → modal cierra, query se preserva al reabrir

### Permisos

- El endpoint usa un helper soft `has_permission(user, modulo, accion) -> bool` (no levanta 403); si retorna `False`, la categoría se omite del fan-out
- Si el user no tiene `rrhh:view`, la key `empleados` **se omite por completo** de la respuesta (no aparece como `[]`)
- Para vendedor, queries en cotizaciones/NV filtran por `vendedor_id = current_user.id`; facturas filtran transitivamente vía `nota_venta.vendedor_id`
- Si el helper soft no existe aún, la implementación lo agrega como utilidad junto al `require_permission` existente (extracción del check booleano subyacente)

## API contracts

### `GET /api/search`

**Query params:**
- `q: str` (required, mínimo 2 caracteres, max 100)
- `limit: int` (default 5, max 10) — por categoría

**Auth:** requerido (cualquier usuario autenticado).

**Errores:**
- `400` si `len(q) < 2` o `len(q) > 100`
- `401` si no autenticado

**Response 200:**
```json
{
  "q": "tor",
  "productos": [
    {"id": 1, "nombre": "Tornillo M8", "sku": "TOR-008"}
  ],
  "clientes": [
    {"id": 5, "nombre": "Juan Pérez", "rut": "12.345.678-9", "empresa": "ACME"}
  ],
  "empresas": [
    {"id": 3, "nombre": "ACME", "rut": "76.123.456-7"}
  ],
  "cotizaciones": [
    {"id": 12, "numero": 12350, "estado": "abierta", "cliente_nombre": "Juan Pérez"}
  ],
  "notas_venta": [
    {"id": 4, "numero": 100, "estado": "pendiente", "cliente_nombre": "Juan Pérez"}
  ],
  "facturas": [
    {"id": 8, "numero": 200, "estado": "pagada", "cliente_nombre": "Juan Pérez"}
  ],
  "ordenes_compra": [
    {"id": 2, "numero": 50, "estado": "borrador", "proveedor_nombre": "..."}
  ],
  "empleados": [
    {"id": 1, "nombre": "María González", "cargo": "Vendedora"}
  ]
}
```

Las keys cuya categoría requiere un permiso que el user no tiene **se omiten**.

### `GET /api/users/me/preferencias`

**Response 200:**
```json
{
  "busqueda_boton_visible": true,
  "busqueda_atajo": "ctrl_k"
}
```

Defaults aplicados sobre `users.preferencias`.

### `PATCH /api/users/me/preferencias`

**Body (partial):**
```json
{
  "busqueda_atajo": "alt_s"
}
```

**Validación:** `busqueda_atajo ∈ {ctrl_k, ctrl_p, ctrl_shift_f, alt_s}`. Pydantic Literal.

**Response 200:** mismo schema que GET.

**Errores:** `422` si valor fuera de whitelist.

## Frontend — detalles

### Render por tipo de resultado

Cada item: ícono lucide + título + subtítulo + (opcional) badge de estado.

| Tipo | Icono | Título | Subtítulo | Badge |
|---|---|---|---|---|
| Producto | `Package` | `nombre` | `sku` | — |
| Cliente | `User` | `nombre` | `rut · empresa` | — |
| Empresa | `Building` | `nombre` | `rut` | — |
| Cotización | `FileText` | `#numero` | `cliente_nombre` | `estado` |
| Nota de venta | `ShoppingCart` | `#numero` | `cliente_nombre` | `estado` |
| Factura | `Receipt` | `#numero` | `cliente_nombre` | `estado` |
| Orden de compra | `Truck` | `#numero` | `proveedor_nombre` | `estado` |
| Empleado | `UserCircle` | `nombre` | `cargo` | — |

Color de badge por estado reutiliza el esquema existente de cada módulo.

### Atajos

Store guarda valor agnóstico (`ctrl_k`, etc.). Runtime detecta plataforma:

| Valor | Linux/Windows | Mac (display) |
|---|---|---|
| `ctrl_k` | Ctrl+K | ⌘K |
| `ctrl_p` | Ctrl+P | ⌘P |
| `ctrl_shift_f` | Ctrl+Shift+F | ⌘⇧F |
| `alt_s` | Alt+S | ⌥S |

`Ctrl+P` siempre con `event.preventDefault()` para evitar diálogo de impresión del browser.

### Configuración (`/configuracion`)

Sección "Búsqueda":
- Checkbox: "Mostrar botón de búsqueda en barra superior"
- Dropdown: "Atajo de teclado" con 4 opciones (texto adaptado a plataforma)
- Botón "Guardar" → PATCH al endpoint, toast `sonner`, store actualizado en memoria (atajo nuevo activo sin recargar)

### Recientes (localStorage)

**Key:** `conico:recientes`
**Schema:**
```ts
type RecentEntity = {
  tipo: 'producto' | 'cliente' | 'empresa' | 'cotizacion' | 'nota_venta' | 'factura' | 'orden_compra' | 'empleado'
  id: number
  titulo: string
  subtitulo?: string
  estado?: string
  addedAt: string  // ISO
}
```

**Comportamiento:**
- Máximo 5 items
- Dedup por `tipo+id` (mover al top)
- Try/catch en lectura; fallback `[]`
- Validación: descarta items sin `tipo` o `id` válidos
- Por usuario y por browser (no se sincroniza entre dispositivos)

### Mobile

- Modal full-screen en breakpoints `< md`
- Botón siempre visible en top bar móvil (ícono lupa)
- Atajo de teclado N/A en móvil
- Recientes funcionan igual

## Performance

- 8 queries SQL secuenciales con índices existentes (`numero` unique-indexed; `nombre`/`sku`/`rut` con índices)
- Target: < 100ms p95 en backend
- Frontend AbortController cancela requests previas al tipear
- React-query `staleTime: 30s` evita re-fetch en backforth rápido
- `keepPreviousData: true` evita flicker al cambiar query

## Errores y edge cases

- **Network error**: react-query retry 3x; `<Command.Empty>` con mensaje + botón reintentar tras fallar
- **Recientes corrupto**: try/catch en parse, fallback `[]`
- **Recent borrado**: navegar lleva a 404 (RouteError existente). Aceptable v1
- **Mismo número distinto tipo**: cotización #100, NV #100, factura #100 conviven; cada una en su grupo
- **Atajo conflicta con browser**: `preventDefault` siempre. Usuario puede cambiar atajo
- **Permisos cambian mid-session**: store hidratado al login; resultados siempre filtran server-side. Cambio de permiso surte efecto tras nuevo login

## Testing

### Backend — `backend/tests/test_search.py`

- `test_q_too_short_returns_400`
- `test_unauthenticated_returns_401`
- `test_admin_sees_all_categories`
- `test_vendedor_sees_only_own_cotizaciones`
- `test_vendedor_sees_only_own_nv`
- `test_vendedor_sees_only_facturas_from_own_nv`
- `test_user_without_rrhh_omits_empleados_key`
- `test_match_producto_by_nombre_and_sku`
- `test_match_cliente_by_rut_with_puntuation`
- `test_match_documento_by_numero_across_types`
- `test_limit_per_category`
- `test_empty_results_returns_empty_arrays`

### Backend — `backend/tests/test_preferencias.py`

- `test_get_returns_defaults_for_new_user`
- `test_patch_updates_partial_preserves_other_keys`
- `test_patch_invalid_atajo_returns_422`
- `test_get_after_patch_returns_persisted_value`
- `test_patch_unauthenticated_returns_401`

### Frontend — `frontend/src/__tests__/`

- `GlobalSearchModal.test.tsx`
  - Atajo Ctrl+K abre el modal
  - Query < 2 chars no dispara fetch
  - Query ≥ 2 chars dispara fetch tras 200ms debounce
  - Flechas ↑↓ navegan entre items, Enter navega a detalle
  - Esc cierra modal
  - Resultados se agrupan por categoría con headers
  - Query vacío con localStorage seed muestra recientes
  - Click en resultado push a recientes y navega
- `useGlobalShortcut.test.tsx`
  - Atajo configurable: cambio a Alt+S responde solo a Alt+S
- `Configuracion.test.tsx`
  - Sección búsqueda: toggle + dropdown llaman PATCH y actualizan store

## Archivos afectados

**Backend:**
- `backend/app/api/search.py` (nuevo)
- `backend/app/main.py` (registrar router)
- `backend/app/api/users.py` (endpoints de preferencias)
- `backend/app/models/user.py` (campo `preferencias`)
- `backend/app/schemas/user.py` (`UserPreferenciasOut`, `UserPreferenciasUpdate`)
- `backend/alembic/versions/<nueva>.py` (migración)
- `backend/tests/test_search.py` (nuevo)
- `backend/tests/test_preferencias.py` (nuevo)

**Frontend:**
- `frontend/package.json` (dep `cmdk`)
- `frontend/src/components/search/GlobalSearchModal.tsx` (nuevo)
- `frontend/src/components/search/SearchButton.tsx` (nuevo)
- `frontend/src/components/search/items/*.tsx` (renderers por tipo, nuevo)
- `frontend/src/hooks/useGlobalShortcut.ts` (nuevo)
- `frontend/src/hooks/useGlobalSearch.ts` (nuevo)
- `frontend/src/hooks/useRecentEntities.ts` (nuevo)
- `frontend/src/stores/preferences.ts` (nuevo, zustand)
- `frontend/src/api/search.ts` (nuevo)
- `frontend/src/api/preferencias.ts` (nuevo)
- `frontend/src/components/layout/AppLayout.tsx` (montar modal + botón)
- `frontend/src/pages/Configuracion.tsx` (sección Búsqueda)
- `frontend/src/__tests__/GlobalSearchModal.test.tsx` (nuevo)
- `frontend/src/__tests__/useGlobalShortcut.test.tsx` (nuevo)
