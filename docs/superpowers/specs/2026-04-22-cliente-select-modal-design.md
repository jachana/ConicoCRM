# Cliente Select Modal — Cotización

**Date:** 2026-04-22
**Status:** Approved

## Overview

When creating/editing a cotización, two coexisting flows exist for selecting a contact:
- **Existing flow**: Select a `cliente` directly → empresa auto-fills
- **New flow**: Select an `empresa` → modal opens showing clientes linked to that empresa → pick one or create new

## Architecture

### Backend
No new models or endpoints needed. The existing `GET /api/clientes/?empresa_id={id}` filter is sufficient. `POST /api/clientes/` handles new client creation.

### Frontend
Two changes:
1. New component `ClienteSelectModal.tsx`
2. Modified `CotizacionDetalle.tsx` to trigger and handle the modal

## Component: ClienteSelectModal

**Props:**
```ts
interface ClienteSelectModalProps {
  open: boolean
  empresaId: number
  empresaNombre: string
  onSelect: (cliente: Cliente) => void
  onClose: () => void
}
```

**Internal state:** `view: 'list' | 'create'`

### List View
- Header: "Seleccionar cliente — {empresaNombre}" + X button
- Search input filtering by nombre/email
- Scrollable list: each row shows nombre (bold) + email + teléfono, clickable
- Empty state: "No hay clientes para esta empresa" + "Crear el primero" button
- Footer: "Nuevo cliente" button (left) + "Cancelar" button (right)

### Create View
- Header: "Nuevo cliente — {empresaNombre}" + ← back button
- Full cliente form (same fields as `Clientes.tsx`): nombre, rut, email, teléfono, direccion_despacho, notas, recibe_correo, despacho_o_retiro, comuna, ultimo_contacto, forma_captacion, compromiso, es_nuevo
- `empresa_id` pre-filled and locked (disabled field showing empresaNombre)
- Footer: "Guardar y seleccionar" + "Cancelar"
- On success: closes modal, auto-selects new cliente, shows toast

**Visual pattern:** Same as `EmpresaDetailModal` — fixed overlay, `z-50`, click-outside closes, Escape closes.

## Integration: CotizacionDetalle

### Auto-trigger
```ts
useEffect(() => {
  if (form.empresa_id && !form.cliente_id) {
    setClienteModalOpen(true)
  }
}, [form.empresa_id])
```

### Re-open button
Small `UserPlus` icon button placed immediately after the empresa selector. Only visible when `empresa_id` is set. Opens modal regardless of whether a cliente is already selected.

### On cliente selected
```ts
const handleClienteSelect = (cliente: Cliente) => {
  setForm(f => ({
    ...f,
    cliente_id: cliente.id,
    contacto: cliente.nombre,
    correo: cliente.email ?? f.correo,
  }))
  setClienteModalOpen(false)
}
```

### Existing flow unchanged
If user selects cliente first → empresa auto-fills (current behavior preserved). The `useEffect` does not trigger the modal because `cliente_id` is already set.

## Data Flow

```
[empresa selector] → onChange → empresa_id set, cliente_id null
                             → useEffect fires → modal opens
                                → list view: fetches GET /api/clientes/?empresa_id={id}
                                   → user picks cliente → onSelect → form populated, modal closed
                                   → "Nuevo cliente" → create view
                                      → submit → POST /api/clientes/ → onSelect(newCliente) → modal closed

[UserPlus button] → modal opens (re-select or change cliente)
```

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/ClienteSelectModal.tsx` | New component |
| `frontend/src/pages/CotizacionDetalle.tsx` | Add modal state, useEffect trigger, UserPlus button, handleClienteSelect |
| `frontend/src/types/index.ts` | Verify Cliente type has all needed fields (likely already complete) |
