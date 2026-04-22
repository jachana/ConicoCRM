# Cotizaciones Export Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the export preview showing no items, and replace the always-visible side panel with a modal triggered by an "Exportar" button.

**Architecture:** Two independent changes — a one-line backend schema fix that exposes `lineas` in the list endpoint, and a frontend-only refactor of `Cotizaciones.tsx` that removes the split layout and adds an export modal with a discard confirmation.

**Tech Stack:** FastAPI + Pydantic (backend), React + TypeScript + TailwindCSS + lucide-react (frontend)

---

## File Map

| File | Change |
|------|--------|
| `backend/app/schemas/cotizacion.py` | Add `lineas` field to `CotizacionListOut` |
| `backend/tests/test_cotizacion_list_lineas.py` | New test: list endpoint returns lineas |
| `frontend/src/pages/Cotizaciones.tsx` | Remove split layout + tabs, add export modal |

`ExportPreviewPanel.tsx` and `columnDefs.ts` are **not modified**.

---

## Task 1: Backend — Add lineas to CotizacionListOut

**Files:**
- Modify: `backend/app/schemas/cotizacion.py`
- Create: `backend/tests/test_cotizacion_list_lineas.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_cotizacion_list_lineas.py`:

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_list_cotizaciones_includes_lineas(auth_headers, db_with_cotizacion):
    """List endpoint must return lineas so the frontend preview can flatten them."""
    response = client.get("/api/cotizaciones/", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    first = data[0]
    assert "lineas" in first, "CotizacionListOut must include lineas"
```

> Note: `auth_headers` and `db_with_cotizacion` are fixtures expected to exist in `conftest.py`. If they don't exist yet, check `backend/tests/conftest.py` and adapt fixture names to match what's already there. The assertion is the important part.

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend
pytest tests/test_cotizacion_list_lineas.py -v
```

Expected: FAIL — `AssertionError: CotizacionListOut must include lineas`

- [ ] **Step 3: Add lineas to CotizacionListOut**

In `backend/app/schemas/cotizacion.py`, update `CotizacionListOut` — add the `lineas` field before `model_config`:

```python
class CotizacionListOut(BaseModel):
    id: int
    numero: int
    cliente_id: int
    vendedor_id: int
    contacto: str | None = None
    fecha: date
    estado: str
    correo: str | None = None
    terminos_pago: str | None = None
    terminos_pago_estado: str = "aprobado"
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    margen_total: Decimal | None = None
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    lineas: list[CotizacionLineaOut] = []
    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend
pytest tests/test_cotizacion_list_lineas.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/cotizacion.py backend/tests/test_cotizacion_list_lineas.py
git commit -m "fix(cotizaciones): include lineas in CotizacionListOut so export preview has data"
```

---

## Task 2: Frontend — Remove split layout and mobile tab toggle

**Files:**
- Modify: `frontend/src/pages/Cotizaciones.tsx`

- [ ] **Step 1: Remove tab state and toggle UI**

In `Cotizaciones.tsx`:

Remove the state declaration (around line 146):
```tsx
// DELETE this line:
const [activeTab, setActiveTab] = useState<'list' | 'preview'>('list')
```

Remove the mobile tab toggle block (around lines 439–450):
```tsx
// DELETE this entire block:
{/* Mobile tab toggle */}
<div className="lg:hidden flex gap-0 mb-4 border-b border-gray-200 dark:border-gray-800">
  {(['list', 'preview'] as const).map(tab => (
    <button key={tab} onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        activeTab === tab
          ? 'border-brand-500 text-brand-600 dark:text-brand-400'
          : 'border-transparent text-gray-500 dark:text-gray-400'
      }`}>
      {tab === 'list' ? 'Lista' : 'Vista previa'}
    </button>
  ))}
