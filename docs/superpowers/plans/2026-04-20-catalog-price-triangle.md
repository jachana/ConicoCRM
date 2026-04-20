# Catalog Price Triangle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive cost/price/margin triangle to the Producto create/edit modal so changing any one field auto-recalculates the appropriate other, with validation that blocks saving when margin ≤ 0 or price ≤ cost.

**Architecture:** Purely frontend change in `Productos.tsx`. `margen` is a derived UI field — it is never sent to the API. The DB continues to store only `precio_costo` and `precio_venta`. Triangle logic lives in three `onChange` handlers. Submit-time validation shows a toast-style error and disables the save button.

**Tech Stack:** React (useState), TypeScript, Tailwind CSS — no new dependencies.

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/pages/Productos.tsx` | Add `margen` to `FormData`, compute on open, add triangle handlers, replace generic price loop with explicit fields, add inline + submit validation |

---

### Task 1: Add `margen` to `FormData` and compute it on modal open

**Files:**
- Modify: `frontend/src/pages/Productos.tsx:6-57`

- [ ] **Step 1: Add `margen` to `FormData` type and `EMPTY_FORM`**

Replace lines 6-19:

```tsx
type FormData = {
  nombre: string
  descripcion: string
  precio_costo: string
  precio_venta: string
  margen: string        // UI-only, never sent to API
  stock_minimo: string
  stock_actual: string
  proveedor_id: string
}

const EMPTY_FORM: FormData = {
  nombre: '', descripcion: '', precio_costo: '0', precio_venta: '0',
  margen: '0', stock_minimo: '0', stock_actual: '0', proveedor_id: '',
}
```

- [ ] **Step 2: Add a helper to compute margin from cost and price**

Add this function right after `formatPrecio` (after line 23):

```tsx
function calcMargen(costo: string, venta: string): string {
  const c = parseFloat(costo)
  const v = parseFloat(venta)
  if (!v || v <= 0) return '0'
  const m = ((v - c) / v) * 100
  return isNaN(m) ? '0' : m.toFixed(2)
}
```

- [ ] **Step 3: Set initial `margen` when opening the edit modal**

In `abrirEditar` (currently lines 45-57), add `margen` to the `setForm` call:

```tsx
function abrirEditar(p: Producto) {
  setEditando(p)
  const costo = String(p.precio_costo)
  const venta = String(p.precio_venta)
  setForm({
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    precio_costo: costo,
    precio_venta: venta,
    margen: calcMargen(costo, venta),
    stock_minimo: String(p.stock_minimo),
    stock_actual: String(p.stock_actual),
    proveedor_id: p.proveedor_id ? String(p.proveedor_id) : '',
  })
  setError(null); setModalOpen(true)
}
```

- [ ] **Step 4: Verify TypeScript compiles without errors**

```bash
cd C:/Otros/Conico/frontend && npx tsc --noEmit
```

Expected: no errors (or only pre-existing unrelated errors)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Productos.tsx
git commit -m "feat: add margen field to FormData with initial computation"
```

---

### Task 2: Add triangle onChange handlers

**Files:**
- Modify: `frontend/src/pages/Productos.tsx` (after the mutations, before the return)

- [ ] **Step 1: Add the three handlers after the `eliminar` mutation block (after line 83)**

```tsx
function handleCostoChange(val: string) {
  setForm(f => {
    const m = parseFloat(f.margen)
    const c = parseFloat(val)
    if (!isNaN(m) && m > 0 && !isNaN(c)) {
      const newVenta = (c / (1 - m / 100)).toFixed(2)
      return { ...f, precio_costo: val, precio_venta: newVenta }
    }
    return { ...f, precio_costo: val }
  })
}

function handleVentaChange(val: string) {
  setForm(f => {
    return { ...f, precio_venta: val, margen: calcMargen(f.precio_costo, val) }
  })
}

function handleMargenChange(val: string) {
  setForm(f => {
    const m = parseFloat(val)
    const c = parseFloat(f.precio_costo)
    if (!isNaN(m) && m > 0 && !isNaN(c) && c > 0) {
      const newVenta = (c / (1 - m / 100)).toFixed(2)
      return { ...f, margen: val, precio_venta: newVenta }
    }
    return { ...f, margen: val }
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Otros/Conico/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Productos.tsx
git commit -m "feat: add price triangle onChange handlers"
```

---

### Task 3: Replace generic price loop with explicit triangle fields in the modal

