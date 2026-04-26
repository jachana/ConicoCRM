# Testing Patterns

**Analysis Date:** 2026-04-25

This codebase has two test suites: pytest (backend, 61 test files) and vitest (frontend, 14 test files). The two stacks are independent — there is no shared test runner.

## Test Framework

### Backend
- **Runner:** `pytest==8.3.3` with `pytest-asyncio==0.24.0` (see `backend/requirements.txt`)
- **HTTP client:** `httpx` via `fastapi.testclient.TestClient`
- **DB:** in-process SQLite (`sqlite:///./test.db`) created/dropped per test via `setup_test_db` fixture
- **Time:** `freezegun==1.5.1` available for time-sensitive tests
- **Config:** `backend/pytest.ini`
  ```ini
  [pytest]
  addopts = -m "not smoke"
  markers =
      smoke: pruebas de integración contra stack Docker en ejecución (requiere docker compose up)
  ```
- **HTML report runner:** `backend/run_tests.sh` writes timestamped reports to `backend/test-reports/` and copies to `report_latest.html`

### Frontend
- **Runner:** `vitest==^2.1.1` with `jsdom==^25.0.0`
- **Library:** `@testing-library/react@^16.0.1`, `@testing-library/jest-dom@^6.5.0`, `@testing-library/user-event@^14.5.2`
- **Config:** `frontend/vite.config.ts`
  ```ts
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  }
  ```
- **Globals enabled:** `describe`, `it`, `expect` resolve without import, but tests still import them explicitly (`import { describe, expect, it, vi } from 'vitest'`)

**Run Commands:**
```bash
# Backend
cd backend && pytest tests/                       # all non-smoke
cd backend && pytest tests/test_clientes.py -v    # single file
cd backend && ./run_tests.sh -k boleta            # keyword filter, generates HTML report
cd backend && ./run_tests.sh --smoke              # include smoke tests

# Frontend
cd frontend && npm test                           # vitest watch mode
cd frontend && npm test -- --run                  # one-shot
cd frontend && npm run lint                       # tsc --noEmit (no separate ESLint)
```

No coverage tooling is configured on either side (no `pytest-cov`, no `@vitest/coverage-*`).

## Test File Organization

### Backend
- All tests live flat under `backend/tests/`
- One file per resource/feature, mirroring the `app/api/` layout: `test_clientes.py`, `test_boletas.py`, `test_dte_service.py`, `test_dte_tasks.py`, `test_chain_locking.py`
- Test functions are `snake_case` Spanish, descriptive of the behavior:
  ```python
  def test_vendedor_no_puede_eliminar_cliente(client, vendedor_token): ...
  def test_post_boleta_41_con_linea_afecta_falla(...): ...
  def test_sync_rechazada_revierte_stock_y_anula_boleta(db): ...
  ```

### Frontend
- Tests sit alongside the source under test:
  - Pages: `src/pages/Clientes.tsx` ↔ `src/pages/Clientes.test.tsx`
  - Stores: `src/stores/auth.ts` ↔ `src/stores/auth.test.ts`
- Cross-cutting tests in `src/__tests__/`: `GlobalSearchModal.test.tsx`, `useGlobalShortcut.test.tsx`
- Some legacy `.test.js` siblings exist next to the canonical `.test.tsx` (e.g., `Clientes.test.js`); only edit the `.tsx` version
- Test names are Spanish, behavior-focused:
  ```ts
  it('emite boleta anónima con una línea', async () => { ... })
  it('forza exenta cuando tipo_dte es 41', async () => { ... })
  it('filtra por patente al escribir', async () => { ... })
  ```

## Test Structure

### Backend — function-style with fixtures
No `class TestX:` containers. Each test is a top-level function whose first parameters are the fixtures it needs:

```python
# backend/tests/test_clientes.py
def test_crear_cliente(client, admin_token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Empresa ABC Ltda.", "rut": "76.543.210-K"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Empresa ABC Ltda."
```

Pattern: arrange (json body), act (HTTP call with auth header), assert (`status_code` first, then JSON shape).

### Frontend — Vitest + Testing Library

```tsx
// frontend/src/pages/Clientes.test.tsx
describe('Clientes', () => {
  it('muestra lista de clientes', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: [{ ... }] })
    wrap(<Clientes />)
    await waitFor(() => expect(screen.getAllByText('Empresa XYZ Ltda.')[0]).toBeInTheDocument())
  })
})
```

A local `wrap()` helper is defined per test file to provide the providers the component needs (`QueryClientProvider`, `MemoryRouter`):

```tsx
function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Routes><Route path="/" element={ui} /></Routes></MemoryRouter>
    </QueryClientProvider>
  )
}
```

Always disable React Query retries in tests: `defaultOptions: { queries: { retry: false } }`.

## Mocking

