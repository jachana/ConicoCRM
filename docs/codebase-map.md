# Conico — Codebase Map (orientación para agentes)

> **Propósito:** que un agente (IA o humano) se ubique en el repo en 5 minutos sin recorrerlo entero.
> Última actualización: 2026-06-11 (HEAD `0dd92ed`). Si este doc contradice al código, gana el código — y actualiza este doc en el mismo PR.
>
> Lectura complementaria: [`architecture.md`](architecture.md) (diagramas, modelo de datos, flujos), [`AGENTS.md`](AGENTS.md) (proceso de trabajo), [`database-schema.md`](database-schema.md) (ERD completo), `CLAUDE.md` raíz (reglas de comandos y Trello).

---

## 1. Qué es Conico

CRM + ERP ligero para Pymes chilenas, **single-tenant** (VPS con Docker Compose). Flujo comercial completo: **Cotización → Nota de Venta → Factura → Pago**, más boletas, guías de despacho, notas de crédito/débito, OC a proveedores, inventario, RRHH, cobranza, tareas automáticas, dashboard configurable y emisión DTE vía **Lioren** (proveedor SII).

- **Idioma:** dominio en español (`cotizacion`, `factura`, `empresa`), infra en inglés (`auth`, `middleware`). Datos y UI en español.
- **Stack:** FastAPI + SQLAlchemy 2 + Alembic + Celery/Redis + PostgreSQL (prod) / SQLite (tests) · React 18 + Vite + TypeScript + TanStack Query v5 + Zustand + Tailwind v3.

## 2. Layout del repo (y qué ignorar)

```
backend/            # FastAPI — la app vive en backend/app/
  app/{api,models,schemas,services,tasks,core,middleware,utils,templates}
  migrations/       # Alembic CANÓNICO (alembic.ini apunta aquí) — ~89 revisiones
  tests/            # pytest (~125 archivos)
frontend/src/       # React — {pages,components,api,hooks,stores,lib,utils}
docs/               # documentación (ver índice en §9)
.github/workflows/  # ci.yml (alembic guard, ruff, pytest, tsc, vitest) + docker-build.yml
.trello_agent/      # artefactos tboard (workflow Trello — ver CLAUDE.md raíz)
data_seed/          # XLSX de seeds (clientes, productos, stock…)
scripts/            # restore.sh, size-check.js
nginx/, docker-compose*.yml, config/perf-budget.json
```

**Ignorar / no tocar:**
- `Conico-reportes/` — espejo/branch hermano antiguo del repo. No es código activo.
- `migrations/` en la **raíz** — huérfano (1 archivo). El Alembic real es `backend/migrations/`.
- `test.db`, `test2.db`, `test_debug.db`, `test_fresh.db`, `test_probe.db` — artefactos viejos de debug; pytest usa SQLite **in-memory**.
- `node_modules/` en la raíz y `frontend/storybook-static/`, `frontend/dist/`.

## 3. Backend — dónde vive cada cosa

### 3.1 Anatomía de un módulo (patrón repetido ~50 veces)

| Pieza | Ubicación | Convención |
| --- | --- | --- |
| Router | `backend/app/api/<recurso>.py` | prefijo plural español `/api/cotizaciones`; registrar en `main.py` |
| Modelo | `backend/app/models/<recurso>.py` | SQLAlchemy `Mapped` typed; importar en `models/__init__.py` (si no, autogenerate no lo ve) |
| Schema | `backend/app/schemas/<recurso>.py` | Pydantic v2; sufijos `Create`/`Update`/`Out`; `Out` con `from_attributes=True` |
| Servicio | `backend/app/services/` | sólo si hay lógica reutilizable (pdf, email, dte, parsers de import) |
| Test | `backend/tests/test_<recurso>.py` | fixtures en `conftest.py` |
| Migración | `cd backend && alembic revision --autogenerate -m "..."` | revisar el archivo generado; **verificar `alembic heads` = 1** antes de commitear |

Documentos con líneas (Cotización, NV, Factura, Boleta, NC, ND, GD, OC, FacturaCompra) definen `<Doc>` + `<Doc>Linea` en el mismo archivo de modelo.

