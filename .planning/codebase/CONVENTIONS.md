# Coding Conventions

**Analysis Date:** 2026-04-25

This codebase has two distinct sides: a Python/FastAPI backend (`backend/`) and a React/TypeScript frontend (`frontend/`). Each side has its own naming, formatting, and import conventions. Code on either side MUST follow the conventions of that side.

## Naming Patterns

### Backend (Python)

**Files:**
- `snake_case.py` for all modules
- Per-resource files in flat subdirectories (no nested feature folders)
- Examples: `app/api/clientes.py`, `app/models/nota_venta.py`, `app/services/dte_service.py`, `app/schemas/boleta.py`, `app/tasks/dte.py`
- Tests mirror module name with `test_` prefix: `tests/test_clientes.py`, `tests/test_dte_service.py`

**Functions:**
- `snake_case` for all functions
- Spanish business verbs are accepted and used heavily: `crear_cliente`, `listar_clientes`, `actualizar_cliente`, `eliminar_cliente`, `emitir_factura`, `descontar_stock_boleta`
- Internal helpers prefixed with underscore: `_asignar_numero_boleta`, `_calcular_lineas_y_totales`, `_validar_boleta_41`, `_load_boleta`, `_next_numero` (see `backend/app/api/boletas.py`)
- Pytest fixtures and tests are `snake_case` and Spanish (`test_crear_cliente_rut_duplicado`, `test_vendedor_no_puede_eliminar_cliente`)

**Variables:**
- `snake_case`. Spanish names are common for domain concepts: `cliente`, `boleta`, `linea`, `cantidad`, `precio_unitario`, `monto_neto`, `total_iva`, `tipo_dte`
- Module-level constants `UPPER_SNAKE_CASE`: `METODOS_PAGO_BOLETA`, `TIPOS_DTE_BOLETA`, `RUT_GENERICO`, `MODULES`, `ACTIONS` (see `backend/app/schemas/boleta.py`, `backend/app/core/permissions.py`)

**Types/Classes:**
- `PascalCase` for SQLAlchemy models, Pydantic schemas, and services: `Cliente`, `Boleta`, `BoletaLinea`, `DteEmision`, `DteService`
- Pydantic schema suffix convention: `XxxCreate`, `XxxUpdate`, `XxxOut`, `XxxListOut`, `XxxBase`, `XxxRef` (see `backend/app/schemas/cliente.py`, `backend/app/schemas/boleta.py`)
- "Min" projection schemas for nested refs: `ClienteMinOut`, `VendedorMinOut`

**Database tables:**
- Plural `snake_case`: `clientes`, `boletas`, `nota_ventas`, `dte_emisiones`, `movimientos_inventario`, `audit_logs`
- Foreign keys: `<entity>_id` (e.g., `cliente_id`, `empresa_id`, `producto_id`)

### Frontend (TypeScript / React)

**Files:**
- `PascalCase.tsx` for React components and pages: `BoletaNueva.tsx`, `BoletasList.tsx`, `Clientes.tsx`, `EmpresaDetailModal.tsx`
- `camelCase.ts` for API clients, stores, and libs: `api/boletas.ts`, `lib/api.ts`, `stores/auth.ts`
- Tests sit alongside the unit being tested: `Clientes.test.tsx`, `auth.test.ts`. Cross-cutting hook tests live in `frontend/src/__tests__/`
- Some legacy `.js` siblings exist next to the canonical `.tsx` (e.g., `Clientes.js`, `Clientes.test.js`); always edit the `.tsx`/`.ts` version

**Functions / variables:**
- `camelCase` for functions, hooks, and locals: `crearBoleta`, `listarBoletas`, `cleanParams`, `useAuthStore`, `abrirEditar`, `setForm`
- Spanish names mirror backend domain language inside components (`busqueda`, `editando`, `guardar`, `eliminar`, `cerrarModal`)
- Constants `UPPER_SNAKE_CASE` (often Tailwind class blobs): `EMPTY_FORM`, `INPUT_CLS`, `LABEL_CLS`, `READONLY_CLS` (see `frontend/src/pages/Clientes.tsx`)

**Types/Interfaces:**
- `PascalCase` for interfaces and type aliases: `Boleta`, `BoletaLinea`, `BoletaCreatePayload`, `AuthState`, `FormData`
- API payload types use suffix conventions: `XxxCreatePayload`, `XxxPatchPayload`, `XxxListItem`, `XxxListFilters` (see `frontend/src/api/boletas.ts`)
- Domain string-literal unions are exported as named types: `BoletaTipoDte = '39' | '41'`, `BoletaEstado`, `BoletaDteEstado`, `BoletaMetodoPago`