### Backend — `unittest.mock.patch` and `MagicMock`
- Patch external integrations at the import site (where the symbol is *used*, not where it's defined):
  ```python
  # backend/tests/test_boletas.py
  @patch("app.api.boletas.emit_dte")
  def test_post_boleta_anonima_crea_emision(mock_emit, client, admin_token):
      ...
      mock_emit.delay.assert_called_once()
  ```
- For HTTP integrations, patch `httpx.post` / `httpx.get` and return a `MagicMock` with `.status_code`, `.json.return_value`, and `.raise_for_status`:
  ```python
  # backend/tests/test_dte_service.py
  mock_response = MagicMock()
  mock_response.status_code = 200
  mock_response.json.return_value = {"track_id": "TR123", "folio": 42}
  mock_response.raise_for_status = MagicMock()
  with patch("httpx.post", return_value=mock_response):
      result = svc.emit({"tipo_dte": 33, "receptor": {}})
  ```
- For Celery tasks: assert `mock_emit.delay.assert_called_once()` rather than executing the task body
- `weasyprint` is mocked globally in `tests/conftest.py` because its native libs are not installed on Windows dev:
  ```python
  _weasyprint_mock = MagicMock()
  _weasyprint_mock.HTML.return_value.write_pdf.return_value = b"%PDF-1.4 mock"
  sys.modules.setdefault("weasyprint", _weasyprint_mock)
  ```

### Frontend — `vi.mock` and `vi.hoisted`

**Pattern A — module-level mock with `vi.mock`** (top of file, before importing the component):
```tsx
// frontend/src/pages/BoletaNueva.test.tsx
vi.mock('../api/boletas', () => ({
  crearBoleta: vi.fn().mockResolvedValue({ id: 99, numero: 1, total: '1190' }),
}))
import BoletaNueva from './BoletaNueva'
import { crearBoleta } from '../api/boletas'
```

**Pattern B — `vi.hoisted` for shared mock state across the file:**
```tsx
// frontend/src/pages/BoletasList.test.tsx
const { mockList } = vi.hoisted(() => ({
  mockList: vi.fn().mockResolvedValue([{ id: 1, numero: 100, ... }]),
}))
vi.mock('../api/boletas', () => ({
  listarBoletas: mockList,
  exportarBoletasExcel: vi.fn(),
  pdfBoletaUrl: (id: number) => `/api/boletas/${id}/pdf`,
  ...
}))
```

**Pattern C — mock the axios instance via `lib/api`** (used when components call `api.get/post/patch/delete` directly):
```tsx
// frontend/src/pages/Clientes.test.tsx
vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: any) => fn ? fn({ user: { role: 'admin' } }) : { user: { role: 'admin' } },
}))
```

**What to mock:**
- API modules (`../api/boletas`, `../lib/api`)
- Auth store when role-gated UI is involved
- External integrations (Lioren via `httpx`, Celery via `.delay`)

**What NOT to mock:**
- React Query — use a real `QueryClient` with retries off
- Router — use `MemoryRouter` from `react-router-dom`
- The component under test or its child components (test the rendered tree)
- The database (use the in-memory SQLite test DB)

## Fixtures

All backend fixtures are defined in `backend/tests/conftest.py`. Use them by name; do not redefine.

### Database
- `setup_test_db` *(autouse)*: imports every model module so SQLAlchemy registers its mappers, then `Base.metadata.drop_all()` + `create_all()` for a clean schema each test
- `db`: yields an open `Session` from the `TestingSession` sessionmaker; closes it on teardown
- `_audit_disabled_by_default` *(autouse)*: globally disables audit listeners by setting `info={"audit_disabled": True}` on the sessionmaker so flushes do not emit `audit_logs` rows. Tests asserting `session.dirty` size or row counts depend on this default.

### Audit opt-in
- `audit_enabled`: re-enables audit listeners for a single test by clearing `info`. Use only in `test_auditoria.py` and any test that explicitly verifies audit behavior

### HTTP client
- `client`: `TestClient(app)` with `get_db` overridden to use `TestingSession`. The override is registered on entry and popped on teardown

### Auth tokens (per role)
- `admin_user` / `admin_token` — `admin@conico.cl`, password `secret123`
- `subadmin_user` / `subadmin_token` — `subadmin@conico.cl`
- `vendedor_user` / `vendedor_token` — `vendedor@conico.cl`

Each `*_token` fixture POSTs to `/api/auth/login` with OAuth2 password form (`data={"username": ..., "password": ...}`, NOT `json=`) and returns the `access_token` string.

Standard usage:
```python
def test_actualizar_cliente(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/api/clientes/", json={"nombre": "Viejo"}, headers=headers)
```

### Domain seed fixtures
- `cliente_demo`: a `Cliente(nombre="Cliente Demo")`
- `empresa_demo`: an `Empresa(nombre="Empresa Demo")`

Both commit and refresh through their own session, then close it before yielding the row.

### Per-test helpers (NOT fixtures)
Each test file defines small `_make_*` / `_create_*` helpers near the top to construct domain objects via the API:

```python
# backend/tests/test_chain_locking.py
def _make_cliente(client, token):
    r = client.post("/api/clientes/", json={"nombre": "Lock Test Cliente"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()["id"]
```

```python
# backend/tests/test_boletas.py — randomized SKU to avoid IntegrityError across tests
def _create_producto(client, admin_token):
    r = client.post("/api/productos/", json={
        "nombre": "Prod Boleta",
        "sku": f"SKU-BOL-{random.randint(10000, 99999)}",
        ...
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201, r.text  # include r.text in the message for debug
    return r.json()
```

When creating products inside tests, **randomize SKU** (`random.randint(10000, 99999)`) to avoid `UniqueConstraint` collisions if the schema is reused.

### Frontend setup
- `frontend/src/test-setup.ts` is loaded via vitest `setupFiles`. It:
  - Imports `@testing-library/jest-dom`
  - Polyfills `globalThis.ResizeObserver` (cmdk uses it; jsdom does not implement it)
  - Stubs `window.HTMLElement.prototype.scrollIntoView` to a no-op (cmdk uses it for keyboard nav)
- No frontend equivalent of `conftest.py`. Per-file mocks and `wrap()` helpers are duplicated across test files by design.

## Coverage

No coverage thresholds enforced. To add ad-hoc:
```bash
# backend
pip install pytest-cov && pytest tests/ --cov=app --cov-report=html

# frontend
npm i -D @vitest/coverage-v8 && npm test -- --coverage
```

## Test Types

**Unit (no DB):**
- Pure logic on services and tasks (`backend/tests/test_dte_service.py`, `test_dte_tasks.py` for `_lioren_to_estado`)
- Frontend store tests (`frontend/src/stores/auth.test.ts`)

**Integration (in-memory SQLite):**
- All backend route tests use `client` + `*_token`, exercising the full FastAPI stack (auth → permissions → router → SQLAlchemy → SQLite). This is the dominant test type — most files in `backend/tests/` are integration tests.

**Component (jsdom):**
- Frontend page/component tests render the component with mocked API and assert on rendered DOM (`screen.getByText`, `screen.findByPlaceholderText`)

**Smoke (excluded by default):**
- Marked `@pytest.mark.smoke`; require `docker compose up` and a live stack. Run with `./run_tests.sh --smoke`

**E2E:** Not configured. No Playwright / Cypress.

## Common Patterns

### Async testing
Frontend uses `await waitFor(...)` and `await screen.findByText(...)` rather than fixed delays:
```tsx
await waitFor(() => expect(crearBoleta).toHaveBeenCalled())
const payload = (crearBoleta as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
expect(payload.tipo_dte).toBe('39')
```

### Asserting payload shape sent to API
After interaction, inspect the captured mock call arguments:
```tsx
const payload = (crearBoleta as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
expect(payload.lineas).toHaveLength(1)
expect(payload.lineas[0].descripcion).toBe('Producto X')
```

### Error testing (backend)
Assert the status code first, then the `detail`:
```python
def test_crear_cliente_rut_duplicado(client, admin_token):
    client.post("/api/clientes/", json={"nombre": "A", "rut": "99.000.001-1"},
                headers={"Authorization": f"Bearer {admin_token}"})
    r = client.post("/api/clientes/", json={"nombre": "B", "rut": "99.000.001-1"},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409
```

### Permission/role testing
Use the corresponding `*_token` fixture and assert 401/403:
```python
def test_listar_sin_autenticacion(client):
    r = client.get("/api/clientes/")
    assert r.status_code == 401

def test_vendedor_no_puede_eliminar_cliente(client, vendedor_token):
    ...
    assert r2.status_code == 403
```

### Domain reflection (DB assertions)
For side effects beyond the HTTP response, query the DB through the `db` fixture:
```python
# backend/tests/test_boletas.py
from app.models.movimiento_inventario import MovimientoInventario
movs = db.query(MovimientoInventario).filter_by(referencia_tipo="boleta", referencia_id=boleta_id).all()
assert len(movs) == 1
assert movs[0].signo == -1
```

### Service-level tests (no HTTP)
Operate on models directly via `db` fixture, then call the service function and inspect the resulting rows:
```python
# backend/tests/test_boleta_stock.py
b = Boleta(numero=200, fecha=date.today(), tipo_dte="39", vendedor_id=1, metodo_pago="efectivo")
b.lineas = [BoletaLinea(orden=0, ..., producto_id=p1.id, cantidad=Decimal("3"), ...)]
db.add(b); db.flush()
descontar_stock_boleta(db, b, usuario_id=1)
db.flush()
movs = db.query(MovimientoInventario).filter_by(referencia_tipo="boleta", referencia_id=b.id).all()
assert all(m.signo == -1 for m in movs)
```

### Resetting Zustand store between tests
```ts
// frontend/src/stores/auth.test.ts
beforeEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
  localStorage.clear()
})
```

---

*Testing analysis: 2026-04-25*
