# Empresa Debt View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stats bar (total debt, vencida, company count) and three new columns (Deuda, Vencida, Lím. Crédito) to the Empresas page, with sort-by-debt and a "Con Deuda" filter.

**Architecture:** New `GET /api/empresas/deuda-bulk` endpoint computes per-company debt and vencida in a single backend call. Frontend fires this in parallel with the existing company list, merges by `empresa_id`, and renders the enriched table with client-side sort and filter.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + React Query + TypeScript (frontend), pytest (tests), Tailwind CSS (styles)

---

## File Map

| File | Change |
|------|--------|
| `backend/app/schemas/empresa.py` | Add `EmpresaDeudaBulkItem` schema |
| `backend/app/api/empresas.py` | Add `GET /deuda-bulk` endpoint |
| `backend/tests/test_empresas.py` | Add tests for `/deuda-bulk` |
| `frontend/src/types/index.ts` | Add `DeudaBulkItem` interface |
| `frontend/src/pages/Empresas.tsx` | Stats bar, new columns, sort, filter |

---

## Task 1: Add `EmpresaDeudaBulkItem` schema

**Files:**
- Modify: `backend/app/schemas/empresa.py`

- [ ] **Step 1: Add schema at end of file**

Open `backend/app/schemas/empresa.py` and append:

```python
class EmpresaDeudaBulkItem(BaseModel):
    empresa_id: int
    nombre: str
    plazo_credito: str | None
    limite_credito: Decimal | None
    deuda_total: Decimal
    deuda_vencida: Decimal
```

- [ ] **Step 2: Export from the import line in `empresas.py`**

In `backend/app/api/empresas.py`, line 14, add `EmpresaDeudaBulkItem` to the import:

```python
from app.schemas.empresa import EmpresaCreate, EmpresaDeudaOut, EmpresaCreditoOut, EmpresaOut, EmpresaUpdate, FacturaResumen, EmpresaDeudaBulkItem
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/empresa.py backend/app/api/empresas.py
git commit -m "feat: add EmpresaDeudaBulkItem schema"
```

---

## Task 2: Write failing tests for `/deuda-bulk`

**Files:**
- Modify: `backend/tests/test_empresas.py`

- [ ] **Step 1: Add helper at top of test file**

Add these helpers after the existing imports at the top of `backend/tests/test_empresas.py`:

```python
import datetime


def _create_cliente_bulk(client, admin_token, empresa_id=None):
    payload = {"nombre": "Cliente Bulk Test", "rut": "22.222.222-2"}
    if empresa_id:
        payload["empresa_id"] = empresa_id
    r = client.post("/api/clientes/", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201
    return r.json()["id"]


def _create_factura_bulk(client, admin_token, cliente_id, empresa_id, total_neto=10000,
                          fecha_vencimiento=None, fecha=None):
    payload = {
        "cliente_id": cliente_id,
        "empresa_id": empresa_id,
        "lineas": [{"orden": 0, "descripcion": "Item", "cantidad": 1, "valor_neto": total_neto}],
    }
    if fecha_vencimiento:
        payload["fecha_vencimiento"] = fecha_vencimiento
    if fecha:
        payload["fecha"] = fecha
    r = client.post("/api/facturas/", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201, r.text
    return r.json()
```

- [ ] **Step 2: Add test cases**

Append these tests to `backend/tests/test_empresas.py`:

