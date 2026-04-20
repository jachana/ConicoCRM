# Admin: Create & Edit Users

**Date:** 2026-04-20  
**Scope:** Frontend only — `frontend/src/pages/Users.tsx`  
**Backend:** Already complete (`POST /api/users`, `PATCH /api/users/{id}`)

## Problem

Admins can view the user list but have no UI to create new users or edit existing ones.

## Solution

Single modal for both create and edit, matching the existing permissions modal pattern. No new files — all changes in `Users.tsx`.

## UI

- **"Nuevo Usuario" button** top-right of page header → opens modal in create mode
- **Per-row actions:** `Editar | Permisos` (admin rows show only `Editar`)
- Clicking Edit → modal opens pre-filled

## Modal Fields

| Field | Create | Edit |
|---|---|---|
| Nombre | required | required |
| Email | required | hidden (immutable) |
| Contraseña | required | optional ("Dejar vacío para no cambiar") |
| Rol | select: admin/subadmin/vendedor | same |
| Estado Activo | hidden | checkbox |

## Data Flow

- Create: `POST /api/users` → `{ email, name, password, role }`
- Edit: `PATCH /api/users/{id}` → only changed fields, password omitted if blank
- On success: invalidate `['users']` query, close modal, reset form
- Errors: 409 → "Este email ya está registrado" | other → "No se pudo guardar"

## Modal State

```ts
{ mode: 'create' | 'edit', user?: User } | null
```

Form state is local, reset on open/close.
