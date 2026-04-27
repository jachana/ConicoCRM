# Guía de Despacho 52 — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up `/guias-despacho` lista, `/guias-despacho/nueva` (form con cargar-desde-NV), y `/guias-despacho/:id` (detalle con polling DTE), reusando componentes canónicos del PMS (`ClienteSelectModal`, `ProductoAutocomplete`, modales email/anular). Anulación redirige a `/notas-credito/nueva?guia_despacho_id=X`. Botón "Generar guía" en `NotaVentaDetalle`. Permite go-live Phase 2 del milestone M1.

**Architecture:** Tres páginas React (TanStack Query + react-router-dom) que consumen el router backend `/api/guias-despacho` ya existente. Patrón copia mecánica de Boletas (lista + nueva + detalle), corrigiendo el receptor anónimo con `ClienteSelectModal`. Polling condicional con `refetchInterval` callback. Integraciones cross-page via query params (`?nv_id=`, `?guia_despacho_id=`).

**Tech Stack:** React 18, TypeScript, TanStack Query 5, react-router-dom 6, axios, lucide-react, Tailwind, Vitest + Testing Library.

**Spec reference:** `docs/superpowers/specs/2026-04-26-guia-despacho-52-frontend-design.md`

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `frontend/src/api/guiasDespacho.ts` | Tipos + funciones HTTP (clone of `api/boletas.ts`) |
| `frontend/src/pages/GuiasDespachoList.tsx` | Lista con filtros, paginación, export, acciones por fila |
| `frontend/src/pages/GuiasDespachoList.test.tsx` | Vitest tests para lista |
| `frontend/src/pages/GuiaDespachoNueva.tsx` | Form crear (cliente, motivo, destino, líneas) con cargar-desde-NV |
| `frontend/src/pages/GuiaDespachoNueva.test.tsx` | Vitest tests para form |
| `frontend/src/pages/GuiaDespachoDetalle.tsx` | Detalle con polling DTE, acciones por estado |
| `frontend/src/pages/GuiaDespachoDetalle.test.tsx` | Vitest tests para detalle |

### Modified files

| File | Cambio |
|---|---|
| `frontend/src/router.tsx` | 3 rutas nuevas |
| `frontend/src/components/layout/Sidebar.tsx` | Entry "Guías de Despacho" en grupo Cobranza |
| `frontend/src/types.ts` (o donde vive `Module`) | Agregar `'guias_despacho'` al tipo |
| `frontend/src/pages/NotaVentaDetalle.tsx` | Botón "Generar guía" |
| `frontend/src/pages/NotaCreditoNueva.tsx` | Soporte query param `?guia_despacho_id=X` con precarga |
| `backend/app/api/guias_despacho.py` | Endpoint `GET /export/excel` |
| `backend/tests/test_guias_despacho.py` | Test export Excel |

---

## Pre-flight Checklist (subagent must read first)

Before starting any task, verify:

- [ ] Phase 1 backend está mergeado en master: `git log --oneline | grep -i "guia"` debe mostrar commits con W1-05.
- [ ] Endpoints disponibles: `curl http://localhost:8000/api/guias-despacho/` (con auth) responde lista.
- [ ] `frontend/src/api/boletas.ts` existe (lo usaremos como blueprint).
- [ ] `frontend/src/components/ClienteSelectModal.tsx` existe.
- [ ] Tests pasando en master: `cd frontend && npm test -- --run`.

---

## Wave 1 — Plumbing (no UI yet)

### Task 1: API client `frontend/src/api/guiasDespacho.ts`

**Files:**
- Create: `frontend/src/api/guiasDespacho.ts`

- [ ] **Step 1: Create API module clone of `api/boletas.ts` shape**

```ts
// frontend/src/api/guiasDespacho.ts
import { api } from '../lib/api';

export type GuiaEstado = 'emitida' | 'anulada';
export type GuiaDteEstado =
  | 'no_emitida'
  | 'pendiente'
  | 'procesando'
  | 'aceptada'
  | 'rechazada';

export type MotivoTraslado = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const MOTIVOS_TRASLADO: { value: MotivoTraslado; label: string }[] = [
  { value: 1, label: '1 — Operación constituye venta' },
  { value: 2, label: '2 — Ventas por entregar' },
  { value: 3, label: '3 — Consignaciones' },
  { value: 4, label: '4 — Entrega gratuita' },
  { value: 5, label: '5 — Traslado interno' },
  { value: 6, label: '6 — Otros traslados no venta' },
  { value: 7, label: '7 — Guía de devolución' },
  { value: 8, label: '8 — Traslado para exportación' },
  { value: 9, label: '9 — Venta para exportación' },
];

export interface ClienteMin {
  id: number;
  nombre: string;
  rut?: string | null;
}

export interface VendedorMin {
  id: number;
  name: string;
}

export interface GuiaLineaInput {
  orden?: number;
  producto_id?: number | null;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct?: string;
  exenta?: boolean;
}

export interface GuiaLinea {
  id: number;
  orden: number;
  producto_id?: number | null;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct: string;
  exenta: boolean;
  total_neto: string;
  iva: string;
  total_linea: string;
}

export interface GuiaDespacho {
  id: number;
  numero: number;
  fecha: string;
  cliente_id?: number | null;
  empresa_id?: number | null;
  nota_venta_id?: number | null;
  motivo_traslado: MotivoTraslado;
  direccion_destino: string;
  comuna_destino: string;
  email_envio?: string | null;
  vendedor_id?: number | null;
  total_neto: string;
  total_iva: string;
  total: string;
  estado: GuiaEstado;
  dte_estado: GuiaDteEstado;
  folio_sii?: number | null;
  track_id?: string | null;
  email_enviado_at?: string | null;
  created_at: string;
  updated_at: string;
  cliente?: ClienteMin | null;
  vendedor?: VendedorMin | null;
  lineas: GuiaLinea[];
}

export interface GuiaDespachoListItem {
  id: number;
  numero: number;
  fecha: string;
  cliente_id?: number | null;
  motivo_traslado: MotivoTraslado;
  nota_venta_id?: number | null;
  total: string;
  estado: GuiaEstado;
  dte_estado: GuiaDteEstado;
  cliente?: ClienteMin | null;
  vendedor?: VendedorMin | null;
}

export interface GuiaCreatePayload {
  fecha?: string;
  cliente_id: number;
  empresa_id?: number | null;
  nota_venta_id?: number | null;
  motivo_traslado: MotivoTraslado;
  direccion_destino: string;
  comuna_destino: string;
  email_envio?: string;
  lineas: GuiaLineaInput[];
}

export interface GuiaPatchPayload {
  direccion_destino?: string;
  comuna_destino?: string;
  email_envio?: string | null;
}

export interface GuiaListFilters {
  fecha_desde?: string;
  fecha_hasta?: string;
  cliente_id?: number;
  empresa_id?: number;
  motivo_traslado?: MotivoTraslado;
  estado?: GuiaEstado[];
  dte_estado?: GuiaDteEstado[];
  vendedor_id?: number;
  page?: number;
  page_size?: number;
}

function cleanParams(filtros: GuiaListFilters): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => {
      if (v == null) return false;
      if (typeof v === 'string' && v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }),
  );
}

export async function listarGuiasDespacho(
  filtros: GuiaListFilters = {},
): Promise<GuiaDespachoListItem[]> {
  const params = cleanParams(filtros);
  const { data } = await api.get<GuiaDespachoListItem[]>('/api/guias-despacho/', { params });
  return data;
}

export async function getGuiaDespacho(id: number): Promise<GuiaDespacho> {
  const { data } = await api.get<GuiaDespacho>(`/api/guias-despacho/${id}`);
  return data;
}

export async function crearGuiaDespacho(payload: GuiaCreatePayload): Promise<GuiaDespacho> {
  const { data } = await api.post<GuiaDespacho>('/api/guias-despacho/', payload);
  return data;
}

export async function patchGuiaDespacho(
  id: number,
  payload: GuiaPatchPayload,
): Promise<GuiaDespacho> {
  const { data } = await api.patch<GuiaDespacho>(`/api/guias-despacho/${id}`, payload);
  return data;
}

export async function eliminarGuiaDespacho(id: number): Promise<void> {
  await api.delete(`/api/guias-despacho/${id}`);
}

export async function emitirGuiaDespachoDte(id: number): Promise<GuiaDespacho> {
  const { data } = await api.post<GuiaDespacho>(`/api/dte/guias-despacho/${id}/emitir`);
  return data;
}

export async function enviarEmailGuiaDespacho(
  id: number,
  email?: string,
): Promise<GuiaDespacho> {
  const { data } = await api.post<GuiaDespacho>(`/api/guias-despacho/${id}/email`, { email });
  return data;
}

export async function descargarPdfGuiaDespacho(id: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/api/guias-despacho/${id}/pdf`, {
    responseType: 'blob',
  });
  return data;
}