```python
def test_deuda_bulk_lista_vacia(client, admin_token):
    r = client.get("/api/empresas/deuda-bulk", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json() == []


def test_deuda_bulk_empresa_sin_facturas(client, admin_token):
    emp = client.post(
        "/api/empresas/",
        json={"nombre": "Emp Bulk", "plazo_credito": "30 Dias", "limite_credito": 5000000},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    r = client.get("/api/empresas/deuda-bulk", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    items = r.json()
    item = next(i for i in items if i["empresa_id"] == emp["id"])
    assert float(item["deuda_total"]) == 0
    assert float(item["deuda_vencida"]) == 0
    assert item["plazo_credito"] == "30 Dias"
    assert float(item["limite_credito"]) == 5000000


def test_deuda_bulk_con_factura_sin_pagar(client, admin_token):
    emp = client.post(
        "/api/empresas/", json={"nombre": "Emp Deudora"}, headers={"Authorization": f"Bearer {admin_token}"}
    ).json()
    cid = _create_cliente_bulk(client, admin_token, emp["id"])
    _create_factura_bulk(client, admin_token, cid, emp["id"], total_neto=10000)
    r = client.get("/api/empresas/deuda-bulk", headers={"Authorization": f"Bearer {admin_token}"})
    item = next(i for i in r.json() if i["empresa_id"] == emp["id"])
    # 10000 neto * 1.19 IVA = 11900
    assert float(item["deuda_total"]) == pytest.approx(11900.0)
    assert float(item["deuda_vencida"]) == 0  # no fecha_vencimiento and plazo is None


def test_deuda_bulk_vencida_por_fecha_vencimiento(client, admin_token):
    emp = client.post(
        "/api/empresas/", json={"nombre": "Emp Vencida"}, headers={"Authorization": f"Bearer {admin_token}"}
    ).json()
    cid = _create_cliente_bulk(client, admin_token, emp["id"])
    past_date = (datetime.date.today() - datetime.timedelta(days=10)).isoformat()
    _create_factura_bulk(client, admin_token, cid, emp["id"], total_neto=5000, fecha_vencimiento=past_date)
    r = client.get("/api/empresas/deuda-bulk", headers={"Authorization": f"Bearer {admin_token}"})
    item = next(i for i in r.json() if i["empresa_id"] == emp["id"])
    # 5000 neto * 1.19 = 5950
    assert float(item["deuda_total"]) == pytest.approx(5950.0)
    assert float(item["deuda_vencida"]) == pytest.approx(5950.0)


def test_deuda_bulk_vencida_por_plazo(client, admin_token):
    emp = client.post(
        "/api/empresas/", json={"nombre": "Emp Plazo Vencido", "plazo_credito": "30 Dias"},
        headers={"Authorization": f"Bearer {admin_token}"}
    ).json()
    cid = _create_cliente_bulk(client, admin_token, emp["id"])
    old_date = (datetime.date.today() - datetime.timedelta(days=60)).isoformat()
    _create_factura_bulk(client, admin_token, cid, emp["id"], total_neto=3000, fecha=old_date)
    r = client.get("/api/empresas/deuda-bulk", headers={"Authorization": f"Bearer {admin_token}"})
    item = next(i for i in r.json() if i["empresa_id"] == emp["id"])
    # 60 days old, 30-day plazo → vencida
    assert float(item["deuda_vencida"]) == pytest.approx(3570.0)  # 3000 * 1.19


def test_deuda_bulk_no_vencida_si_plazo_especial(client, admin_token):
    emp = client.post(
        "/api/empresas/", json={"nombre": "Emp Especial", "plazo_credito": "Especial"},
        headers={"Authorization": f"Bearer {admin_token}"}
    ).json()
    cid = _create_cliente_bulk(client, admin_token, emp["id"])
    _create_factura_bulk(client, admin_token, cid, emp["id"], total_neto=2000)
    r = client.get("/api/empresas/deuda-bulk", headers={"Authorization": f"Bearer {admin_token}"})
    item = next(i for i in r.json() if i["empresa_id"] == emp["id"])
    assert float(item["deuda_total"]) == pytest.approx(2380.0)
    assert float(item["deuda_vencida"]) == 0  # Especial + no fecha_vencimiento → skip


def test_deuda_bulk_factura_anulada_no_cuenta(client, admin_token):
    emp = client.post(
        "/api/empresas/", json={"nombre": "Emp Anulada"}, headers={"Authorization": f"Bearer {admin_token}"}
    ).json()
    cid = _create_cliente_bulk(client, admin_token, emp["id"])
    f = _create_factura_bulk(client, admin_token, cid, emp["id"], total_neto=10000)
    # Anular la factura
    client.patch(
        f"/api/facturas/{f['id']}",
        json={"estado": "anulada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r = client.get("/api/empresas/deuda-bulk", headers={"Authorization": f"Bearer {admin_token}"})
    item = next(i for i in r.json() if i["empresa_id"] == emp["id"])
    assert float(item["deuda_total"]) == 0


def test_deuda_bulk_sin_auth(client):
    r = client.get("/api/empresas/deuda-bulk")
    assert r.status_code == 401
```

