# Conico Codebase Map

## Backend (FastAPI + SQLAlchemy + Alembic)

**Add a new endpoint:**
- Router: `backend/app/api/<resource>.py` — follow pattern in `empleados.py`
- Model: `backend/app/models/<resource>.py` — SQLAlchemy ORM, add import to `backend/app/models/__init__.py`
- Schema: `backend/app/schemas/<resource>.py` — Pydantic v2
- Register router in `backend/app/main.py` with `app.include_router(...)`
- RBAC: use `require_permission("module", "action")` from `backend/app/api/deps.py`

**DB migration:**
```
cd backend && alembic revision --autogenerate -m "description"
cd backend && alembic upgrade head
```
- Verify single head after: `alembic heads` (must show exactly one)
- Model must be imported in `migrations/env.py` or autogenerate won't see it

**Tests:** `backend/tests/test_<resource>.py` — use `TestClient` + `conftest.py` fixtures

## Frontend (React + Vite + TypeScript + Zustand)

**Add a new page:**
- Page: `frontend/src/pages/<Resource>.tsx` — follow pattern in `Clientes.tsx`
- API calls: `frontend/src/api/<resource>.ts` — import `api` from `../lib/api`
- Route: add to `frontend/src/App.tsx`

**Shared API client:** `frontend/src/lib/api.ts` — axios instance with auto Bearer token injection and 401 refresh

**UI components:** import from `frontend/src/components/ui/` — use `Modal` (not Dialog), `danger` variant (not destructive)

**State:** Zustand stores in `frontend/src/stores/`

**Icons:** import from `lucide-react` directly

**Tests:** colocated `.test.tsx` files — vitest + React Testing Library; test-setup at `frontend/src/test-setup.ts`

## Key conventions
- Spanish variable/comment names throughout
- RUT validation via `backend/app/utils/rut.py`
- Encoding: always `encoding='utf-8'` on file/subprocess I/O
- `unaccent_ilike` from `backend/app/utils/search.py` for search queries