**API field names:**
- API request/response payloads are `snake_case` because they pass through unchanged to the backend (`tipo_dte`, `cliente_id`, `precio_unitario`, `total_neto`). Do NOT camelCase inbound/outbound JSON fields.

## Code Style

**Formatting:**
- No `.prettierrc`, `.editorconfig`, `pyproject.toml`, `ruff.toml`, or `black` config exists. Formatting is enforced by convention only.
- Backend: 4-space indentation, double quotes for strings, ~100-char line guideline, trailing commas in multi-line function calls and dict/list literals
- Frontend: 2-space indentation, single quotes (`'foo'`), no semicolons in most React component files (`Clientes.tsx`, `BoletaNueva.tsx`), but `api/boletas.ts` uses semicolons. Do not "fix" semicolons across files — match the surrounding file's existing style.

**Linting:**
- Backend: no linter configured. `pytest.ini` has `addopts = -m "not smoke"` only
- Frontend: `npm run lint` is aliased to `tsc --noEmit` (TypeScript type check, no ESLint). `tsconfig.json` has `"strict": true`

## Import Organization

### Backend imports
Standard pattern in `backend/app/api/*.py`:

1. Stdlib (`from datetime import ...`, `from decimal import Decimal`, `from io import BytesIO`)
2. Third-party (`fastapi`, `sqlalchemy`, `pydantic`, `openpyxl`, `httpx`)
3. First-party absolute imports rooted at `app.`:
   ```python
   from app.api.deps import require_permission
   from app.models.cliente import Cliente
   from app.models.user import User
   from app.schemas.cliente import ClienteCreate, ClienteOut, ClienteUpdate
   ```
- No relative imports (`from .x import y`) — always absolute from `app.`
- `noqa: F401` is used for side-effect-only imports in `tests/conftest.py` (registers models with `Base.metadata`)

### Frontend imports
1. React/third-party (`react`, `react-router-dom`, `@tanstack/react-query`, `vitest`, `@testing-library/*`)
2. Local relative imports (`./Clientes`, `../lib/api`, `../stores/auth`, `../types`)
- No path aliases — all internal imports are relative (`../api/boletas`, `../lib/api`)
- `import type { ... }` used for type-only imports: `import type { Cliente, Empresa } from '../types'`

## Error Handling

### Backend — HTTPException everywhere

Routes raise `fastapi.HTTPException` with `status` constants from `fastapi.status`. Domain validation also raises `HTTPException` (with `422`), not custom exception classes.

```python
# backend/app/api/clientes.py
if not c:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
try:
    db.commit()
except IntegrityError:
    db.rollback()
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
```

**Status code conventions:**
- `201 HTTP_201_CREATED` — `POST /` creating a resource
- `204 HTTP_204_NO_CONTENT` — `DELETE`
- `401 HTTP_401_UNAUTHORIZED` — auth failures (see `backend/app/api/auth.py`)
- `403 HTTP_403_FORBIDDEN` — permission denied (see `require_permission` in `backend/app/api/deps.py`)
- `404 HTTP_404_NOT_FOUND` — resource not found (`"<Entidad> no encontrada/o"` in Spanish)
- `409 HTTP_409_CONFLICT` — uniqueness violations (`IntegrityError` → 409)
- `422` — domain/business validation (Pydantic validators or explicit `raise HTTPException(status_code=422, ...)`)
- `detail` strings are short Spanish phrases: `"Cliente no encontrado"`, `"RUT ya registrado"`, `"Sin permisos"`

**Transactions:** always `db.rollback()` inside the `except` before raising the HTTPException. Never leave a session in a broken state.

### Pydantic validation
Use `@field_validator` with `@classmethod` for input normalization and rejection:

```python
# backend/app/schemas/boleta.py
@field_validator("patente_vehiculo")
@classmethod
def normalizar_patente(cls, v: str | None) -> str | None:
    return _normalizar_patente(v)

@field_validator("lineas")
@classmethod
def lineas_no_vacias(cls, v: list[BoletaLineaCreate]) -> list[BoletaLineaCreate]:
    if not v:
        raise ValueError("Boleta requiere al menos una línea")
    return v
```
Pydantic `ValueError` automatically becomes a 422 response.

