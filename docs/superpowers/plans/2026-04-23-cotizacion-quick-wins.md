# Cotización Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix discount display in read-only cotización view and switch product autocomplete to server-side search (adds tag support).

**Architecture:** Both changes are isolated to a single file. Task 1 replaces a disabled `<input>` with conditional JSX. Task 2 replaces a synchronous local filter function with an async API call, keeping the existing autocomplete state and UI unchanged.

**Tech Stack:** React 18, TypeScript, TanStack Query, Axios (`api`), Tailwind CSS

---

## Files

| File | Changes |
|------|---------|
| `frontend/src/pages/CotizacionDetalle.tsx` | Both tasks — discount cell rendering + autocomplete fetch |

---

### Task 1: Discount — plain text in read-only mode

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx` around line 1087–1098

**Context:** The discount cell currently renders a `<input type="number" disabled={isLocked}>` in all states. When `isLocked` is true the input is greyed-out and uneditable — it should instead render plain text.

- [ ] **Step 1: Replace the discount cell with conditional rendering**

Find this block (around line 1087):

```tsx
<td className="px-2 py-1">
  <input
    type="number"
    min={0}
    max={100}
    step={0.1}
    value={linea.descuento ?? 0}
    onChange={e => updateLinea(idx, { descuento: Number(e.target.value) })}
    disabled={isLocked}
    className="w-16 text-right border border-gray-300 rounded-lg px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
  />
</td>
```

Replace with:

```tsx
<td className="px-2 py-1 w-20">
  {isLocked ? (
    <span className="block text-right text-sm text-gray-900 dark:text-white pr-1">
      {Number(linea.descuento ?? 0) > 0 ? `${linea.descuento}%` : '—'}
    </span>
  ) : (
    <input
      type="number"
      min={0}
      max={100}
      step={0.1}
      value={linea.descuento ?? 0}
      onChange={e => updateLinea(idx, { descuento: Number(e.target.value) })}
      className="w-16 text-right border border-gray-300 rounded-lg px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  )}
</td>
```

- [ ] **Step 2: Verify visually**

Open a locked cotización in the browser. Confirm:
- Discount column shows `15%` (or whatever the value is) as plain text, not a greyed input.
- Discount column shows `—` when discount is 0.
- Open an unlocked cotización in edit mode. Confirm the input still works.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "fix: show discount as plain text in locked cotizacion view"
```

---

### Task 2: Product autocomplete — async /buscar endpoint

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx` around lines 278–348

**Context:** Currently `filterProductos(q)` filters a pre-loaded list of all products synchronously (name/SKU/formato only — no tags). Replace with an async call to `/api/productos/buscar?q=`, which searches name + SKU + tags server-side. The existing `autocompleteResults` state and dropdown UI are unchanged.

- [ ] **Step 1: Replace filterProductos with fetchAutocomplete**

Find and remove this function (around line 332):

```ts
function filterProductos(q: string): Producto[] {
  const lower = q.toLowerCase()
  return productos.filter(p =>
    p.nombre.toLowerCase().includes(lower) ||
    (p.sku ?? '').toLowerCase().includes(lower) ||
    (p.formato ?? '').toLowerCase().includes(lower)
  ).slice(0, 10)
}
```

Replace with:

```ts
async function fetchAutocomplete(q: string) {
  if (q.length < 2) { setAutocompleteResults([]); return }
  try {
    const res = await api.get<Producto[]>(`/api/productos/buscar?q=${encodeURIComponent(q)}`)
    setAutocompleteResults(res.data)
  } catch {
    setAutocompleteResults([])
  }
}
```

- [ ] **Step 2: Update handleDescripcionChange to call fetchAutocomplete**

Find (around line 341):

```ts
function handleDescripcionChange(idx: number, value: string, e: React.ChangeEvent<HTMLInputElement>) {
  const rect = e.currentTarget.getBoundingClientRect()
  const above = rect.bottom + 280 > window.innerHeight
  setDropdownRect({ top: above ? rect.top : rect.bottom, left: rect.left, width: rect.width, above })
  setAutocompleteIdx(idx)
  setAutocompleteResults(filterProductos(value))
  updateLinea(idx, { descripcion: value })
}
```

Replace the `setAutocompleteResults(filterProductos(value))` line:

```ts
function handleDescripcionChange(idx: number, value: string, e: React.ChangeEvent<HTMLInputElement>) {
  const rect = e.currentTarget.getBoundingClientRect()
  const above = rect.bottom + 280 > window.innerHeight
  setDropdownRect({ top: above ? rect.top : rect.bottom, left: rect.left, width: rect.width, above })
  setAutocompleteIdx(idx)
  fetchAutocomplete(value)
  updateLinea(idx, { descripcion: value })
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd C:/Otros/Conico/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or pre-existing errors unrelated to these files).

- [ ] **Step 4: Verify visually**

Open a cotización in edit mode. In a product description field, type a tag name (e.g. a tag that exists in the DB but is not part of the product name). Confirm the product appears in the autocomplete dropdown.

Also type a partial SKU and confirm it finds the product.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: switch cotizacion product autocomplete to /buscar endpoint (adds tag search)"
```