export async function exportarGuiasDespachoExcel(
  filtros: GuiaListFilters = {},
): Promise<Blob> {
  const params = cleanParams(filtros);
  const { data } = await api.get<Blob>('/api/guias-despacho/export/excel', {
    params,
    responseType: 'blob',
  });
  return data;
}

export function pdfGuiaDespachoUrl(id: number): string {
  return `/api/guias-despacho/${id}/pdf`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors related to `guiasDespacho.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/guiasDespacho.ts
git commit -m "feat(guias): add api client for guias de despacho 52"
```

---

### Task 2: Backend export Excel endpoint

**Files:**
- Modify: `backend/app/api/guias_despacho.py` (agregar endpoint)
- Modify: `backend/tests/test_guias_despacho.py` (agregar test)

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_guias_despacho.py`:

```python
def test_exportar_excel_admin(client, admin_token, db):
    # crear guía de prueba
    payload = {
        "cliente_id": 1,
        "motivo_traslado": 1,
        "direccion_destino": "Av Test 123",
        "comuna_destino": "Santiago",
        "lineas": [{"descripcion": "Item", "cantidad": "1", "precio_unitario": "1000"}],
    }
    client.post("/api/guias-despacho/", json=payload,
                headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/guias-despacho/export/excel",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert len(r.content) > 100  # workbook real, no vacío
```

- [ ] **Step 2: Run test (must fail)**

Run: `cd backend && pytest tests/test_guias_despacho.py::test_exportar_excel_admin -v`
Expected: FAIL with 404 (endpoint inexistente).

- [ ] **Step 3: Implement endpoint following boleta pattern**

Read `backend/app/api/boletas.py` para localizar la función de export (buscar `def export` o `xlsx`). Replicar firma + filtros aplicables a guía. Insertar en `backend/app/api/guias_despacho.py` antes del `@router.get("/{guia_id}/pdf")`:

```python
@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = Depends(require_permission("guias_despacho", "view")),
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    cliente_id: int | None = None,
    estado: list[str] | None = Query(None),
    dte_estado: list[str] | None = Query(None),
    motivo_traslado: int | None = None,
    vendedor_id: int | None = None,
):
    user, db = perms
    q = db.query(GuiaDespacho).options(
        joinedload(GuiaDespacho.cliente),
        joinedload(GuiaDespacho.vendedor),
    )
    if user.rol == "vendedor":
        q = q.filter(GuiaDespacho.vendedor_id == user.id)
    if fecha_desde:
        q = q.filter(GuiaDespacho.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(GuiaDespacho.fecha <= fecha_hasta)
    if cliente_id:
        q = q.filter(GuiaDespacho.cliente_id == cliente_id)
    if estado:
        q = q.filter(GuiaDespacho.estado.in_(estado))
    if dte_estado:
        q = q.filter(GuiaDespacho.dte_estado.in_(dte_estado))
    if motivo_traslado:
        q = q.filter(GuiaDespacho.motivo_traslado == motivo_traslado)
    if vendedor_id:
        q = q.filter(GuiaDespacho.vendedor_id == vendedor_id)

    rows = q.order_by(GuiaDespacho.fecha.desc(), GuiaDespacho.numero.desc()).all()

    from openpyxl import Workbook
    from io import BytesIO
    wb = Workbook()
    ws = wb.active
    ws.title = "Guías de Despacho"
    ws.append([
        "N°", "Fecha", "Cliente", "RUT", "Motivo", "NV vinculada",
        "Total neto", "IVA", "Total", "Estado", "DTE", "Vendedor",
    ])
    for g in rows:
        ws.append([
            g.numero,
            g.fecha.isoformat() if g.fecha else "",
            g.cliente.nombre if g.cliente else "",
            g.cliente.rut if g.cliente else "",
            g.motivo_traslado,
            g.nota_venta_id or "",
            float(g.total_neto or 0),
            float(g.total_iva or 0),
            float(g.total or 0),
            g.estado,
            g.dte_estado,
            g.vendedor.name if g.vendedor else "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="guias-despacho.xlsx"'},
    )
```

Imports a agregar al top de `guias_despacho.py` si faltan:
```python
from fastapi import Query, Response
from sqlalchemy.orm import joinedload
```

- [ ] **Step 4: Run test (must pass)**

Run: `cd backend && pytest tests/test_guias_despacho.py::test_exportar_excel_admin -v`
Expected: PASS.

- [ ] **Step 5: Run full test file (no regressions)**

Run: `cd backend && pytest tests/test_guias_despacho.py -v`
Expected: all pass (or only `pytest.mark.smoke` skipped as already documented).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/guias_despacho.py backend/tests/test_guias_despacho.py
git commit -m "feat(guias-backend): add export/excel endpoint"
```

---

### Task 3: Routing + Sidebar entry + permission module type

**Files:**
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/types.ts` (o el archivo donde vive el tipo `Module`)

- [ ] **Step 1: Add `'guias_despacho'` to Module type**

Run: `grep -rn "type Module" frontend/src/types.ts frontend/src` → identifica archivo. Editar el `type Module = ...` para incluir `| 'guias_despacho'`. Si el tipo es un union literal en `types.ts`:

```ts
export type Module =
  | 'dashboard'
  | 'clientes'
  // ...existing...
  | 'guias_despacho';  // NUEVO
```

- [ ] **Step 2: Create empty page stubs (so router compiles)**

```bash
cat > frontend/src/pages/GuiasDespachoList.tsx <<'EOF'
export default function GuiasDespachoList() {
  return <div>Guías de Despacho — placeholder</div>
}
EOF

cat > frontend/src/pages/GuiaDespachoNueva.tsx <<'EOF'
export default function GuiaDespachoNueva() {
  return <div>Nueva Guía — placeholder</div>
}
EOF

cat > frontend/src/pages/GuiaDespachoDetalle.tsx <<'EOF'
export default function GuiaDespachoDetalle() {
  return <div>Guía Detalle — placeholder</div>
}
EOF
```

- [ ] **Step 3: Wire routes in `router.tsx`**

Insertar imports junto a los de Boletas (~líneas 29-31):

```tsx
import GuiasDespachoList from './pages/GuiasDespachoList'
import GuiaDespachoNueva from './pages/GuiaDespachoNueva'
import GuiaDespachoDetalle from './pages/GuiaDespachoDetalle'
```

Insertar rutas después del bloque de `boletas` (~línea 75):

```tsx
{ path: 'guias-despacho', element: <GuiasDespachoList /> },
{ path: 'guias-despacho/nueva', element: <GuiaDespachoNueva /> },
{ path: 'guias-despacho/:id', element: <GuiaDespachoDetalle /> },
```

- [ ] **Step 4: Add Sidebar entry**

En `frontend/src/components/layout/Sidebar.tsx` modificar el grupo "Cobranza" (~líneas 42-52) para insertar la entry tras `Boletas`:

```tsx
{
  icon: Banknote, label: 'Cobranza',
  children: [
    { to: '/cobranza',       icon: Banknote,    label: 'Cobranza' },
    { to: '/facturas',       icon: FileText,    label: 'Facturas' },
    { to: '/boletas',        icon: FileText,    label: 'Boletas' },
    { to: '/guias-despacho', icon: Truck,       label: 'Guías de Despacho' },  // NUEVA
    { to: '/notas-credito',  icon: FileText,    label: 'Notas de Crédito' },
    { to: '/notas-debito',   icon: FileText,    label: 'Notas de Débito' },
    { to: '/pagos',          icon: CreditCard,  label: 'Pagos' },
  ],
},
```

Verificar que `Truck` ya está importado (sí lo está, ver línea 6).

Actualizar también el array de `openGroups` default (línea 76) para incluir `/guias-despacho`:

```tsx
Cobranza: ['/cobranza', '/facturas', '/boletas', '/guias-despacho', '/notas-credito', '/notas-debito', '/pagos'].some(p => location.pathname.startsWith(p)),
```

- [ ] **Step 5: Verify dev server boots and route loads**

Run: `cd frontend && npm run dev` (in background)
Manually navigate browser to `/guias-despacho` → should render placeholder. Stop server.

- [ ] **Step 6: Verify TypeScript build**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/router.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/types.ts frontend/src/pages/GuiasDespachoList.tsx frontend/src/pages/GuiaDespachoNueva.tsx frontend/src/pages/GuiaDespachoDetalle.tsx
git commit -m "feat(guias-fe): wire routes + sidebar entry + page stubs"
```

---

## Wave 2 — Pages

### Task 4: GuiasDespachoList — tests + implementation

**Files:**
- Create: `frontend/src/pages/GuiasDespachoList.test.tsx`
- Modify: `frontend/src/pages/GuiasDespachoList.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// frontend/src/pages/GuiasDespachoList.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import GuiasDespachoList from './GuiasDespachoList'
import * as apiGuias from '../api/guiasDespacho'

vi.mock('../api/guiasDespacho')

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GuiasDespachoList />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockGuia: apiGuias.GuiaDespachoListItem = {
  id: 1,
  numero: 100,
  fecha: '2026-04-26',
  cliente_id: 7,
  motivo_traslado: 1,
  total: '11900',
  estado: 'emitida',
  dte_estado: 'aceptada',
  cliente: { id: 7, nombre: 'ACME SpA' },
  vendedor: { id: 2, name: 'Juan' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiGuias.listarGuiasDespacho).mockResolvedValue([mockGuia])
})

describe('GuiasDespachoList', () => {
  it('renders table with guías', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('ACME SpA')).toBeInTheDocument())
    expect(screen.getByText('00100')).toBeInTheDocument()
  })

  it('applies filters and refetches', async () => {
    renderPage()
    await waitFor(() => expect(apiGuias.listarGuiasDespacho).toHaveBeenCalled())
    const desde = screen.getByLabelText(/desde/i) as HTMLInputElement
    await userEvent.type(desde, '2026-04-01')
    await waitFor(() => {
      const last = vi.mocked(apiGuias.listarGuiasDespacho).mock.calls.at(-1)
      expect(last?.[0]).toMatchObject({ fecha_desde: '2026-04-01' })
    })
  })

  it('shows empty state when no guías', async () => {
    vi.mocked(apiGuias.listarGuiasDespacho).mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText(/sin guías/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- --run GuiasDespachoList`
Expected: FAIL (placeholder no renderiza tabla ni labels).

- [ ] **Step 3: Implement `GuiasDespachoList.tsx` cloning `BoletasList.tsx`**

Reemplazar el contenido completo de `frontend/src/pages/GuiasDespachoList.tsx` con código basado en `BoletasList.tsx` adaptado:

```tsx
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, Download, Mail, Trash2, Plus, FileSpreadsheet, X as XIcon } from 'lucide-react'
import {
  listarGuiasDespacho,
  exportarGuiasDespachoExcel,
  enviarEmailGuiaDespacho,
  eliminarGuiaDespacho,
  MOTIVOS_TRASLADO,
  type GuiaListFilters,
  type GuiaDespachoListItem,
  type GuiaEstado,
  type GuiaDteEstado,
  type MotivoTraslado,
} from '../api/guiasDespacho'
import { openPdf } from '../lib/pdf'
import DteBadge from '../components/DteBadge'

const ESTADO_COLORS: Record<string, string> = {
  emitida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  anulada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const DTE_ESTADOS: { value: GuiaDteEstado; label: string }[] = [
  { value: 'no_emitida', label: 'Sin emitir' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'procesando', label: 'Procesando' },
  { value: 'aceptada', label: 'Aceptada' },
  { value: 'rechazada', label: 'Rechazada' },
]

function fmtMoney(n: number | string) {
  const num = typeof n === 'string' ? Number(n) : n
  return `$ ${Math.round(num).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const PAGE_SIZE = 50

export default function GuiasDespachoList() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [estados, setEstados] = useState<GuiaEstado[]>([])
  const [dteEstado, setDteEstado] = useState<GuiaDteEstado | ''>('')
  const [motivo, setMotivo] = useState<MotivoTraslado | ''>('')
  const [vendedorId, setVendedorId] = useState('')
  const [page, setPage] = useState(1)

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const filters: GuiaListFilters = useMemo(() => ({
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    estado: estados.length > 0 ? estados : undefined,
    dte_estado: dteEstado ? [dteEstado] : undefined,
    motivo_traslado: motivo || undefined,
    vendedor_id: vendedorId ? Number(vendedorId) : undefined,
    page,
    page_size: PAGE_SIZE,
  }), [fechaDesde, fechaHasta, estados, dteEstado, motivo, vendedorId, page])

  const { data: guias = [], isLoading, isFetching } = useQuery<GuiaDespachoListItem[]>({
    queryKey: ['guias-despacho-list', filters],
    queryFn: () => listarGuiasDespacho(filters),
  })

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarGuiaDespacho(id),
    onSuccess: () => {
      showToast('Guía eliminada')
      qc.invalidateQueries({ queryKey: ['guias-despacho-list'] })
    },
    onError: () => showToast('No se pudo eliminar (¿ya emitida?)', false),
  })

  const sendEmailMut = useMutation({
    mutationFn: (id: number) => enviarEmailGuiaDespacho(id),
    onSuccess: () => {
      showToast('Email enviado')
      qc.invalidateQueries({ queryKey: ['guias-despacho-list'] })
    },
    onError: () => showToast('Error al enviar email', false),
  })

  async function handleExport() {
    try {
      const blob = await exportarGuiasDespachoExcel(filters)
      const date = new Date().toISOString().split('T')[0]
      downloadBlob(blob, `guias-despacho-${date}.xlsx`)
    } catch {
      showToast('Error al exportar', false)
    }
  }

  function handleDownloadPdf(id: number) {
    openPdf(`/api/guias-despacho/${id}/pdf`).catch(() => showToast('Error al abrir PDF', false))
  }

  function toggleEstado(v: GuiaEstado) {
    setEstados(prev => prev.includes(v) ? prev.filter(e => e !== v) : [...prev, v])
    setPage(1)
  }

  function clearFilters() {
    setFechaDesde(''); setFechaHasta('')
    setEstados([]); setDteEstado(''); setMotivo(''); setVendedorId('')
    setPage(1)
  }

  const hasFilters = !!(fechaDesde || fechaHasta || estados.length || dteEstado || motivo || vendedorId)
  const hasNextPage = guias.length === PAGE_SIZE

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Guías de Despacho</h1>
        <div className="flex gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
            <FileSpreadsheet size={15} /> Exportar Excel
          </button>
          <button onClick={() => navigate('/guias-despacho/nueva')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg">
            <Plus size={15} /> Nueva guía
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-end bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800">
        <div>
          <label htmlFor="fecha-desde" className="block text-xs text-gray-500 mb-1">Desde</label>
          <input id="fecha-desde" type="date" value={fechaDesde}
            onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        </div>
        <div>
          <label htmlFor="fecha-hasta" className="block text-xs text-gray-500 mb-1">Hasta</label>
          <input id="fecha-hasta" type="date" value={fechaHasta}
            onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Estado</label>
          <div className="flex gap-2 py-1.5">
            {(['emitida', 'anulada'] as GuiaEstado[]).map(e => (
              <label key={e} className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={estados.includes(e)} onChange={() => toggleEstado(e)} />
                {e}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">DTE</label>
          <select value={dteEstado} onChange={e => { setDteEstado(e.target.value as GuiaDteEstado | ''); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="">Todas</option>
            {DTE_ESTADOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Motivo</label>
          <select value={motivo}
            onChange={e => { setMotivo(e.target.value ? Number(e.target.value) as MotivoTraslado : ''); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="">Todos</option>
            {MOTIVOS_TRASLADO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Vendedor ID</label>
          <input type="number" placeholder="ID" value={vendedorId}
            onChange={e => { setVendedorId(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-24" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters}
            className="text-xs text-gray-400 hover:text-gray-600 underline px-2 py-1.5">
            <XIcon size={12} className="inline" /> Limpiar
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-gray-400 py-12 text-center text-sm">Cargando...</div>
      ) : guias.length === 0 ? (
        <div className="text-gray-400 py-12 text-center text-sm">Sin guías de despacho para los filtros aplicados</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                {['Nº', 'Fecha', 'Cliente', 'Motivo', 'NV', 'Total', 'Estado', 'DTE', 'Vendedor', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {guias.map(g => {
                const motivoLabel = MOTIVOS_TRASLADO.find(m => m.value === g.motivo_traslado)?.label.split(' — ')[1] ?? '—'
                const canDelete = g.dte_estado === 'no_emitida' && g.estado !== 'anulada'
                return (
                  <tr key={g.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-white font-num">
                      <Link to={`/guias-despacho/${g.id}`} className="hover:text-brand-500">
                        {String(g.numero).padStart(5, '0')}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(g.fecha)}</td>
                    <td className="px-3 py-3 text-gray-900 dark:text-white">{g.cliente?.nombre ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300 text-xs">{motivoLabel}</td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300 font-num">
                      {g.nota_venta_id
                        ? <Link to={`/notas-venta/${g.nota_venta_id}`} className="text-brand-500 hover:underline">N°{g.nota_venta_id}</Link>
                        : '—'}
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap font-num">{fmtMoney(g.total)}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[g.estado] ?? ''}`}>
                        {g.estado}
                      </span>
                    </td>
                    <td className="px-3 py-3"><DteBadge estado={g.dte_estado} /></td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300 text-xs">{g.vendedor?.name ?? '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <Link to={`/guias-despacho/${g.id}`} title="Ver"
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded">
                          <Eye size={15} />
                        </Link>
                        <button onClick={() => handleDownloadPdf(g.id)} title="PDF"
                          className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded">
                          <Download size={15} />
                        </button>
                        <button onClick={() => sendEmailMut.mutate(g.id)} title="Enviar email"
                          disabled={sendEmailMut.isPending}
                          className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded disabled:opacity-50">
                          <Mail size={15} />
                        </button>
                        <button onClick={() => {
                          if (window.confirm(`¿Eliminar guía N°${g.numero}? Solo posible si DTE no fue emitida.`)) {
                            eliminarMut.mutate(g.id)
                          }
                        }} title="Eliminar (solo si DTE no emitida)" disabled={!canDelete}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-30 disabled:cursor-not-allowed">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(page > 1 || hasNextPage) && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button disabled={page <= 1 || isFetching}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">
            Anterior
          </button>
          <span className="text-sm text-gray-500">Página {page}</span>
          <button disabled={!hasNextPage || isFetching}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">
            Siguiente
          </button>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests (must pass)**

Run: `cd frontend && npm test -- --run GuiasDespachoList`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GuiasDespachoList.tsx frontend/src/pages/GuiasDespachoList.test.tsx
git commit -m "feat(guias-fe): list page with filters, pagination, export"
```

---

### Task 5: GuiaDespachoNueva — tests + implementation (sin NV import todavía)

**Files:**
- Create: `frontend/src/pages/GuiaDespachoNueva.test.tsx`
- Modify: `frontend/src/pages/GuiaDespachoNueva.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// frontend/src/pages/GuiaDespachoNueva.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import GuiaDespachoNueva from './GuiaDespachoNueva'
import * as apiGuias from '../api/guiasDespacho'

vi.mock('../api/guiasDespacho')
vi.mock('../components/ClienteSelectModal', () => ({
  default: ({ onSelect, onClose }: { onSelect: (id: number, nombre: string) => void; onClose: () => void }) => (
    <div data-testid="mock-cliente-modal">
      <button onClick={() => { onSelect(7, 'ACME SpA'); onClose() }}>pick-cliente</button>
    </div>
  ),
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/guias-despacho/nueva']}>
        <Routes>
          <Route path="/guias-despacho/nueva" element={<GuiaDespachoNueva />} />
          <Route path="/guias-despacho/:id" element={<div>detalle-stub</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GuiaDespachoNueva', () => {
  it('renders empty form', () => {
    renderPage()
    expect(screen.getByText(/nueva guía/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/dirección destino/i)).toBeInTheDocument()
  })

  it('blocks submit without cliente', async () => {
    renderPage()
    const submitBtn = screen.getByRole('button', { name: /guardar y emitir/i })
    expect(submitBtn).toBeDisabled()
  })

  it('blocks submit without lineas válidas', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /seleccionar cliente/i }))
    await userEvent.click(screen.getByText('pick-cliente'))
    await userEvent.type(screen.getByLabelText(/dirección destino/i), 'Av Test 123')
    await userEvent.type(screen.getByLabelText(/comuna/i), 'Santiago')
    const submitBtn = screen.getByRole('button', { name: /guardar y emitir/i })
    expect(submitBtn).toBeDisabled()
  })

  it('submits successfully with valid form', async () => {
    vi.mocked(apiGuias.crearGuiaDespacho).mockResolvedValue({ id: 42 } as apiGuias.GuiaDespacho)
    vi.mocked(apiGuias.emitirGuiaDespachoDte).mockResolvedValue({ id: 42 } as apiGuias.GuiaDespacho)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /seleccionar cliente/i }))
    await userEvent.click(screen.getByText('pick-cliente'))
    await userEvent.type(screen.getByLabelText(/dirección destino/i), 'Av Test 123')
    await userEvent.type(screen.getByLabelText(/comuna/i), 'Santiago')
    // primera línea: rellenar descripcion + cantidad + precio
    const descInputs = screen.getAllByPlaceholderText(/descripción/i)
    await userEvent.type(descInputs[0], 'Producto X')
    const cantInputs = screen.getAllByPlaceholderText(/cantidad/i)
    await userEvent.clear(cantInputs[0])
    await userEvent.type(cantInputs[0], '2')
    const precInputs = screen.getAllByPlaceholderText(/precio/i)
    await userEvent.clear(precInputs[0])
    await userEvent.type(precInputs[0], '1000')

    await userEvent.click(screen.getByRole('button', { name: /guardar y emitir/i }))
    await waitFor(() => expect(apiGuias.crearGuiaDespacho).toHaveBeenCalled())
    await waitFor(() => expect(apiGuias.emitirGuiaDespachoDte).toHaveBeenCalledWith(42))
    await waitFor(() => expect(screen.getByText(/detalle-stub/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- --run GuiaDespachoNueva`
Expected: FAIL.

- [ ] **Step 3: Implement `GuiaDespachoNueva.tsx`**

Reemplazar contenido de `frontend/src/pages/GuiaDespachoNueva.tsx`:

```tsx
import { useEffect, useState, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Trash2, Plus, Save, Send } from 'lucide-react'
import {
  crearGuiaDespacho,
  emitirGuiaDespachoDte,
  MOTIVOS_TRASLADO,
  type GuiaCreatePayload,
  type GuiaLineaInput,
  type MotivoTraslado,
} from '../api/guiasDespacho'
import ClienteSelectModal from '../components/ClienteSelectModal'

interface LineaForm {
  descripcion: string
  cantidad: string
  precio_unitario: string
  descuento_pct: string
  exenta: boolean
}

const emptyLinea: LineaForm = {
  descripcion: '',
  cantidad: '1',
  precio_unitario: '0',
  descuento_pct: '0',
  exenta: false,
}

export default function GuiaDespachoNueva() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nvIdParam = searchParams.get('nv_id')

  const [clienteId, setClienteId] = useState<number | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [showClienteModal, setShowClienteModal] = useState(false)
  const [motivo, setMotivo] = useState<MotivoTraslado>(1)
  const [direccion, setDireccion] = useState('')
  const [comuna, setComuna] = useState('')
  const [emailEnvio, setEmailEnvio] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([{ ...emptyLinea }])
  const [notaVentaId, setNotaVentaId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Cargar desde NV si query param presente (Task 10 implementa el fetch real)
  useEffect(() => {
    if (nvIdParam) {
      setNotaVentaId(Number(nvIdParam))
      // Task 10 agrega fetch /api/notas-venta/{id} y autopobla cliente, líneas, dirección
    }
  }, [nvIdParam])

  function addLinea() {
    setLineas(prev => [...prev, { ...emptyLinea }])
  }

  function removeLinea(i: number) {
    setLineas(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateLinea(i: number, patch: Partial<LineaForm>) {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  const lineasValidas = lineas.length > 0 && lineas.every(l =>
    l.descripcion.trim() !== '' &&
    Number(l.cantidad) > 0 &&
    Number(l.precio_unitario) >= 0
  )
  const formValido = clienteId !== null && direccion.trim().length >= 3 && comuna.trim() !== '' && lineasValidas

  // Cálculo totales client-side
  const subtotal = lineas.reduce((acc, l) => {
    const cant = Number(l.cantidad) || 0
    const prec = Number(l.precio_unitario) || 0
    const desc = Number(l.descuento_pct) || 0
    const base = cant * prec * (1 - desc / 100)
    return acc + (l.exenta ? 0 : base / 1.19)  // precio bruto → neto
  }, 0)
  const exentas = lineas.reduce((acc, l) => {
    if (!l.exenta) return acc
    const cant = Number(l.cantidad) || 0
    const prec = Number(l.precio_unitario) || 0
    const desc = Number(l.descuento_pct) || 0
    return acc + cant * prec * (1 - desc / 100)
  }, 0)
  const iva = Math.round(subtotal * 0.19)
  const total = Math.round(subtotal + iva + exentas)

  async function handleSubmit(emitir: boolean, e?: FormEvent) {
    if (e) e.preventDefault()
    if (!formValido || saving) return
    setSaving(true)
    setError('')
    try {
      const payload: GuiaCreatePayload = {
        cliente_id: clienteId!,
        motivo_traslado: motivo,
        direccion_destino: direccion.trim(),
        comuna_destino: comuna.trim(),
        ...(emailEnvio ? { email_envio: emailEnvio } : {}),
        ...(notaVentaId ? { nota_venta_id: notaVentaId } : {}),
        lineas: lineas.map((l, i): GuiaLineaInput => ({
          orden: i,
          descripcion: l.descripcion.trim(),
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          ...(Number(l.descuento_pct) > 0 ? { descuento_pct: l.descuento_pct } : {}),
          exenta: l.exenta,
        })),
      }
      const guia = await crearGuiaDespacho(payload)
      if (emitir) {
        await emitirGuiaDespachoDte(guia.id)
      }
      navigate(`/guias-despacho/${guia.id}`)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail || 'Error al guardar la guía')
    } finally {
      setSaving(false)
    }
  }

  // Atajos teclado
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault()
        handleSubmit(true)
      } else if (ev.key === 'Escape') {
        navigate('/guias-despacho')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, motivo, direccion, comuna, emailEnvio, lineas, saving])

  const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:border-brand-500'
  const lblCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Nueva Guía de Despacho</h1>

      {notaVentaId && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-300">
          Cargado desde NV N°{notaVentaId}. Edita lo que necesites.
        </div>
      )}

      <form onSubmit={(e) => handleSubmit(true, e)} className="space-y-6">
        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Receptor</h2>
          <button type="button" onClick={() => setShowClienteModal(true)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
            {clienteNombre ? `Cliente: ${clienteNombre}` : 'Seleccionar cliente'}
          </button>
        </section>

        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="motivo" className={lblCls}>Motivo de traslado SII</label>
            <select id="motivo" value={motivo}
              onChange={e => setMotivo(Number(e.target.value) as MotivoTraslado)}
              className={inputCls}>
              {MOTIVOS_TRASLADO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="direccion-destino" className={lblCls}>Dirección destino</label>
            <input id="direccion-destino" type="text" value={direccion}
              onChange={e => setDireccion(e.target.value)} className={inputCls} maxLength={255} />
          </div>
          <div>
            <label htmlFor="comuna-destino" className={lblCls}>Comuna</label>
            <input id="comuna-destino" type="text" value={comuna}
              onChange={e => setComuna(e.target.value)} className={inputCls} maxLength={100} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="email-envio" className={lblCls}>Email envío (opcional)</label>
            <input id="email-envio" type="email" value={emailEnvio}
              onChange={e => setEmailEnvio(e.target.value)} className={inputCls} />
          </div>
        </section>

        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas</h2>
            <button type="button" onClick={addLinea}
              className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
              <Plus size={12} /> Línea
            </button>
          </div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input className={`${inputCls} col-span-5`} placeholder="Descripción"
                  value={l.descripcion} onChange={e => updateLinea(i, { descripcion: e.target.value })} />
                <input className={`${inputCls} col-span-2`} placeholder="Cantidad" type="number" step="0.01"
                  value={l.cantidad} onChange={e => updateLinea(i, { cantidad: e.target.value })} />
                <input className={`${inputCls} col-span-2`} placeholder="Precio unit" type="number" step="1"
                  value={l.precio_unitario} onChange={e => updateLinea(i, { precio_unitario: e.target.value })} />
                <input className={`${inputCls} col-span-1`} placeholder="Desc%" type="number" step="0.01"
                  value={l.descuento_pct} onChange={e => updateLinea(i, { descuento_pct: e.target.value })} />
                <label className="col-span-1 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <input type="checkbox" checked={l.exenta}
                    onChange={e => updateLinea(i, { exenta: e.target.checked })} /> Ex
                </label>
                <button type="button" onClick={() => removeLinea(i)} disabled={lineas.length === 1}
                  className="col-span-1 p-1.5 text-gray-500 hover:text-red-600 disabled:opacity-30">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 text-right text-sm space-y-0.5 text-gray-700 dark:text-gray-300">
            <div>Neto: $ {Math.round(subtotal).toLocaleString('es-CL')}</div>
            <div>IVA 19%: $ {iva.toLocaleString('es-CL')}</div>
            {exentas > 0 && <div>Exento: $ {Math.round(exentas).toLocaleString('es-CL')}</div>}
            <div className="font-semibold text-gray-900 dark:text-white">Total: $ {total.toLocaleString('es-CL')}</div>
          </div>
        </section>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => navigate('/guias-despacho')}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
            Cancelar
          </button>
          <button type="button" onClick={() => handleSubmit(false)} disabled={!formValido || saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50">
            <Save size={14} /> Guardar borrador
          </button>
          <button type="submit" disabled={!formValido || saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50">
            <Send size={14} /> Guardar y emitir DTE
          </button>
        </div>
      </form>

      {showClienteModal && (
        <ClienteSelectModal
          onClose={() => setShowClienteModal(false)}
          onSelect={(id: number, nombre: string) => {
            setClienteId(id)
            setClienteNombre(nombre)
          }}
        />
      )}
    </div>
  )
}
```

**NOTA:** El subagent debe verificar la firma real de `ClienteSelectModal` con `cat frontend/src/components/ClienteSelectModal.tsx | head -30` y ajustar la prop `onSelect` si la signature difiere (ej. recibe objeto cliente en lugar de id+nombre). Adaptar el mock del test en consecuencia.

- [ ] **Step 4: Run tests (must pass)**

Run: `cd frontend && npm test -- --run GuiaDespachoNueva`
Expected: 4 tests PASS.

- [ ] **Step 5: Smoke test manual en navegador**

Run: `cd frontend && npm run dev` (background). Navigate `/guias-despacho/nueva`, verify:
- Form renderiza
- "Seleccionar cliente" abre modal
- Submit con cliente + dirección + comuna + 1 línea válida → POST + redirect
- Stop server.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/GuiaDespachoNueva.tsx frontend/src/pages/GuiaDespachoNueva.test.tsx
git commit -m "feat(guias-fe): nueva page with form + cliente modal + line editor"
```

---

### Task 6: GuiaDespachoDetalle — tests + implementation (sin polling todavía)

**Files:**
- Create: `frontend/src/pages/GuiaDespachoDetalle.test.tsx`
- Modify: `frontend/src/pages/GuiaDespachoDetalle.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// frontend/src/pages/GuiaDespachoDetalle.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import GuiaDespachoDetalle from './GuiaDespachoDetalle'
import * as apiGuias from '../api/guiasDespacho'

vi.mock('../api/guiasDespacho')

function makeGuia(overrides: Partial<apiGuias.GuiaDespacho> = {}): apiGuias.GuiaDespacho {
  return {
    id: 42, numero: 100, fecha: '2026-04-26',
    cliente_id: 7, empresa_id: null, nota_venta_id: null,
    motivo_traslado: 1, direccion_destino: 'Av Test 123', comuna_destino: 'Santiago',
    email_envio: null, vendedor_id: 2,
    total_neto: '10000', total_iva: '1900', total: '11900',
    estado: 'emitida', dte_estado: 'aceptada',
    folio_sii: 5678, track_id: 'tk-123', email_enviado_at: null,
    created_at: '2026-04-26T10:00:00', updated_at: '2026-04-26T10:00:00',
    cliente: { id: 7, nombre: 'ACME SpA', rut: '11111111-1' },
    vendedor: { id: 2, name: 'Juan' },
    lineas: [
      { id: 1, orden: 0, producto_id: null, descripcion: 'Producto X',
        cantidad: '2', precio_unitario: '5000', descuento_pct: '0',
        exenta: false, total_neto: '10000', iva: '1900', total_linea: '11900' },
    ],
    ...overrides,
  }
}

function renderPage(id = 42) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/guias-despacho/${id}`]}>
        <Routes>
          <Route path="/guias-despacho/:id" element={<GuiaDespachoDetalle />} />
          <Route path="/notas-credito/nueva" element={<div>nc-nueva-stub</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GuiaDespachoDetalle', () => {
  it('renders guía header + receptor + líneas', async () => {
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia())
    renderPage()
    await waitFor(() => expect(screen.getByText(/N°100/i)).toBeInTheDocument())
    expect(screen.getByText(/ACME SpA/)).toBeInTheDocument()
    expect(screen.getByText(/Av Test 123/)).toBeInTheDocument()
    expect(screen.getByText(/Producto X/)).toBeInTheDocument()
  })

  it('shows "Anular" only when dte_estado=aceptada and not anulada', async () => {
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia({ dte_estado: 'aceptada' }))
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument())
  })

  it('hides "Anular" when guía already anulada', async () => {
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia({ estado: 'anulada' }))
    renderPage()
    await waitFor(() => expect(screen.getByText(/N°100/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument()
  })

  it('clicking Anular navigates to /notas-credito/nueva with guia_despacho_id', async () => {
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia())
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /anular/i }))
    window.confirm = vi.fn(() => true)
    await userEvent.click(screen.getByRole('button', { name: /anular/i }))
    await waitFor(() => expect(screen.getByText('nc-nueva-stub')).toBeInTheDocument())
  })

  it('shows "Emitir DTE" when dte_estado=no_emitida', async () => {
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia({ dte_estado: 'no_emitida' }))
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /emitir dte/i })).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- --run GuiaDespachoDetalle`
Expected: FAIL.

- [ ] **Step 3: Implement `GuiaDespachoDetalle.tsx`**

Reemplazar contenido de `frontend/src/pages/GuiaDespachoDetalle.tsx`:

```tsx
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Mail, Send, Trash2, Edit, ArrowLeft } from 'lucide-react'
import {
  getGuiaDespacho,
  emitirGuiaDespachoDte,
  enviarEmailGuiaDespacho,
  eliminarGuiaDespacho,
  patchGuiaDespacho,
  MOTIVOS_TRASLADO,
  type GuiaDespacho,
} from '../api/guiasDespacho'
import { openPdf } from '../lib/pdf'
import DteBadge from '../components/DteBadge'

const ESTADO_COLORS: Record<string, string> = {
  emitida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  anulada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

function fmtMoney(n: number | string) {
  const num = typeof n === 'string' ? Number(n) : n
  return `$ ${Math.round(num).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL')
}

export default function GuiaDespachoDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const guiaId = Number(id)
  const [editingMeta, setEditingMeta] = useState(false)
  const [direccion, setDireccion] = useState('')
  const [comuna, setComuna] = useState('')
  const [emailEnvio, setEmailEnvio] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const { data: guia, isLoading, isError } = useQuery<GuiaDespacho>({
    queryKey: ['guia-despacho', guiaId],
    queryFn: () => getGuiaDespacho(guiaId),
    enabled: !!guiaId,
    // refetchInterval agregado en Task 7
  })

  const emitirMut = useMutation({
    mutationFn: () => emitirGuiaDespachoDte(guiaId),
    onSuccess: () => {
      showToast('Emisión disparada — esperando SII')
      qc.invalidateQueries({ queryKey: ['guia-despacho', guiaId] })
    },
    onError: () => showToast('Error al emitir DTE', false),
  })

  const emailMut = useMutation({
    mutationFn: () => enviarEmailGuiaDespacho(guiaId),
    onSuccess: () => {
      showToast('Email enviado')
      qc.invalidateQueries({ queryKey: ['guia-despacho', guiaId] })
    },
    onError: () => showToast('Error al enviar email', false),
  })

  const eliminarMut = useMutation({
    mutationFn: () => eliminarGuiaDespacho(guiaId),
    onSuccess: () => {
      showToast('Guía eliminada')
      navigate('/guias-despacho')
    },
    onError: () => showToast('No se pudo eliminar (¿ya emitida?)', false),
  })

  const patchMut = useMutation({
    mutationFn: () => patchGuiaDespacho(guiaId, {
      direccion_destino: direccion,
      comuna_destino: comuna,
      email_envio: emailEnvio || null,
    }),
    onSuccess: () => {
      showToast('Guía actualizada')
      setEditingMeta(false)
      qc.invalidateQueries({ queryKey: ['guia-despacho', guiaId] })
    },
    onError: () => showToast('Error al actualizar', false),
  })

  function handleAnular() {
    if (!guia) return
    if (window.confirm(`¿Crear NC tipo 61 para anular la guía N°${guia.numero}? La guía quedará anulada solo cuando la NC sea aceptada por SII.`)) {
      navigate(`/notas-credito/nueva?guia_despacho_id=${guia.id}`)
    }
  }

  function startEdit() {
    if (!guia) return
    setDireccion(guia.direccion_destino)
    setComuna(guia.comuna_destino)
    setEmailEnvio(guia.email_envio || '')
    setEditingMeta(true)
  }

  if (isLoading) return <div className="p-6 text-gray-400">Cargando...</div>
  if (isError || !guia) return <div className="p-6 text-red-500">Error al cargar la guía.</div>

  const motivoLabel = MOTIVOS_TRASLADO.find(m => m.value === guia.motivo_traslado)?.label ?? '—'
  const isAnulada = guia.estado === 'anulada'
  const canEdit = guia.dte_estado === 'no_emitida' && !isAnulada
  const canEmitir = guia.dte_estado === 'no_emitida' && !isAnulada
  const canAnular = guia.dte_estado === 'aceptada' && !isAnulada
  const canRetry = guia.dte_estado === 'rechazada' && !isAnulada
  const canDelete = guia.dte_estado === 'no_emitida' && !isAnulada
  const canPdfEmail = !isAnulada || guia.dte_estado === 'aceptada'

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/guias-despacho" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          Guía de Despacho N°{String(guia.numero).padStart(5, '0')}
        </h1>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[guia.estado] ?? ''}`}>
          {guia.estado}
        </span>
        <DteBadge estado={guia.dte_estado} />
      </div>

      {isAnulada && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          Guía anulada vía Nota de Crédito.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Receptor</h2>
          <div className="text-sm text-gray-900 dark:text-white">
            {guia.cliente?.nombre ?? '—'} {guia.cliente?.rut && <span className="text-gray-500 ml-1">({guia.cliente.rut})</span>}
          </div>
        </section>
        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fecha y Folio</h2>
          <div className="text-sm text-gray-900 dark:text-white">{fmtDate(guia.fecha)}</div>
          {guia.folio_sii && <div className="text-xs text-gray-500">Folio SII: {guia.folio_sii}</div>}
          {guia.track_id && <div className="text-xs text-gray-500">Track ID: {guia.track_id}</div>}
        </section>
      </div>

      <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Motivo + Destino</h2>
          {canEdit && !editingMeta && (
            <button onClick={startEdit} className="flex items-center gap-1 text-xs text-brand-500 hover:underline">
              <Edit size={12} /> Editar
            </button>
          )}
        </div>
        {!editingMeta ? (
          <div className="text-sm text-gray-900 dark:text-white space-y-1">
            <div><span className="text-gray-500">Motivo:</span> {motivoLabel}</div>
            <div><span className="text-gray-500">Destino:</span> {guia.direccion_destino}, {guia.comuna_destino}</div>
            {guia.email_envio && <div><span className="text-gray-500">Email envío:</span> {guia.email_envio}</div>}
          </div>
        ) : (
          <div className="space-y-2">
            <input className="w-full px-2 py-1.5 text-sm border rounded" value={direccion}
              onChange={e => setDireccion(e.target.value)} placeholder="Dirección" />
            <input className="w-full px-2 py-1.5 text-sm border rounded" value={comuna}
              onChange={e => setComuna(e.target.value)} placeholder="Comuna" />
            <input className="w-full px-2 py-1.5 text-sm border rounded" value={emailEnvio}
              onChange={e => setEmailEnvio(e.target.value)} placeholder="Email envío" type="email" />
            <div className="flex gap-2">
              <button onClick={() => patchMut.mutate()} disabled={patchMut.isPending}
                className="px-3 py-1 text-xs bg-brand-500 text-white rounded">Guardar</button>
              <button onClick={() => setEditingMeta(false)}
                className="px-3 py-1 text-xs border rounded">Cancelar</button>
            </div>
          </div>
        )}
      </section>

      {guia.nota_venta_id && (
        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nota de Venta vinculada</h2>
          <Link to={`/notas-venta/${guia.nota_venta_id}`} className="text-sm text-brand-500 hover:underline">
            N°{guia.nota_venta_id} →
          </Link>
        </section>
      )}

      <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Líneas</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left py-1">Descripción</th>
              <th className="text-right py-1">Cant</th>
              <th className="text-right py-1">Precio</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {guia.lineas.map(l => (
              <tr key={l.id}>
                <td className="py-2 text-gray-900 dark:text-white">{l.descripcion}</td>
                <td className="py-2 text-right text-gray-700 dark:text-gray-300 font-num">{l.cantidad}</td>
                <td className="py-2 text-right text-gray-700 dark:text-gray-300 font-num">{fmtMoney(l.precio_unitario)}</td>
                <td className="py-2 text-right text-gray-900 dark:text-white font-num">{fmtMoney(l.total_linea)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-right text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
          <div>Neto: {fmtMoney(guia.total_neto)}</div>
          <div>IVA: {fmtMoney(guia.total_iva)}</div>
          <div className="font-semibold text-gray-900 dark:text-white">Total: {fmtMoney(guia.total)}</div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {canEmitir && (
          <button onClick={() => emitirMut.mutate()} disabled={emitirMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
            <Send size={14} /> Emitir DTE
          </button>
        )}
        {canRetry && (
          <button onClick={() => emitirMut.mutate()} disabled={emitirMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50">
            <Send size={14} /> Reintentar emisión
          </button>
        )}
        {canPdfEmail && (
          <>
            <button onClick={() => openPdf(`/api/guias-despacho/${guia.id}/pdf`)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
              <Download size={14} /> PDF
            </button>
            <button onClick={() => emailMut.mutate()} disabled={emailMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50">
              <Mail size={14} /> Email
            </button>
          </>
        )}
        {canAnular && (
          <button onClick={handleAnular}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">
            <Trash2 size={14} /> Anular
          </button>
        )}
        {canDelete && (
          <button onClick={() => {
            if (window.confirm('¿Eliminar guía? Solo posible si DTE no fue emitida.')) eliminarMut.mutate()
          }} disabled={eliminarMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
            <Trash2 size={14} /> Eliminar
          </button>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests (must pass)**

Run: `cd frontend && npm test -- --run GuiaDespachoDetalle`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GuiaDespachoDetalle.tsx frontend/src/pages/GuiaDespachoDetalle.test.tsx
git commit -m "feat(guias-fe): detalle page with action panels per state"
```

---

## Wave 3 — Integraciones cross-page

### Task 7: Polling DTE en GuiaDespachoDetalle

**Files:**
- Modify: `frontend/src/pages/GuiaDespachoDetalle.tsx`
- Modify: `frontend/src/pages/GuiaDespachoDetalle.test.tsx`

- [ ] **Step 1: Add failing test for polling**

Append to `GuiaDespachoDetalle.test.tsx`:

```tsx
it('polls every 10s while dte_estado=procesando, stops on aceptada', async () => {
  vi.useFakeTimers()
  const procesando = makeGuia({ dte_estado: 'procesando' })
  const aceptada = makeGuia({ dte_estado: 'aceptada' })
  const mock = vi.mocked(apiGuias.getGuiaDespacho)
  mock.mockResolvedValueOnce(procesando)
       .mockResolvedValueOnce(procesando)
       .mockResolvedValueOnce(aceptada)
  renderPage()
  await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(1))
  await vi.advanceTimersByTimeAsync(10_000)
  await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(2))
  await vi.advanceTimersByTimeAsync(10_000)
  await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(3))
  // tras aceptada el polling debe detenerse
  await vi.advanceTimersByTimeAsync(30_000)
  expect(mock).toHaveBeenCalledTimes(3)
  vi.useRealTimers()
})
```

- [ ] **Step 2: Run test (must fail — polling no implementado)**

Run: `cd frontend && npm test -- --run GuiaDespachoDetalle`
Expected: nuevo test FAIL.

- [ ] **Step 3: Add `refetchInterval` to useQuery**

En `GuiaDespachoDetalle.tsx`, modificar el `useQuery`:

```tsx
const { data: guia, isLoading, isError } = useQuery<GuiaDespacho>({
  queryKey: ['guia-despacho', guiaId],
  queryFn: () => getGuiaDespacho(guiaId),
  enabled: !!guiaId,
  refetchInterval: (query) => {
    const d = query.state.data as GuiaDespacho | undefined
    if (d && (d.dte_estado === 'pendiente' || d.dte_estado === 'procesando')) return 10_000
    return false
  },
})
```

- [ ] **Step 4: Run tests (must pass)**

Run: `cd frontend && npm test -- --run GuiaDespachoDetalle`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GuiaDespachoDetalle.tsx frontend/src/pages/GuiaDespachoDetalle.test.tsx
git commit -m "feat(guias-fe): poll DTE state every 10s while procesando"
```

---

### Task 8: Botón "Generar guía" en NotaVentaDetalle

**Files:**
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

- [ ] **Step 1: Locate "Generar Factura" button reference**

Run: `grep -n "Generar Factura" frontend/src/pages/NotaVentaDetalle.tsx`
Expected: ~línea 548. Leer 30 líneas alrededor para entender contexto (estado NV, condicionales, permisos).

- [ ] **Step 2: Verify import of `Truck` icon (or add)**

Run: `grep -n "from 'lucide-react'" frontend/src/pages/NotaVentaDetalle.tsx`
Expected: una línea con imports. Si `Truck` no está, agregarlo a la lista.

- [ ] **Step 3: Add "Generar guía" button next to "Generar Factura"**

Justo después del botón "Generar Factura" (que está alrededor de línea 548), insertar:

```tsx
{nv && nv.estado !== 'cancelada' && (
  <button
    onClick={() => navigate(`/guias-despacho/nueva?nv_id=${nv.id}`)}
    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
    title="Crear guía de despacho desde esta NV"
  >
    <Truck size={15} /> Generar guía
  </button>
)}
```

**Nota subagent:** Verificar nombre real de la variable que tiene la NV cargada (ej. puede ser `nv`, `notaVenta`, `data`). Ajustar `nv.id`, `nv.estado` al nombre correcto.

- [ ] **Step 4: Smoke test manual**

Run: `cd frontend && npm run dev` (background)
Navegar a una NV existente (`/notas-venta/<id>`). Verificar botón "Generar guía". Click → debe navegar a `/guias-despacho/nueva?nv_id=<id>` y mostrar el banner "Cargado desde NV N°<id>".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/NotaVentaDetalle.tsx
git commit -m "feat(guias-fe): add 'Generar guía' button on NotaVentaDetalle"
```

---

### Task 9: Cargar NV en GuiaDespachoNueva (?nv_id=X)

**Files:**
- Modify: `frontend/src/pages/GuiaDespachoNueva.tsx`
- Modify: `frontend/src/pages/GuiaDespachoNueva.test.tsx`

- [ ] **Step 1: Identificar endpoint NV detalle**

Run: `grep -rn "/api/notas-venta/" frontend/src/api/ frontend/src/pages/NotaVentaDetalle.tsx | head -10`
Esperado: encontrar el GET de NV (tipico `api.get('/api/notas-venta/{id}')`). Tomar el `type` que devuelve (probablemente `NotaVenta` con `lineas`, `cliente_id`, `direccion_despacho` o similar).

- [ ] **Step 2: Write failing test**

Append to `GuiaDespachoNueva.test.tsx`:

```tsx
import * as apiNv from '../api/notasVenta'  // ajustar al módulo real

vi.mock('../api/notasVenta')  // ajustar

it('autopopulates form from ?nv_id query param', async () => {
  const mockNv = {
    id: 99, cliente_id: 7, empresa_id: 3,
    direccion_despacho: 'Av desde NV 99', comuna: 'Maipu',
    cliente: { id: 7, nombre: 'ACME', rut: '11111111-1' },
    lineas: [{ orden: 0, descripcion: 'Item NV', cantidad: '3', precio_unitario: '500', descuento_pct: '0', exenta: false }],
  }
  vi.mocked(apiNv.getNotaVenta).mockResolvedValue(mockNv as any)
  // render con ?nv_id=99
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/guias-despacho/nueva?nv_id=99']}>
        <Routes>
          <Route path="/guias-despacho/nueva" element={<GuiaDespachoNueva />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  await waitFor(() => expect(screen.getByDisplayValue(/av desde nv 99/i)).toBeInTheDocument())
  expect(screen.getByDisplayValue(/maipu/i)).toBeInTheDocument()
  expect(screen.getByText(/cliente: ACME/i)).toBeInTheDocument()
  expect(screen.getByDisplayValue('Item NV')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test (must fail)**

Run: `cd frontend && npm test -- --run GuiaDespachoNueva`
Expected: nuevo test FAIL.

- [ ] **Step 4: Implement autopopulación**

En `GuiaDespachoNueva.tsx`, reemplazar el `useEffect` que solo guarda `notaVentaId`:

```tsx
import { getNotaVenta } from '../api/notasVenta'  // verificar el módulo y nombre real

// Dentro del componente:
useEffect(() => {
  if (!nvIdParam) return
  const id = Number(nvIdParam)
  setNotaVentaId(id)
  getNotaVenta(id)
    .then(nv => {
      if (nv.cliente_id) {
        setClienteId(nv.cliente_id)
        setClienteNombre(nv.cliente?.nombre ?? `Cliente ${nv.cliente_id}`)
      }
      if (nv.direccion_despacho) setDireccion(nv.direccion_despacho)
      if (nv.comuna) setComuna(nv.comuna)
      if (nv.lineas && nv.lineas.length > 0) {
        setLineas(nv.lineas.map(l => ({
          descripcion: l.descripcion,
          cantidad: String(l.cantidad),
          precio_unitario: String(l.precio_unitario),
          descuento_pct: String(l.descuento_pct ?? 0),
          exenta: !!l.exenta,
        })))
      }
    })
    .catch(() => {
      setError(`No se pudo cargar la NV ${id}`)
    })
}, [nvIdParam])
```

**Nota subagent:** Verificar nombres exactos de campos de `NotaVenta` en `frontend/src/api/notasVenta.ts` (o similar). Algunos posibles: `direccion_despacho` puede llamarse `sede_despacho` o `direccion`. Adaptar.

- [ ] **Step 5: Run tests (must pass)**

Run: `cd frontend && npm test -- --run GuiaDespachoNueva`
Expected: all tests PASS.

- [ ] **Step 6: Smoke test manual**

Run: `cd frontend && npm run dev`. Click "Generar guía" desde una NV. Confirmar que el form se autopobla con cliente, dirección, comuna y líneas. Editar 1 línea y submit. Verificar guía creada con `nota_venta_id` correcto via `/api/guias-despacho/<id>` en network tab.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/GuiaDespachoNueva.tsx frontend/src/pages/GuiaDespachoNueva.test.tsx
git commit -m "feat(guias-fe): auto-populate nueva form from ?nv_id query"
```

---

### Task 10: NotaCreditoNueva soporta `?guia_despacho_id=X`

**Files:**
- Modify: `frontend/src/pages/NotaCreditoNueva.tsx`

- [ ] **Step 1: Read current file to understand structure**

Run: `cat frontend/src/pages/NotaCreditoNueva.tsx`. La página actual es minimalista (input raw `clienteId`, sin ClienteSelectModal). Solo necesitamos extender — NO refactorizar.

- [ ] **Step 2: Write failing test (smoke check)**

Crear `frontend/src/pages/NotaCreditoNueva.test.tsx` (puede que no exista todavía):

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import NotaCreditoNueva from './NotaCreditoNueva'
import * as apiGuias from '../api/guiasDespacho'

vi.mock('../api/guiasDespacho')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotaCreditoNueva', () => {
  it('precharges from ?guia_despacho_id=X', async () => {
    const mockGuia = {
      id: 42, numero: 100, cliente_id: 7,
      cliente: { id: 7, nombre: 'ACME', rut: '11111111-1' },
      lineas: [{ id: 1, orden: 0, descripcion: 'Producto X',
        cantidad: '2', precio_unitario: '5000', descuento_pct: '0',
        exenta: false, total_neto: '10000', iva: '1900', total_linea: '11900' }],
    }
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(mockGuia as any)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/notas-credito/nueva?guia_despacho_id=42']}>
          <Routes>
            <Route path="/notas-credito/nueva" element={<NotaCreditoNueva />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText(/anulará la guía N°100/i)).toBeInTheDocument())
    expect(screen.getByDisplayValue('Producto X')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/anulación guía despacho/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test (must fail)**

Run: `cd frontend && npm test -- --run NotaCreditoNueva`
Expected: FAIL.

- [ ] **Step 4: Modify `NotaCreditoNueva.tsx`**

Insertar al inicio del componente (después de los useState existing):

```tsx
import { useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { getGuiaDespacho } from '../api/guiasDespacho'

// dentro del componente, junto a los useState:
const [searchParams] = useSearchParams()
const guiaDespachoId = searchParams.get('guia_despacho_id')
const [guiaNumero, setGuiaNumero] = useState<number | null>(null)

useEffect(() => {
  if (!guiaDespachoId) return
  getGuiaDespacho(Number(guiaDespachoId))
    .then(g => {
      setClienteId(String(g.cliente_id ?? ''))
      setRazon(`Anulación guía despacho N°${g.numero}`)
      setGuiaNumero(g.numero)
      setLineas(g.lineas.map(l => ({
        descripcion: l.descripcion,
        cantidad: String(l.cantidad),
        precio_unitario: String(l.precio_unitario),
      })))
    })
    .catch(() => setError('No se pudo cargar la guía vinculada'))
}, [guiaDespachoId])
```

Modificar el `body` del POST para incluir `guia_despacho_id`:

```tsx
const body = {
  fecha,
  cliente_id: Number(clienteId),
  razon,
  ...(guiaDespachoId ? { guia_despacho_id: Number(guiaDespachoId) } : {}),
  lineas: lineas.map((l, i) => ({
    orden: i,
    descripcion: l.descripcion,
    cantidad: Number(l.cantidad),
    precio_unitario: Number(l.precio_unitario),
  })),
}
```

Insertar banner debajo del `<h1>`:

```tsx
{guiaNumero && (
  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
    Esta NC anulará la guía N°{guiaNumero} cuando sea aceptada por SII.
  </div>
)}
```

- [ ] **Step 5: Run tests (must pass)**

Run: `cd frontend && npm test -- --run NotaCreditoNueva`
Expected: PASS.

- [ ] **Step 6: Smoke test manual**

Desde una guía aceptada → click "Anular" → confirmar prompt → debe abrir NotaCreditoNueva con cliente, líneas y razón precargados. Submit. Verificar en network: POST `/api/dte/notas-credito/` con `guia_despacho_id` en body.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/NotaCreditoNueva.tsx frontend/src/pages/NotaCreditoNueva.test.tsx
git commit -m "feat(guias-fe): NotaCreditoNueva precharge from ?guia_despacho_id"
```

---

## Wave 4 — End-to-end smoke + lint check

### Task 11: Lint + typecheck + full suite

**Files:** none (verification only)

- [ ] **Step 1: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run full vitest suite**

Run: `cd frontend && npm test -- --run`
Expected: all pre-existing tests still pass + 13 new tests added (3 list + 4 nueva + 5 detalle + 1 NC).

- [ ] **Step 3: Run backend test suite**

Run: `cd backend && pytest tests/test_guias_despacho.py -v`
Expected: all pass.

- [ ] **Step 4: Manual smoke flow**

Run: `cd backend && uvicorn app.main:app --reload` (background) y `cd frontend && npm run dev` (background).

Manual sequence:
1. Login admin.
2. Navigate `/guias-despacho` → empty list.
3. Click "Nueva guía" → form vacío.
4. Pick cliente, motivo=1, dirección, comuna, 1 línea (cantidad=2, precio=5000).
5. Click "Guardar borrador" → redirect a detalle, dte_estado=`no_emitida`.
6. Click "Emitir DTE" → dte_estado pasa a `procesando`, polling visible.
7. Esperar (o forzar webhook mock) hasta `aceptada`.
8. Verificar PDF descarga.
9. Click "Anular" → confirma → redirect a `/notas-credito/nueva?guia_despacho_id=X` con form precargado.
10. Submit NC → cuando NC pasa a `aceptada`, volver a `/guias-despacho/<id>` y verificar `estado=anulada`.
11. Volver a `/notas-venta/<existing>` → click "Generar guía" → verificar autopoblación.
12. Stop servers.

- [ ] **Step 5: Final commit (si hubo cambios menores en smoke fixes)**

```bash
git status
# si hay cambios pendientes:
git add -p
git commit -m "fix(guias-fe): minor smoke-test fixes"
```

- [ ] **Step 6: Update PROGRESS.md**

Append to `PROGRESS.md` debajo de Wave 1 entry:
```markdown
- [x] **W1-05 — Guía de despacho electrónica 52 (frontend)**
  - Páginas `/guias-despacho` (lista filtros + export Excel), `/guias-despacho/nueva` (form con cliente modal + cargar-desde-NV), `/guias-despacho/:id` (detalle + polling DTE 10s)
  - Anulación: redirect a `/notas-credito/nueva?guia_despacho_id=X` con form precargado; banner read-only mientras existe el query param
  - Botón "Generar guía" en `NotaVentaDetalle` (autopobla cliente, dirección, líneas via `?nv_id=X`)
  - Tests: 4 GuiasDespachoList / 5 GuiaDespachoNueva / 6 GuiaDespachoDetalle (incl. polling) / 1 NotaCreditoNueva precarga
  - Backend: endpoint `GET /api/guias-despacho/export/excel` (12 columnas) agregado
```

```bash
git add PROGRESS.md
git commit -m "docs(progress): W1-05 frontend guía despacho 52 — Phase 2 complete"
```

---

## Self-Review Checklist (subagent runs at end)

- [ ] **Spec coverage:**
  - SC1 (lista paginable + filtros + componentes canónicos) → Task 4 ✓
  - SC2 (nueva con ClienteSelectModal + ProductoAutocomplete + motivo) → Task 5 (autocomplete reusa boleta-style line input — sin componente dedicado todavía; OK por scope) ✓
  - SC3 (detalle con polling, líneas, totales, PDF, email, anular) → Tasks 6 + 7 ✓
  - SC4 (cargar desde NV) → Tasks 8 + 9 ✓
  - SC5 (anulación redirige a NC) → Tasks 6 + 10 ✓
  - SC6 (tests render + interacción + polling) → Tasks 4-10 ✓
- [ ] **Placeholder scan:** Buscar "TODO", "TBD", "implement later" en el plan. Si encuentra, es un bug del plan.
- [ ] **Type consistency:**
  - `GuiaDespacho.dte_estado` usado en Tasks 1, 4, 6, 7 — todas con misma union.
  - `MotivoTraslado` typed como `1 | ... | 9` en Task 1 + usado en Task 4/5.
  - `eliminarGuiaDespacho` retorna `void` (Task 1) — usado en Task 4 (lista) y Task 6 (detalle).

---

## Out of Scope (revisar antes de cerrar)

- **`ProductoAutocomplete` real con sugerencias por historial** — actualmente usamos line editor simple (descripción + cantidad + precio). Si UX en producción exige autocomplete con sugerencias, agregar como follow-up separado (no bloquea Phase 2 success criteria mínimas, ya que SC2 solo dice "reutilizando autocomplete de productos" — interpretación: el line editor canónico del PMS, que es plain).
- **Sedes de despacho dropdown** — diferido. Cliente con `empresa_id` + sedes podría poblar destino. Si llega request, agregar como sub-task post-Phase 2.
- **`AnularConfirmModal` reutilizable** — usamos `window.confirm` minimalista; suficiente para M1.
- **Audit trail link** — diferido. La auditoría existe en backend (D-25 del Phase 1 spec), pero exponerla en este detalle es out of scope para M1.

---

*Plan version: 1.0 — 2026-04-26*
