# Admin Create & Edit Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add create and edit user UI to `Users.tsx` so admins can manage users from the browser.

**Architecture:** Single modal component (create/edit mode) embedded in `Users.tsx`. No new files. Backend endpoints already exist: `POST /api/users` and `PATCH /api/users/{id}`.

**Tech Stack:** React, TypeScript, TanStack React Query (`useMutation`, `useQueryClient`), existing `api` axios instance, Tailwind CSS.

---

## File Map

- Modify: `frontend/src/pages/Users.tsx` — add modal state, two mutations, create form, edit form, row Edit buttons

---

### Task 1: Add modal state + "Nuevo Usuario" button

**Files:**
- Modify: `frontend/src/pages/Users.tsx`

- [ ] **Step 1: Add modal state type and useState**

At the top of the `Users` component (after existing state), add:

```tsx
type ModalState = { mode: 'create' } | { mode: 'edit'; user: User }

const [modal, setModal] = useState<ModalState | null>(null)
const [formError, setFormError] = useState<string | null>(null)
```

- [ ] **Step 2: Add "Nuevo Usuario" button to the page header**

Replace:
```tsx
<h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Usuarios</h1>
```

With:
```tsx
<div className="flex items-center justify-between mb-4">
  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Usuarios</h1>
  <button
    onClick={() => { setModal({ mode: 'create' }); setFormError(null) }}
    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
  >
    Nuevo Usuario
  </button>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Users.tsx
git commit -m "feat: add Nuevo Usuario button and modal state to Users page"
```

---

### Task 2: Add createUser mutation + create form modal

**Files:**
- Modify: `frontend/src/pages/Users.tsx`

- [ ] **Step 1: Add createUser mutation**

After the existing `savePermissions` mutation, add:

```tsx
const createUser = useMutation({
  mutationFn: (body: { email: string; name: string; password: string; role: string }) =>
    api.post('/api/users', body).then(r => r.data),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['users'] })
    setModal(null)
    setFormError(null)
  },
  onError: (err: any) => {
    if (err?.response?.status === 409) {
      setFormError('Este email ya está registrado')
    } else {
      setFormError('No se pudo guardar. Intenta de nuevo.')
    }
  },
})
```

- [ ] **Step 2: Add create modal JSX**

After the closing `</div>` of the table and before the `selectedUser && permissions` block, add:

```tsx
{modal?.mode === 'create' && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md">
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nuevo Usuario</h2>
      </div>
      <form
        className="px-6 py-4 flex flex-col gap-4"
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          createUser.mutate({
            name: fd.get('name') as string,
            email: fd.get('email') as string,
            password: fd.get('password') as string,
            role: fd.get('role') as string,
          })
        }}
      >
        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Nombre
          <input name="name" required className="mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Email
          <input name="email" type="email" required className="mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Contraseña
          <input name="password" type="password" required className="mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Rol
          <select name="role" required defaultValue="vendedor" className="mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="vendedor">Vendedor</option>
            <option value="subadmin">Subadmin</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {formError && <p className="text-xs text-red-500">{formError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => { setModal(null); setFormError(null) }}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createUser.isPending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {createUser.isPending ? 'Guardando...' : 'Crear Usuario'}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Users.tsx
git commit -m "feat: add create user modal with POST /api/users mutation"
```

---

### Task 3: Add updateUser mutation + edit form modal

**Files:**
- Modify: `frontend/src/pages/Users.tsx`

- [ ] **Step 1: Add updateUser mutation**

After the `createUser` mutation, add:

```tsx
const updateUser = useMutation({
  mutationFn: ({ id, body }: { id: number; body: { name?: string; role?: string; is_active?: boolean; password?: string } }) =>
    api.patch(`/api/users/${id}`, body).then(r => r.data),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['users'] })
    setModal(null)
    setFormError(null)
  },
  onError: () => {
    setFormError('No se pudo guardar. Intenta de nuevo.')
  },
})
```

- [ ] **Step 2: Add edit modal JSX**

After the create modal block, add:

```tsx
{modal?.mode === 'edit' && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md">
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Editar Usuario</h2>
        <p className="text-xs text-gray-500 mt-0.5">{modal.user.email}</p>
      </div>
      <form
        className="px-6 py-4 flex flex-col gap-4"
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const password = fd.get('password') as string
          const body: { name?: string; role?: string; is_active?: boolean; password?: string } = {
            name: fd.get('name') as string,
            role: fd.get('role') as string,
            is_active: fd.get('is_active') === 'on',
          }
          if (password) body.password = password
          updateUser.mutate({ id: modal.user.id, body })
        }}
      >
        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Nombre
          <input name="name" required defaultValue={modal.user.name} className="mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Rol
          <select name="role" required defaultValue={modal.user.role} className="mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="vendedor">Vendedor</option>
            <option value="subadmin">Subadmin</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Nueva Contraseña
          <input name="password" type="password" placeholder="Dejar vacío para no cambiar" className="mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400" />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input name="is_active" type="checkbox" defaultChecked={modal.user.is_active} className="w-4 h-4 accent-blue-600" />
          Usuario activo
        </label>
        {formError && <p className="text-xs text-red-500">{formError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => { setModal(null); setFormError(null) }}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={updateUser.isPending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {updateUser.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Users.tsx
git commit -m "feat: add edit user modal with PATCH /api/users/{id} mutation"
```

---

### Task 4: Add Edit buttons to table rows

**Files:**
- Modify: `frontend/src/pages/Users.tsx`

- [ ] **Step 1: Replace the actions cell in the table rows**

Replace:
```tsx
<td className="px-4 py-3">
  {u.role !== 'admin' && (
    <span className="inline-flex items-center gap-2">
      <button onClick={() => openPermissions(u)} className="text-xs text-blue-600 hover:underline">
        Permisos
      </button>
      {permissionsError === u.id.toString() && (
        <span className="text-xs text-red-500">Error al cargar</span>
      )}
    </span>
  )}
</td>
```

With:
```tsx
<td className="px-4 py-3">
  <span className="inline-flex items-center gap-3">
    <button
      onClick={() => { setModal({ mode: 'edit', user: u }); setFormError(null) }}
      className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white hover:underline"
    >
      Editar
    </button>
    {u.role !== 'admin' && (
      <>
        <button onClick={() => openPermissions(u)} className="text-xs text-blue-600 hover:underline">
          Permisos
        </button>
        {permissionsError === u.id.toString() && (
          <span className="text-xs text-red-500">Error al cargar</span>
        )}
      </>
    )}
  </span>
</td>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Users.tsx
git commit -m "feat: add Edit button to user rows, wire up edit modal"
```

---

### Task 5: Manual verification

- [ ] Start the dev server: `cd frontend && npm run dev`
- [ ] Navigate to `/usuarios` as an admin
- [ ] Click "Nuevo Usuario" → fill in name, email, password, role → submit → user appears in list
- [ ] Try creating with a duplicate email → error message "Este email ya está registrado" appears
- [ ] Click "Editar" on a user → modal shows pre-filled name, role, is_active checkbox
- [ ] Change name, submit → table updates
- [ ] Change password (fill in field), submit → user can log in with new password
- [ ] Uncheck "Usuario activo", submit → status dot turns gray
- [ ] Click "Editar" on an admin user → modal opens (no Permisos button visible for admin rows)