### 3.2 Auth y permisos (mecánica exacta)

- **Usuario actual:** `get_current_user()` en `backend/app/api/auth.py` (OAuth2 bearer → JWT decode → lookup por email). JWT access + refresh; 2FA TOTP con recovery codes en `core/security.py`.
- **Permiso módulo×acción:** `Depends(require_permission("modulo", "accion"))` en `backend/app/api/deps.py`. Acciones: `view`, `view_all`, `create`, `edit`, `delete`, `admin`. Defaults por rol + tabla `permission_overrides` — lógica en `backend/app/core/permissions.py`.
- **Sólo admin:** `require_admin()` en `deps.py`.
- **Módulos opcionales (feature flags por instancia):** `require_modulo("slug")` en `deps.py` chequea `modulos_enabled` (registry en `core/modulos.py`); muchos routers lo llevan como dependency a nivel router. El frontend espeja esto con `ModuloGuard`.
- **Roles:** `admin`, `subadmin`, `vendedor`. **Vendedor scoping:** columna `vendedor_id` en Cliente, Cotización, NV, Factura, Boleta, GD, etc.; los list-endpoints filtran por `vendedor_id == current_user.id` salvo permiso `view_all`.
- Referencia completa: `docs/security/roles-and-permissions.md`.

### 3.3 Patrones transversales (los que más confunden)

| Patrón | Dónde | Detalle |
| --- | --- | --- |
| **Numeración correlativa** | `SystemConfig` key/value + `with_for_update()` | contadores `{entidad}_last_id`; helpers locales `_next_numero()` en `api/dte.py`, `api/facturas_compra.py`, y queries inline en `boletas.py`, `facturas.py`, `ordenes_compra.py`, `services/cotizacion_helpers.py`. No hay helper central — copia el patrón. |
| **Chain locking** | campo `is_locked` en Cotización/NV/Factura/Boleta/GD | crear el doc downstream bloquea el upstream; PATCH a doc bloqueado → 403; la UI muestra banner y deshabilita campos. |
| **Stock** | `services/factura_stock.py`, `services/boleta_stock.py` | el stock se descuenta al **emitir factura/boleta**, NO al crear NV (regla de negocio decidida; ver memoria/Trello W1-08). Movimientos en `models/movimiento_inventario.py`. |
| **Auditoría** | `middleware/audit_context.py` + `services/auditoria.py` | ContextVar (user, IP, UA) + listeners SQLAlchemy → tabla `audit_logs` (180d) + archivo semanal a `audit_log_archive` (task Celery). En tests está **deshabilitada por defecto** (fixture `audit_enabled` para activarla). |
| **Búsqueda** | `utils/search.py` | `unaccent_ilike()` (acentos-insensible, con fallback si no hay extensión `unaccent`); `/api/search` hace fan-out a 8 entidades, permission-aware. |
| **RUT** | `utils/rut.py` (backend) y `frontend/src/utils/rut.ts` | validación dígito verificador chileno. |
| **Aprobaciones asíncronas** | `models/aprobacion_credito.py`, `aprobacion_margen.py`, `solicitud_descuento.py` | payload JSON pendiente → admin aprueba → se materializa. "Latest wins" en margen. |
| **Imports masivos (onboarding)** | `services/*_parser.py` (~15 parsers XLSX/CSV) + `api/onboarding_*.py` (13 routers) + UI `pages/MigracionInicial.tsx` | wizard de migración inicial: clientes, productos, stock, históricos (facturas, GD, NC, OC), pagos (con `payment_matcher.py` para conciliar). |
| **DTE** | `services/dte_service.py`, `xml_dte.py`, `caf_service.py`, `libro_service.py` | tipos 33/61/56 + boletas 39/41 + GD 52 + libros compra/venta + recepción DTE. Webhook HMAC SHA256. Deep-dive: `docs/integrations/dte-lioren.md`. |

### 3.4 Celery (broker Redis)