- [ ] **Step 3: Run tests — expect FAIL (endpoint doesn't exist yet)**

```bash
cd backend && python -m pytest tests/test_empresas.py::test_deuda_bulk_lista_vacia -v
```

Expected: `FAILED` with 404 or "not found" error.

---

## Task 3: Implement `GET /api/empresas/deuda-bulk`

**Files:**
- Modify: `backend/app/api/empresas.py`

- [ ] **Step 1: Add endpoint before the parameterized routes**

In `backend/app/api/empresas.py`, insert the new endpoint **after** the `listar_empresas` GET `/` function (after line 55) and **before** `crear_empresa` POST `/`, so it is defined before any `/{empresa_id}` routes.

Add this block after `listar_empresas`:

```python
@router.get("/deuda-bulk", response_model=list[EmpresaDeudaBulkItem])
def deuda_bulk(
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    from datetime import date, timedelta
    from decimal import Decimal as D

    _, db = perms
    today = date.today()

    def _plazo_dias(plazo: str | None) -> int | None:
        if plazo == "30 Dias":
            return 30
        if plazo == "60 Dias":
            return 60
        if plazo == "90 Dias":
            return 90
        if plazo == "Al contado":
            return 0
        return None

    empresas = db.query(Empresa).order_by(Empresa.nombre).all()
    result = []
    for e in empresas:
        facturas = (
            db.query(Factura)
            .filter(Factura.empresa_id == e.id, Factura.estado != "anulada")
            .all()
        )
        deuda_total = D("0")
        deuda_vencida = D("0")
        dias = _plazo_dias(e.plazo_credito)

        for f in facturas:
            pendiente = f.total - (f.monto_pagado or D("0"))
            if pendiente <= 0:
                continue
            deuda_total += pendiente

            if f.fecha_vencimiento:
                due_date = f.fecha_vencimiento
            elif dias is not None:
                due_date = f.fecha + timedelta(days=dias)
            else:
                continue

            if due_date < today:
                deuda_vencida += pendiente

        result.append(
            EmpresaDeudaBulkItem(
                empresa_id=e.id,
                nombre=e.nombre,
                plazo_credito=e.plazo_credito,
                limite_credito=e.limite_credito,
                deuda_total=deuda_total,
                deuda_vencida=deuda_vencida,
            )
        )
    return result
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
cd backend && python -m pytest tests/test_empresas.py -k "deuda_bulk" -v
```

Expected output:
```
test_deuda_bulk_lista_vacia PASSED
test_deuda_bulk_empresa_sin_facturas PASSED
test_deuda_bulk_con_factura_sin_pagar PASSED
test_deuda_bulk_vencida_por_fecha_vencimiento PASSED
test_deuda_bulk_vencida_por_plazo PASSED
test_deuda_bulk_no_vencida_si_plazo_especial PASSED
test_deuda_bulk_factura_anulada_no_cuenta PASSED
test_deuda_bulk_sin_auth PASSED
```

- [ ] **Step 3: Run full empresas test suite to check no regressions**

```bash
cd backend && python -m pytest tests/test_empresas.py -v
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/empresas.py backend/tests/test_empresas.py
git commit -m "feat: add GET /api/empresas/deuda-bulk endpoint with vencida logic"
```

---

## Task 4: Add `DeudaBulkItem` type to frontend

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add interface after the `Empresa` interface**

In `frontend/src/types/index.ts`, after the closing `}` of the `Empresa` interface, add:

```ts
export interface DeudaBulkItem {
  empresa_id: number
  nombre: string
  plazo_credito: string | null
  limite_credito: number | null
  deuda_total: number
  deuda_vencida: number
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add DeudaBulkItem type"
```

---

## Task 5: Update `Empresas.tsx` with stats bar, sort, filter, and new columns

**Files:**
- Modify: `frontend/src/pages/Empresas.tsx`

- [ ] **Step 1: Update import line to include `DeudaBulkItem`**

Change line 4 from:
```ts
import type { Empresa, EmpresaDeuda } from '../types'
```
to:
```ts
import type { Empresa, EmpresaDeuda, DeudaBulkItem } from '../types'
```

- [ ] **Step 2: Add new state and queries inside the `Empresas` component**

After the existing `deudaData` query (around line 50), add:

```ts
const { data: deudaBulk = [] } = useQuery<DeudaBulkItem[]>({
  queryKey: ['empresas-deuda-bulk'],
  queryFn: () => api.get('/api/empresas/deuda-bulk').then(r => r.data),
})

const deudaMap = new Map<number, DeudaBulkItem>(
  deudaBulk.map(d => [d.empresa_id, d])
)

const [sortField, setSortField] = useState<'deuda_total' | 'deuda_vencida' | 'nombre'>('deuda_total')
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
const [filterConDeuda, setFilterConDeuda] = useState(false)
```

- [ ] **Step 3: Add computed stats and display list**

After the state declarations (before `abrirCrear`), add:

```ts
const totalDeuda = deudaBulk.reduce((s, d) => s + Number(d.deuda_total), 0)
const totalVencida = deudaBulk.reduce((s, d) => s + Number(d.deuda_vencida), 0)
const empresasConDeuda = deudaBulk.filter(d => Number(d.deuda_total) > 0).length

function toggleSort(field: 'deuda_total' | 'deuda_vencida' | 'nombre') {
  if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
  else { setSortField(field); setSortDir('desc') }
}

const displayEmpresas = [...empresas]
  .filter(e => !filterConDeuda || (deudaMap.get(e.id)?.deuda_total ?? 0) > 0)
  .sort((a, b) => {
    const da = deudaMap.get(a.id)
    const db2 = deudaMap.get(b.id)
    let va: number, vb: number
    if (sortField === 'nombre') {
      va = 0; vb = 0
      const cmp = a.nombre.localeCompare(b.nombre)
      return sortDir === 'asc' ? cmp : -cmp
    }
    va = Number(da?.[sortField] ?? 0)
    vb = Number(db2?.[sortField] ?? 0)
    return sortDir === 'asc' ? va - vb : vb - va
  })
```

- [ ] **Step 4: Add the currency formatter helper**

After the `displayEmpresas` block, add:

```ts
function fmt(n: number) {
  return '$' + n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
```

- [ ] **Step 5: Add stats bar + filter toggle to JSX**

Replace the existing search `<input>` block (lines 120–126):

```tsx
<input
  type="text"
  placeholder="Buscar por nombre o RUT..."
  value={busqueda}
  onChange={e => setBusqueda(e.target.value)}
  className="mb-4 w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
/>
```

with:

```tsx
{/* Stats bar */}
<div className="grid grid-cols-3 gap-3 mb-4">
  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Deuda Total</p>
    <p className="text-lg font-semibold text-red-500">{fmt(totalDeuda)}</p>
    <p className="text-xs text-gray-400 mt-0.5">en {empresasConDeuda} empresa{empresasConDeuda !== 1 ? 's' : ''}</p>
  </div>
  <div className={`bg-white dark:bg-gray-900 rounded-xl border p-4 ${totalVencida > 0 ? 'border-red-300 dark:border-red-800' : 'border-gray-200 dark:border-gray-800'}`}>
    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Deuda Vencida</p>
    <p className={`text-lg font-semibold ${totalVencida > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>{fmt(totalVencida)}</p>
    {totalVencida > 0 && <p className="text-xs text-red-400 mt-0.5">requiere atención</p>}
  </div>
  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Empresas con Deuda</p>
    <p className="text-lg font-semibold text-gray-900 dark:text-white">{empresasConDeuda} / {deudaBulk.length}</p>
  </div>
</div>

{/* Search + filter */}
<div className="flex gap-3 mb-4 items-center">
  <input
    type="text"
    placeholder="Buscar por nombre o RUT..."
    value={busqueda}
    onChange={e => setBusqueda(e.target.value)}
    className="w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
  />
  <button
    onClick={() => setFilterConDeuda(f => !f)}
    className={`px-3 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
      filterConDeuda
        ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400'
        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
    }`}
  >
    {filterConDeuda ? '✕ Con Deuda' : 'Con Deuda'}
  </button>
</div>
```

- [ ] **Step 6: Replace table head with sortable columns**

Replace the `<thead>` block (lines 130–139):

```tsx
<thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
  <tr>
    <th className="text-left px-4 py-3 font-medium">Nombre</th>
    <th className="text-left px-4 py-3 font-medium">Razón Social</th>
    <th className="text-left px-4 py-3 font-medium">RUT</th>
    <th className="text-left px-4 py-3 font-medium">Forma Pago</th>
    <th className="text-left px-4 py-3 font-medium">Prioridad</th>
    <th className="text-left px-4 py-3 font-medium">Sector</th>
    <th className="text-left px-4 py-3 font-medium" />
  </tr>
</thead>
```

with:

```tsx
<thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
  <tr>
    <th
      className="text-left px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
      onClick={() => toggleSort('nombre')}
    >
      Nombre {sortField === 'nombre' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
    <th className="text-left px-4 py-3 font-medium">Razón Social</th>
    <th className="text-left px-4 py-3 font-medium">RUT</th>
    <th className="text-left px-4 py-3 font-medium">Forma Pago</th>
    <th className="text-left px-4 py-3 font-medium">Prioridad</th>
    <th className="text-left px-4 py-3 font-medium">Sector</th>
    <th
      className="text-right px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
      onClick={() => toggleSort('deuda_total')}
    >
      Deuda {sortField === 'deuda_total' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
    <th
      className="text-right px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
      onClick={() => toggleSort('deuda_vencida')}
    >
      Vencida {sortField === 'deuda_vencida' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
    <th className="text-right px-4 py-3 font-medium">Lím. Crédito</th>
    <th className="text-left px-4 py-3 font-medium" />
  </tr>
</thead>
```

- [ ] **Step 7: Replace table body rows**

Replace the `<tbody>` block (lines 141–175). The empty-state `colSpan` changes from 7 to 10, and each row uses `displayEmpresas` with the merged `deudaMap` data:

```tsx
<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
  {displayEmpresas.length === 0 && (
    <tr>
      <td colSpan={10} className="px-4 py-8 text-center text-gray-400">Sin empresas registradas</td>
    </tr>
  )}
  {displayEmpresas.map(e => {
    const deuda = deudaMap.get(e.id)
    const deudaTotal = Number(deuda?.deuda_total ?? 0)
    const deudaVencida = Number(deuda?.deuda_vencida ?? 0)
    const hasDeuda = deudaTotal > 0
    const rowCls = hasDeuda
      ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors'
      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors opacity-60'
    const plazo = deuda?.plazo_credito ?? e.plazo_credito
    const isNumericPlazo = plazo && plazo !== 'Especial' && plazo !== 'Al contado'
    return (
      <tr key={e.id} className={rowCls}>
        <td className="px-4 py-3">
          <span className="font-medium text-gray-900 dark:text-white">{e.nombre}</span>
          {plazo && (
            <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-xs ${
              isNumericPlazo
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              {plazo === '30 Dias' ? '30d' : plazo === '60 Dias' ? '60d' : plazo === '90 Dias' ? '90d' : plazo}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.razon_social ?? '—'}</td>
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.rut ?? '—'}</td>
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.forma_pago ?? '—'}</td>
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.prioridad ?? '—'}</td>
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.sector ?? '—'}</td>
        <td className="px-4 py-3 text-right">
          {hasDeuda
            ? <span className="font-medium text-red-500">{fmt(deudaTotal)}</span>
            : <span className="text-gray-400">—</span>}
        </td>
        <td className="px-4 py-3 text-right">
          {deudaVencida > 0
            ? <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{fmt(deudaVencida)}</span>
            : <span className="text-gray-400">—</span>}
        </td>
        <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">
          {deuda?.limite_credito != null ? fmt(Number(deuda.limite_credito)) : (e.limite_credito != null ? fmt(Number(e.limite_credito)) : '—')}
        </td>
        <td className="px-4 py-3">
          {eliminandoId === e.id ? (
            <span className="inline-flex items-center gap-2 text-xs">
              {deleteError
                ? <span className="text-red-500">{deleteError}</span>
                : <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>}
              <button onClick={() => eliminar.mutate(e.id)} disabled={eliminar.isPending} className="text-red-600 hover:underline font-medium disabled:opacity-50">Sí</button>
              <button onClick={() => { setEliminandoId(null); setDeleteError(null) }} className="text-gray-500 hover:underline">No</button>
            </span>
          ) : (
            <span className="inline-flex gap-3">
              {hasDeuda && (
                <button onClick={() => setDeudaEmpresa(e)} className="text-xs text-emerald-600 hover:underline">Deuda</button>
              )}
              <button onClick={() => abrirEditar(e)} className="text-xs text-blue-600 hover:underline">Editar</button>
              <button onClick={() => { setEliminandoId(e.id); setDeleteError(null) }} className="text-xs text-red-500 hover:underline">Eliminar</button>
            </span>
          )}
        </td>
      </tr>
    )
  })}
</tbody>
```

- [ ] **Step 8: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Start dev server and verify manually**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/empresas` (or whichever port Vite uses). Verify:
- Stats bar shows 3 cards
- Table has Deuda, Vencida, Lím. Crédito columns
- Clicking "Deuda ↓" header sorts descending by debt
- "Con Deuda" button filters out companies with no debt
- Plazo badge appears next to company name

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/Empresas.tsx
git commit -m "feat: add debt stats bar, columns, sort and filter to Empresas page"
```
