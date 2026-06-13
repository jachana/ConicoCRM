# INDEX — patrones canónicos y comandos

> Objetivo: orientarse SIN re-explorar el codebase. Leer esto + `docs/HANDOFF.md` al
> iniciar sesión. Mapa completo: `docs/codebase-map.md`.

## Comandos

```bash
# Trello (desde repo root; CWD de PowerShell puede driftar — siempre cd primero)
tboard sync --pull                          # snapshot board → cards.json (NO commitear snapshot)
tboard sync --apply                         # push local → board (nunca borra en Trello)
tboard sync --ship-review --card "<substr>" # OBLIGATORIO al mover a In review
# claim: prune cards.json a 1 card, list='In progress', --apply,
#        commit "chore(trello): claim <nombre exacto>"  (ship-review detecta el since por ese commit)

# Tests (targeted SIEMPRE; full suite solo fin de feature multi-card)
cd backend && python -m pytest tests/test_X.py -q     # SQLite in-memory; 2-5 min, backgroundear
cd frontend && npx vitest run src/.../X.test.tsx && npx tsc --noEmit

# Alembic — migraciones en backend/migrations/versions (NO alembic/versions)
cd backend && python -m alembic heads                  # debe dar 1 head ANTES de commitear
# head actual: f2a3b4c5d6e7 · estilo: ver d1e2f3g4h5i6_add_vendedor_id_to_empresa_cliente.py
```

## Patrones backend (FastAPI + SQLAlchemy 2 + Pydantic v2)

- **Permisos:** `perms: tuple[User, Session] = require_permission("modulo", "accion")`;
  módulo a nivel router: `dependencies=[require_modulo("slug")]`. Roles: admin/subadmin/vendedor.
- **Vendedor scoping (2 niveles):**
  - Entity-level: `_enforce_empresa_scope` (empresas.py:90), `_enforce_cliente_scope`
    (clientes.py:34). Sub-recursos de EMPRESA solo usan esto (sin narrowing por doc).
  - Doc-level adicional (solo lado cliente): `query.filter(Doc.vendedor_id == user.id)`
    si role=="vendedor" (canónico: facturas_cliente vs facturas_empresa).
  - NC/ND/reportes/proveedores/FC: vendedor → 403 directo en handler (antes del 404).
- **Sub-recurso de entidad** (empresas.py:377-430): 404 primero → scope → filtros
  estado/fecha_desde/hasta → sort_by whitelist dict + `sort_dir pattern="^(asc|desc)$"`.
- **Historial paginado** (productos.py historial_ventas): limit(50,1-200)/offset, Page
  schema items/total + agregados SQL sobre TODAS las filas.
- **Reportes** (reportes.py): cache por `_filters` dict — **todo param nuevo VA en _filters**
  o colisiona cache. Vendedor 403 antes del cache check.
- **Búsqueda:** `unaccent_ilike` para texto (numero aún usa ilike directo — quick win #5).

## Patrones frontend (React 18 + TS + TanStack Query v5)

- **EntityLink** (`components/EntityLink.tsx`, default export, stopPropagation incluido).
  Kinds y formato de label:
  `factura` FAC-pad4 · `cotizacion` COT-pad4 · `oc` OC-pad5 · `fc` FC-{n} sin pad ·
  `nv` (null → "NV s/n" igual linkeado) · `boleta`/`guia`/`nc`/`nd`/`cliente`/`empresa`/`producto`.
- **UI:** `Modal` (no Dialog) · variant `danger` (no destructive) · lucide-react directo ·
  `<TR interactive onClick>` para filas navegables (ui/Table.tsx:51) · Badge para estados.
- **Detail modals:** EmpresaDetailModal/ClienteDetailModal/ProveedorDetailModal/
  ProductoDetailModal — tabs underline, Field cards en Datos, botón Editar con
  stopPropagation. Botones "Ver en reportes" gateados `!isVendedor` via useAuthStore.
- **Deep-links reportes:** `/reportes?tab=&cliente_id=&empresa_id=&marca_id=&date_from=&date_to=`
  (parsing en Reportes.tsx ~830-910).
- **Tests:** QueryClientProvider + MemoryRouter + `vi.mock('../lib/api')` con branching por
  URL. Reportes.test.tsx mockea useModulos + recharts.

## Workflow de ejecución

subagent-driven-development SIEMPRE (CLAUDE.md): implementer (contexto curado, no lee el
plan) → spec reviewer → quality reviewer → fix-subagents chicos. El controller adjudica
falsos positivos (históricamente ~la mitad de los findings "Important" lo fueron — comparar
contra el patrón canónico antes de aceptar).

## Gotchas

- Windows: utf-8 explícito en todo IO; `python -c` con tildes → wrappear stdout.
- PowerShell heredocs bash no funcionan; usar `@'...'@` (cierre en columna 0).
- `tboard sync --pull` SOBREESCRIBE cards.json (online gana). Prune antes de claim.
- Commits terminan con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- pytest backend tarda minutos → run_in_background.