Tasks en `backend/app/tasks/` — la lista de includes en `celery_app.py` es **explícita**: módulo nuevo ⇒ agregarlo ahí. Beat: `poll_dte_status` (5 min), `generar_tareas_automaticas` (1 h, 6 reglas — ver `architecture.md` §8), recordatorios cobranza (08:00), alertas CAF (08:30), rollups de telemetría (horarios), archivo de audit logs (lunes 02:00). Referencia: `docs/celery-jobs.md`.

### 3.5 Tests backend

```bash
cd backend && ./run_tests.sh           # todos menos smoke
./run_tests.sh -k <keyword>            # filtrado (preferir esto — ver CLAUDE.md: tests targeted)
./run_tests.sh --smoke                 # incluye tests que requieren Docker
```

- `conftest.py`: SQLite **in-memory** (StaticPool), schema una vez por sesión, limpieza por DELETE por test, overrides de FastAPI reseteados post-test.
- **WeasyPrint está mockeado** en conftest (Windows no tiene deps GTK) — no testees generación real de PDF.
- Función SQLite `unaccent()` registrada a mano en conftest para paridad con Postgres.

## 4. Frontend — dónde vive cada cosa

### 4.1 Anatomía de una página

| Pieza | Ubicación | Convención |
| --- | --- | --- |
| Página lista | `frontend/src/pages/<Entidad>.tsx` | seguir patrón `Clientes.tsx` |
| Página detalle | `pages/<Entidad>Detalle.tsx` | rutas `/x/nueva` y `/x/:id` comparten componente |
| Ruta | `frontend/src/router.tsx` | envolver en guards (ver abajo) |
| API client | `frontend/src/api/<entidad>.ts` | funciones sueltas, no clases; usar `api` de `lib/api.ts` |
| Test | `.test.tsx` colocado al lado | vitest + Testing Library (~52 archivos) |

### 4.2 Guards de ruta (en `router.tsx`)

- `RequireAuth` — token en `useAuthStore`; redirect a `/login`.
- `RequireAdmin` — `role === 'admin'`.
- `RequireNotVendedor` — bloquea vendedores (proveedores, OC, pagos, reportes, NC/ND…).
- `ModuloGuard` (`components/ModuloGuard.tsx`) — espeja `require_modulo` del backend vía `useModulos()`; fallback `ModuloNoDisponible`.

### 4.3 Estado, datos y permisos

- **Axios:** `lib/api.ts` — instancia única; interceptor inyecta Bearer; en 401 intenta refresh (`POST /api/auth/refresh`) y reintenta; si falla → `logout()`.
- **Zustand:** `stores/auth.ts` (user + tokens, persistido en localStorage `conico-auth`), `stores/preferences.ts` (atajos, sidebar), `stores/viewAs.ts` (admin "ver como", sessionStorage).
- **TanStack Query:** `queryKey: ['entidad', filtros]`; `invalidateQueries` tras mutaciones; `keepPreviousData` en paginación.
- **Permisos en UI:** `useEffectivePermissions()` (`hooks/useEffectivePermissions.ts`) — en modo "view as" hace AND de permisos propios + target.

### 4.4 Design system (reglas duras)

- Primitivas en `components/ui/` (con stories de Storybook): `Modal` (NO `Dialog`), `Button` (variantes `primary|secondary|outline|ghost|danger|success|link` — NO `destructive`), `Table`, `Tabs`, `Select`, `Badge`, `Card`, `ConfirmModal`, `EmptyState`, etc.
- Tokens Tailwind: colores semánticos `brand` (ámbar) / `success` / `warning` / `danger` / `info`; sombras `elev-1..4`; dark mode por clase.
- Iconos: importar de `lucide-react` directo; no redefinir tipos `LucideIcon`.
- Componentes de dominio sueltos en `components/` (modales de detalle, tabs de Empresa/Producto, `EntityLink`, `Timeline`, `BulkActionBar`, `ColumnsMenu`…). **Buscar uno existente antes de crear otro.**

### 4.5 Dev / build

- `npm run dev` con proxy Vite `/api` → `localhost:8000`. `npm test` = vitest. `npm run build` incluye `tsc`. Storybook: `npm run storybook` (6006).