### Frontend — surface backend `detail`
React Query `onError` extracts FastAPI's `detail` field; never display raw `error.message`:

```typescript
// frontend/src/pages/Clientes.tsx
onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
```

The axios interceptor in `frontend/src/lib/api.ts` handles the 401 → refresh-token → retry flow; component-level code never deals with 401s directly.

## Logging

**Backend:** `loguru` (configured in `backend/app/core/logging.py`, bootstrapped from `app/main.py` via `configure_logging()`). Sentry integration via `init_sentry()` and `RequestLoggerMiddleware` produces structured access logs with a request_id.

**Frontend:** `@sentry/react` is installed and configured in `frontend/src/sentry.ts`. `console.*` is used sparingly; avoid scattering `console.log` in production component code.

## Comments

- Spanish business comments are accepted and common: `# En boleta, precio se ingresa bruto`, `// tipo 41 fuerza exenta=true en todas las líneas existentes`
- Use `# TODO(<ticket>):` to tag work-in-progress: `// TODO(W1-04): integrar autocomplete de productos` (see `frontend/src/pages/BoletaNueva.tsx`)
- Section dividers use box-drawing chars: `# ── Factura DTE ────` (see `backend/app/api/dte.py`)
- Multi-line docstrings reserved for non-obvious behavior or invariants (e.g., `BoletaUpdate` "Solo metadata accesoria. Sin líneas, sin totales, sin tipo_dte." in `backend/app/schemas/boleta.py`)
- No JSDoc / TSDoc on the frontend

## Function Design

**Backend route handlers** follow this consistent shape:

```python
# backend/app/api/clientes.py
@router.post("/", response_model=ClienteOut, status_code=status.HTTP_201_CREATED)
def crear_cliente(
    body: ClienteCreate,
    perms: tuple[User, Session] = require_permission("clientes", "create"),
):
    _, db = perms                              # unpack (current_user, db) from dep
    cliente = Cliente(**body.model_dump())     # build model from validated body
    db.add(cliente)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(cliente)
    return cliente
```

Key points:
- Permission check is a typed dependency: `perms: tuple[User, Session] = require_permission(<module>, <action>)`
- Discard user with `_, db = perms` when only the session is needed; use `current_user, db = perms` when ownership/audit is needed
- `body.model_dump(exclude_unset=True)` for PATCH endpoints (partial updates)
- For PUT/PATCH with FK changes, validate FK existence before assignment
- Return SQLAlchemy instances directly; FastAPI serializes via `response_model` + `from_attributes=True`

**Frontend components**:
- Single default export per page/component file (`export default function Clientes()`)
- Hooks at top, helpers (`abrirCrear`, `cerrarModal`) right after, mutations next, JSX last
- React Query: `useQuery({ queryKey, queryFn, placeholderData: keepPreviousData })`. Use `useMutation` with `onSuccess`/`onError` and call `qc.invalidateQueries({ queryKey: [...] })` to refresh

## Module Design

**Backend exports:**
- Each `app/api/*.py` exposes a module-level `router = APIRouter()` and is wired up in `backend/app/main.py` with `app.include_router(<module>.router, prefix="/api/<resource>", tags=["<resource>"])`
- Models: one class per file, registered with `Base` from `app/database.py`. Tests must import each model file in `conftest.py` to register its mapper before `Base.metadata.create_all()`
- No barrel `__init__.py` re-exports — import the concrete module path

**Frontend exports:**
- Pages: single `export default function PageName()` per file
- API clients (`frontend/src/api/*.ts`): named exports for every function (`export async function listarBoletas`, `export async function crearBoleta`); also export interface/type definitions used by callers
- Stores: named export of the hook (`export const useAuthStore`)
- No barrel files

## Permissions Model (cross-cutting)

Module + action pairs from `backend/app/core/permissions.py`:

- Modules: `catalogo`, `clientes`, `proveedores`, `empresas`, `cotizaciones`, `nota_venta`, `facturas`, `boletas`, `ordenes_compra`, `inventario`, `rrhh`, `dashboard`, `usuarios`, `tareas`
- Actions: `view`, `create`, `edit`, `delete`, `view_all`, `admin`
- Roles: `admin` (full), `subadmin`, `vendedor` (limited)

Every protected backend route MUST declare permission via:
```python
perms: tuple[User, Session] = require_permission("<module>", "<action>")
```

---

*Convention analysis: 2026-04-25*
