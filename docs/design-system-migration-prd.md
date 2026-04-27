# PRD — Design System v2 ("Refined SaaS") Migration

**Status:** In progress
**Owner:** Frontend
**Last updated:** 2026-04-27
**Related:** `frontend/src/components/ui/*`, `PROGRESS.md` → "Design System v2"

---

## 1. Problem

The Conico CRM frontend (~30+ pages) was built incrementally over several months. Each page hand-rolled its own buttons, inputs, modals, tables, badges, and toasts. The result:

- **Visual drift** — buttons in 4 different shapes, modals with inconsistent paddings, badges using raw Tailwind colors (`bg-red-500`, `bg-orange-500`) instead of semantic tokens.
- **A11y gaps** — missing `aria-label` on icon-only buttons, dropdowns built from `<div>` instead of Radix.
- **No tabular numerals** — money columns shifted as digits typed.
- **Toast inconsistency** — half the app used a local `emailToast` state with `setTimeout`; half used `sonner`.
- **Maintenance cost** — fixing a hover color or a focus ring required editing dozens of files.

## 2. Goal

Migrate every page onto a shared, semantic, accessible primitive layer (`components/ui/*`) so:

1. Visual treatment is **consistent** across the app (one Button, one Modal, one Table).
2. Color decisions are **semantic** (brand / success / warning / danger / info — never raw `red-500`).
3. **A11y baselines** are met (focus rings, aria-labels, Radix primitives for dialogs/popovers).
4. New features ship faster — devs compose primitives instead of re-deriving CSS.
5. A future theme swap or rebrand is a token change, not a global find-and-replace.

## 3. Non-goals

- Not a redesign. Layouts, copy, and information architecture stay as-is.
- Not a Storybook rollout. (Optional Phase E.)
- Not a CSS-in-JS migration. Tailwind + cva + `cn()` is the stack.
- Not a feature change. If a page works now, it works the same after migration.

## 4. Design system

### Tokens
| Token  | Hue     | Use                                 |
|--------|---------|-------------------------------------|
| brand  | amber   | Primary actions, active nav, accent |
| success| emerald | Paid, approved, positive deltas     |
| warning| amber   | Pending review, near-due, caution   |
| danger | rose    | Destructive, errors, overdue        |
| info   | sky     | Informational badges, neutral state |
| neutral| gray    | Borders, text, surfaces             |

Each scale: `50 → 950`. Shadows: `shadow-elev-1` (resting) → `shadow-elev-4` (popover/dropdown). `font-num` class: tabular numerals for money/quantity.

### Primitives (`frontend/src/components/ui/`)
`Button`, `Input`, `Textarea`, `FormField`, `Select` (Radix), `Modal` (Radix dialog), `Card` / `CardContent`, `Table` / `THead` / `TBody` / `TR` / `TH` / `TD`, `Badge`, `EmptyState`, `Skeleton`, `Tabs` (Radix), `Tooltip` (Radix), `Popover` (Radix). Toasts: `sonner` (Toaster mounted in `main.tsx`).

### Migration recipe (per page)
1. Replace raw `<button>` → `<Button variant="..." leftIcon={<Icon />}>`.
2. Replace raw `<input>` / `<select>` → `<FormField label hint error><Input/Select/></FormField>`.
3. Replace handcrafted modals → `<Modal open onOpenChange><ModalContent size="..."><ModalHeader>...`.
4. Replace status pills → `<Badge variant={ESTADO_VARIANT[estado]}>` with a single mapping object near the top of the file.
5. Replace local toast state + `setTimeout` → `import { toast } from 'sonner'; toast.success(...)`.
6. Replace tables → `<Table density="compact"><THead><TR><TH>...`. Add `interactive` to clickable rows.
7. Money/quantity cells → add `font-num`.
8. Hardcoded colors (`text-red-600`, `bg-yellow-100`) → semantic tokens (`text-danger-600`, `bg-warning-50`).
9. Icon-only buttons → wrap in `<Tooltip>` + `aria-label`.
10. Custom dropdowns → `<Popover>`.

## 5. Scope (~30+ pages, organised in waves)