## 5. Estado actual del producto (2026-06)

**Implementado** (no re-implementar; verificar con commits si una card de Trello lo pide): flujo comercial completo con chain locking, boletas DTE 39/41, guías despacho DTE 52, NC/ND 61/56, libros compra/venta, recepción DTE, CAF management, audit log + archivo, notificaciones in-app, 2FA TOTP, telemetría (perf/costo + UI admin), módulos toggleables por instancia, vendedor scoping end-to-end, dashboard con templates self-service (máx 5/usuario), wizard de migración inicial, CI en GitHub Actions, backups documentados (`docs/runbooks/backup-restore.md`).

**Gaps reales** (a 2026-06-11): multi-tenant (`tenant_id` no existe), portal de clientes, multi-moneda (todo CLP). Lista viva: `architecture.md` §16 y backlog en Trello.

## 6. Workflow de trabajo (resumen — detalle en CLAUDE.md raíz y AGENTS.md)

1. **Trello es la fuente de verdad** (board ConicoCRM). `tboard sync --pull` → elegir card no-claimed → podar `cards.json` a esa card → mover a `In progress` + `--apply` + commit `chore(trello): claim <name>`.
2. Implementar. Tests **targeted** al commitear; smoke al shipear; suite completa sólo para features multi-card.
3. Shipear: commit + push + `tboard sync --ship-review --card "<substring>"` (NUNCA mover a In review a mano).
4. Migración Alembic ⇒ verificar un solo head. Encoding: siempre `utf-8` explícito (Windows/cp1252 revienta con tildes).
5. Actualizar `PROGRESS.md` al cerrar una fase.

## 7. Gotchas conocidos

- `celery_app.py` tiene la lista de task-modules hardcodeada — task nueva ⇒ agregar el include.
- Email es opcional: `services/email.py` lanza `EmailNotConfiguredError` si no hay SMTP; degradar elegante, no romper el flujo.
- Modelos nuevos: importarlos en `models/__init__.py` o `alembic --autogenerate` los ignora silenciosamente.
- Zonas calientes de merge: `main.py` (registro de routers), `router.tsx`, `components/layout/`, `PROGRESS.md` (ver AGENTS.md §4).
- `docs/AGENTS.md` menciona `require_perm` — el nombre real es `require_permission` (`api/deps.py`).
- Auditoría desactivada por defecto en tests; si tu test asevera filas de `audit_logs`, pide la fixture `audit_enabled`.
- Los montos asumen CLP entero (sin decimales de moneda extranjera).

## 8. Cómo levantar el entorno

`docs/setup-local.md` es la guía canónica. Resumen: `docker-compose up` (dev) levanta Postgres/Redis/backend/frontend; o nativo: backend `uvicorn app.main:app --reload` (puerto 8000) + frontend `npm run dev`. Swagger en `/docs`. Variables de entorno: `docs/environment-variables.md`.

## 9. Índice de docs/ (qué leer según la tarea)

| Tarea | Leer |
| --- | --- |
| Arquitectura / modelo de datos | `architecture.md`, `database-schema.md` |
| Proceso de trabajo en equipo | `AGENTS.md` + `CLAUDE.md` raíz |
| Permisos / 403s | `security/roles-and-permissions.md` |
| DTE / Lioren / SII | `integrations/dte-lioren.md`, `runbooks/boleta-dte-troubleshooting.md`, `guia-boletas-electronicas.md` |
| Jobs en background | `celery-jobs.md` |
| Auditoría | `audit-log-system.md` |
| Sentry / métricas | `observability.md`, `operations/lioren_cost_maintenance.md` |
| Backups / restore | `runbooks/backup-restore.md` |
| Setup local / env vars | `setup-local.md`, `environment-variables.md` |
| Funcionalidad de usuario (cómo se usa X) | `guia-*.md` (10 guías) |
| Negocio SaaS / pricing | `saas-*.md` |
| Histórico de diseño | `superpowers/specs/` y `superpowers/plans/` (pueden estar desactualizados) |