</div>
```

- [ ] **Step 2: Replace split layout with full-width single column**

Replace the split layout wrapper and both panel divs (around lines 452–588):

```tsx
{/* Full-width list */}
<div>
  {isLoading ? (
    <div className="text-gray-400 py-12 text-center text-sm">Cargando...</div>
  ) : cotizaciones.length === 0 ? (
    <div className="text-gray-400 py-12 text-center text-sm">Sin cotizaciones</div>
  ) : (
    <>
      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {cotizaciones.map(c => (
          /* ... keep existing mobile card JSX unchanged ... */
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
        {/* ... keep existing desktop table JSX unchanged ... */}
      </div>
    </>
  )}
</div>
```

> Keep the mobile card and desktop table JSX exactly as they are — only remove the outer `lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start` wrapper and the right panel div that contained `ExportPreviewPanel`.

- [ ] **Step 3: Remove unused state and imports**

Remove `exportFilename` memo (it will move to Task 3).  
Verify `ExportPreviewPanel` import is still present (needed for Task 3).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Cotizaciones.tsx
git commit -m "refactor(cotizaciones): remove split layout, list is now full width"
```

---

## Task 3: Frontend — Add Export button and modal

**Files:**
- Modify: `frontend/src/pages/Cotizaciones.tsx`

- [ ] **Step 1: Add modal state and Download import**

At the top of the imports add `Download` to the lucide-react import:
```tsx
import { Plus, FileText, Mail, Trash2, Eye, ChevronDown, X, Download } from 'lucide-react'
```

Add two state declarations alongside the existing UI state (around line 143):
```tsx
const [showExportModal, setShowExportModal] = useState(false)
const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
```

- [ ] **Step 2: Add Exportar button to the header**

The header div currently looks like (around line 266):
```tsx
<div className="flex items-center justify-between mb-5 gap-2">
  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Cotizaciones</h1>
  <div className="flex items-center gap-2">
    <button onClick={() => navigate('/cotizaciones/nueva')}
      className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-500 hover:bg-brand-400 text-gray-900 text-sm font-semibold rounded-lg transition-colors">
      <Plus size={16} />
      <span className="hidden sm:inline">Nueva cotización</span>
      <span className="sm:hidden">Nueva</span>
    </button>
  </div>
</div>
```

Replace it with:
```tsx
<div className="flex items-center justify-between mb-5 gap-2">
  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Cotizaciones</h1>
  <div className="flex items-center gap-2">
    <button
      onClick={() => setShowExportModal(true)}
      className="flex items-center gap-2 px-3 md:px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
    >
      <Download size={16} />
      <span className="hidden sm:inline">Exportar</span>
    </button>
    <button onClick={() => navigate('/cotizaciones/nueva')}
      className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-500 hover:bg-brand-400 text-gray-900 text-sm font-semibold rounded-lg transition-colors">
      <Plus size={16} />
      <span className="hidden sm:inline">Nueva cotización</span>
      <span className="sm:hidden">Nueva</span>
    </button>
  </div>
</div>
```

- [ ] **Step 3: Add export modal and discard confirmation**

Add these two modals just before the closing `</div>` of the component return (after the existing delete modal and email toast):

```tsx
{/* Export modal */}
{showExportModal && (
  <div
    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    onClick={() => setShowDiscardConfirm(true)}
  >
    <div
      className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Exportar cotizaciones</h2>
        <button
          onClick={() => setShowDiscardConfirm(true)}
          className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-5 overflow-y-auto">
        <ExportPreviewPanel
          lines={flatLines}
          availableColumns={COTIZACION_COLUMN_DEFS}
          isLoading={isLoading}
          exportBaseUrl={exportBaseUrl}
          storageKey="cotizaciones-preview-cols"
          filename={exportFilename}
        />
      </div>
    </div>
  </div>
)}

{/* Discard confirmation */}
{showDiscardConfirm && (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-full max-w-sm">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">¿Descartar exportación?</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Volverás a la lista de cotizaciones.</p>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setShowDiscardConfirm(false)}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          Cancelar
        </button>
        <button
          onClick={() => { setShowDiscardConfirm(false); setShowExportModal(false) }}
          className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
        >
          Descartar
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Ensure exportFilename memo is present**

Verify this memo exists in the component (was previously there, may have been removed in Task 2 cleanup — re-add if missing):

```tsx
const exportFilename = useMemo(
  () => `cotizaciones-${new Date().toISOString().split('T')[0]}.xlsx`,
  [],
)
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Cotizaciones.tsx
git commit -m "feat(cotizaciones): replace export side panel with triggered modal + discard confirm"
```