The current modal uses a generic `.map()` loop for `precio_costo` and `precio_venta` (lines 189-201). Replace that entire loop with explicit fields for all three triangle inputs plus the two stock fields.

**Files:**
- Modify: `frontend/src/pages/Productos.tsx:189-201`

- [ ] **Step 1: Add a `priceError` derived value just before the return statement**

Right before `return (` add:

```tsx
const costo = parseFloat(form.precio_costo)
const venta = parseFloat(form.precio_venta)
const margenVal = parseFloat(form.margen)
const priceError =
  venta <= costo ? 'El precio de venta debe ser mayor al costo' :
  margenVal <= 0 ? 'El margen debe ser mayor a 0%' :
  null
```

- [ ] **Step 2: Replace the generic loop with explicit fields**

Replace lines 189-201 (the `.map()` block with `precio_costo`, `precio_venta`, `stock_minimo`, `stock_actual`):

```tsx
{/* Triangle: Costo */}
<div>
  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Precio costo ($)</label>
  <input
    type="number" min="0" step="0.01"
    value={form.precio_costo}
    onChange={e => handleCostoChange(e.target.value)}
    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
  />
</div>

{/* Triangle: Venta */}
<div>
  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Precio venta ($)</label>
  <input
    type="number" min="0" step="0.01"
    value={form.precio_venta}
    onChange={e => handleVentaChange(e.target.value)}
    className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none ${
      venta <= costo ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
    }`}
  />
  {venta <= costo && (
    <p className="mt-1 text-xs text-red-500">Debe ser mayor al costo</p>
  )}
</div>

{/* Triangle: Margen */}
<div>
  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Margen (%)</label>
  <div className="relative">
    <input
      type="number" min="0" step="0.01"
      value={form.margen}
      onChange={e => handleMargenChange(e.target.value)}
      className={`w-full px-3 py-2 pr-7 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none ${
        margenVal <= 0 ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
      }`}
    />
    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
  </div>
  {margenVal <= 0 && (
    <p className="mt-1 text-xs text-red-500">Debe ser mayor a 0%</p>
  )}
</div>

{/* Stocks */}
<div>
  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Stock mínimo</label>
  <input
    type="number" min="0" step="1"
    value={form.stock_minimo}
    onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))}
    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
  />
</div>
<div>
  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Stock actual</label>
  <input
    type="number" min="0" step="1"
    value={form.stock_actual}
    onChange={e => setForm(f => ({ ...f, stock_actual: e.target.value }))}
    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
  />
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd C:/Otros/Conico/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Productos.tsx
git commit -m "feat: replace generic price loop with explicit triangle fields in modal"
```

---

### Task 4: Block save when validation fails

**Files:**
- Modify: `frontend/src/pages/Productos.tsx` — the form's `onSubmit` and the submit button

- [ ] **Step 1: Guard the submit handler**

Replace the `onSubmit` on the `<form>` element:

```tsx
<form
  onSubmit={e => {
    e.preventDefault()
    if (priceError) { setError(priceError); return }
    guardar.mutate(form)
  }}
  className="px-6 py-4 grid grid-cols-2 gap-4"
>
```

- [ ] **Step 2: Disable the save button while `priceError` is active**

Update the submit button's `disabled` prop:

```tsx
<button
  type="submit"
  disabled={guardar.isPending || !!priceError}
  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
>
  {guardar.isPending ? 'Guardando...' : 'Guardar'}
</button>
```

- [ ] **Step 3: Strip `margen` from the API payload**

In the `guardar` mutation's `mutationFn`, `margen` is already absent from the payload object — confirm it stays that way. The payload should contain only: `nombre`, `descripcion`, `precio_costo`, `precio_venta`, `stock_minimo`, `stock_actual`, `proveedor_id`.

- [ ] **Step 4: Verify TypeScript compiles and dev server starts**

```bash
cd C:/Otros/Conico/frontend && npx tsc --noEmit
```

Then start the dev server and manually verify:
- Open "Agregar producto", set cost=100, price=80 → price field turns red, save disabled
- Set cost=100, price=100 → margin=0, margin field turns red, save disabled
- Set cost=100, price=150 → margin shows ~33.33%, save enabled
- Change margin to 50 → price auto-updates to 200
- Change cost to 120 (margin=50 stays) → price auto-updates to 240
- Edit an existing product → margin pre-populated correctly

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Productos.tsx
git commit -m "feat: block save on invalid price/margin, disable save button"
```