### Phase A — Sales & order documents (highest visibility)
- [x] **A1 — NotaVentaDetalle** (`5f2e2c1`)
- [x] **A2 — NotaVentas list** (already migrated, no commit)
- [x] **A3 — Cotizaciones list** (`18c9524`)
- [x] **A4 — CotizacionDetalle** (`fe7b967`, subagent)
- [x] **A5 — Facturas list + FacturaDetalle**
- [ ] **A6 — BoletaDetalle + BoletaNueva** (BoletasList already done in `9394195`)
- [ ] **A7 — GuiasDespacho list + Nueva + Detalle**
- [ ] **A8 — NotasCredito list + Nueva + Detalle, NotasDebito list + Nueva + Detalle**

### Phase B — Money & catalog
- [ ] Pagos
- [ ] Cobranza
- [ ] OrdenesCompra list + Detalle
- [ ] Proveedores
- [ ] Reportes
- [x] **Empresas list + detail + 4 tabs** (`df202e4`)
- [x] **Clientes list + form modal** (`d6fa479`)
- [x] **Inventario + ProductoModal + ProductoHistorial** (`8cf5960`)
- [ ] Catálogo (productos list page) — *verify if already migrated*
- [ ] Listas de precios

### Phase C — Admin & ops
- [ ] Tareas + admin/tareas/config
- [ ] Aprobaciones
- [ ] RRHH (empleados)
- [ ] Auditoría (`/admin/auditoria`)
- [ ] Configuración
- [ ] Usuarios

### Phase D — Auth & shell
- [x] **Sidebar** (`94cffaa`)
- [x] **Dashboard** (`b91e5e4`)
- [ ] Login / password reset
- [ ] Layout wrapper visual QA

### Phase E — QA & polish
- [ ] Visual QA pass — every route screenshotted in light + dark, mobile + desktop
- [ ] Replace any remaining `bg-red-*` / `bg-green-*` / `bg-yellow-*` / `bg-blue-*` with semantic tokens (grep gate)
- [ ] A11y sweep — `aria-label` on every icon-only button, `aria-describedby` on form errors, focus-visible rings
- [ ] *Optional:* Storybook for the `ui/*` primitives so designers can sanity-check tokens without running the app

## 6. Migration patterns / gotchas

- **Radix `<SelectItem>` cannot have empty string `value`.** Use `'none'` sentinel and translate in `onValueChange`.
- **Button has no `asChild`.** For navigation use `onClick={() => navigate(to)}`, not `<Button asChild><Link/></Button>`.
- **`FormField`'s `label` prop accepts ReactNode** — use it for labels with inline help icons or buttons.
- **Subagent delegation** for files >1000 LOC keeps the main context lean (CotizacionDetalle was 1355 LOC — delegated successfully).
- **One `ESTADO_VARIANT` map per page** at the top of the file. Keeps badge logic local and grep-friendly.
- **`dirtyBorder` constant** — when a form tracks unsaved changes via warning border, define `const dirtyBorder = 'border-warning-400 dark:border-warning-500'` once at the top of render rather than repeating the class string.
- **Sonner is already mounted** in `main.tsx`. Just `import { toast } from 'sonner'` and call `toast.success` / `toast.error`.

## 7. Success criteria

The migration is "done" when:

- Every page in `frontend/src/pages/*` imports from `components/ui/*` (no handcrafted buttons / modals / tables / badges remain).
- `grep -rE "bg-(red|green|yellow|blue|orange)-[0-9]" src/pages` returns zero hits — only semantic tokens.
- `grep -r "setTimeout.*setEmailToast\|emailToast" src` returns zero hits.
- A new dev can compose a CRUD page in < 1 day using only `components/ui/*` + sonner.
- Light-mode and dark-mode screenshots match the "Refined SaaS" reference for every route.

## 8. Tracking

Per-page commits land on `master`. PROGRESS.md → "Design System v2" lists every commit. This PRD is the forward-looking inventory; PROGRESS.md is the changelog.

## 9. Open questions

- Storybook? Optional, scoped to Phase E if any.
- Do we add a CI lint rule that blocks raw `bg-red-*` / `bg-green-*` etc. outside `components/ui/*`? Probably yes, after Phase A finishes.
- Visual regression testing (Chromatic / Playwright screenshots)? Out of scope for v2; revisit if drift returns.
