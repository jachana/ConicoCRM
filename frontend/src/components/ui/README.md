# UI Primitives — Refined SaaS Design System

Phase 0 foundation. All future page work should compose from these primitives.

## Design direction

**Refined SaaS.** Soft surfaces, subtle elevation, restrained color, generous spacing,
clear status semantics. Brand color is amber (`brand-500 = #f59e0b`); semantic colors
are emerald / amber / rose / sky for success / warning / danger / info.

## Tokens (tailwind.config.ts)

### Colors

| Token       | Scale    | Use                                         |
|-------------|----------|---------------------------------------------|
| `brand-*`   | 50–950   | Primary actions, active states, brand marks |
| `success-*` | 50–950   | Confirmations, positive deltas, paid states |
| `warning-*` | 50–950   | Pending states, soft alerts                 |
| `danger-*`  | 50–950   | Destructive actions, errors, anuladas       |
| `info-*`    | 50–950   | Informational badges, drafts                |

Use Tailwind's `gray-*` scale for surfaces and text. Do not introduce ad-hoc hex codes.

### Shadows (elevation)

`shadow-elev-1` (lifted from page) → `shadow-elev-4` (floating modal). Prefer
`elev-1` for cards, `elev-2` for hover/popovers, `elev-3` for dropdowns/menus,
`elev-4` for modals.

### Radii

`rounded-xs` (4px) · `rounded-sm` (6px) · `rounded-md` (8px, default) ·
`rounded-lg` (12px) · `rounded-xl` (16px). Use `md` for buttons/inputs, `lg`
for cards/modals.

### Animation

`animate-fade-in` (150ms) · `animate-fade-in-up` (200ms) · `animate-scale-in` (150ms).
Used internally by Modal, Popover, Tooltip. Easing: `ease-out-expo`.

## Primitives

```ts
import {
  Button, Input, Textarea, FormField, Select, SelectTrigger, SelectContent, SelectItem,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Card, CardHeader, CardTitle, CardContent, CardFooter,
  Table, THead, TBody, TR, TH, TD,
  Badge, EmptyState, Skeleton,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Tooltip, Popover, PopoverTrigger, PopoverContent,
} from '@/components/ui'
```

### Button

```tsx
<Button variant="primary" size="md" leftIcon={<Plus />}>Nueva</Button>
<Button variant="outline" size="sm">Cancelar</Button>
<Button variant="danger" loading>Eliminar</Button>
<Button variant="ghost" size="icon"><X /></Button>
```

Variants: `primary` · `secondary` · `outline` · `ghost` · `danger` · `success` · `link`.
Sizes: `xs` · `sm` · `md` · `lg` · `icon` · `icon-sm` · `icon-xs`.

### Input + FormField

```tsx
<FormField label="RUT" htmlFor="rut" required error={errors.rut}>
  <Input id="rut" tone={errors.rut ? 'error' : 'default'} />
</FormField>
<Input leftAddon={<Search />} placeholder="Buscar..." />
```

### Select (radix)

```tsx
<Select value={estado} onValueChange={setEstado}>
  <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="borrador">Borrador</SelectItem>
    <SelectItem value="emitida">Emitida</SelectItem>
  </SelectContent>
</Select>
```

### Modal (radix-dialog)

Replaces all bespoke `*Modal.tsx` components. Focus-trapped, esc-closable, portal-rendered.

```tsx
<Modal open={open} onOpenChange={setOpen}>
  <ModalContent size="lg">
    <ModalHeader>
      <ModalTitle>Anular boleta</ModalTitle>
      <ModalDescription>Esta acción no se puede deshacer.</ModalDescription>
    </ModalHeader>
    <ModalBody>…</ModalBody>
    <ModalFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      <Button variant="danger" onClick={confirm}>Anular</Button>
    </ModalFooter>
  </ModalContent>
</Modal>
```

Sizes: `sm` · `md` · `lg` · `xl` · `2xl` · `full`.

### Card

```tsx
<Card>
  <CardHeader><CardTitle>Resumen</CardTitle></CardHeader>
  <CardContent>…</CardContent>
  <CardFooter><Button>Acción</Button></CardFooter>
</Card>
```

### Table

```tsx
<Table density="comfortable">
  <THead>
    <TR><TH>Folio</TH><TH>Cliente</TH><TH>Total</TH></TR>
  </THead>
  <TBody>
    <TR interactive onClick={…}>
      <TD className="font-num">123</TD>
      <TD>…</TD>
      <TD className="font-num text-right">$ 12.000</TD>
    </TR>
  </TBody>
</Table>
```

Density: `compact` (small rows) · `comfortable` (default).

### Badge

```tsx
<Badge variant="success" showDot>Pagada</Badge>
<Badge variant="warning">Pendiente</Badge>
<Badge variant="danger">Anulada</Badge>
```

### EmptyState

```tsx
<EmptyState
  icon={<Inbox />}
  title="Sin resultados"
  description="Ajusta los filtros e intenta nuevamente."
  action={<Button>Limpiar filtros</Button>}
/>
```

### Tabs / Tooltip / Popover

Standard radix patterns; see source for full prop surface.

```tsx
<Tabs defaultValue="resumen">
  <TabsList variant="underline">
    <TabsTrigger value="resumen">Resumen</TabsTrigger>
    <TabsTrigger value="facturas">Facturas</TabsTrigger>
  </TabsList>
  <TabsContent value="resumen">…</TabsContent>
</Tabs>

<Tooltip label="Editar"><Button size="icon"><Pencil /></Button></Tooltip>
```

## Migration guide

1. **Replace `INPUT_CLS` constants** with `<Input />`. Drop the inline class strings.
2. **Replace bespoke modals** (`BoletaAnularModal`, `EmpresaDetailModal`, etc.) with `<Modal>` shell — keep the form/body content, swap the chrome.
3. **Replace hand-rolled tables** (`<table className="w-full…">`) with `<Table>` primitives. Use `font-num` (already in `index.css`) for monetary cells.
4. **Replace status pills** with `<Badge variant="…">`. Stop hardcoding `bg-green-100 text-green-800`.
5. **Replace `<button className="px-4 py-2 bg-blue-600…">`** with `<Button variant="primary">`.

Goal: zero inline form/button styling in feature pages. All visual choices flow from primitives.

## Conventions

- Use `cn()` from `@/lib/cn` for class merging in any component that takes `className`.
- Always forward `ref` and accept `className` on new shared components.
- Dark mode: every primitive supports `dark:` classes — never assume light-only.
- Numbers/IDs: use `font-num` utility (tabular nums + JetBrains Mono).
