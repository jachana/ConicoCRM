import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { User, Permissions, Module, Action } from '../types'
import {
  Button, Input, FormField, Skeleton, Tooltip, Badge,
  Card,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'

const MODULES: Module[] = [
  'catalogo','clientes','empresas','proveedores','cotizaciones','nota_venta',
  'facturas','boletas','ordenes_compra','inventario','rrhh','dashboard','usuarios','guias_despacho','tareas','libros','dte_recepcion',
]
const ACTIONS: Action[] = ['view','create','edit','delete']

const MODULE_LABELS: Record<Module, string> = {
  catalogo: 'Catálogo', clientes: 'Clientes', empresas: 'Empresas', proveedores: 'Proveedores',
  cotizaciones: 'Cotizaciones', nota_venta: 'Nota de Venta', facturas: 'Facturas',
  boletas: 'Boletas', ordenes_compra: 'Órdenes de Compra', inventario: 'Inventario',
  rrhh: 'RRHH', dashboard: 'Dashboard', usuarios: 'Usuarios', guias_despacho: 'Guías de Despacho',
  tareas: 'Tareas', libros: 'Libros', dte_recepcion: 'DTE Recepción',
}

const ACTION_LABELS: Record<Action, string> = {
  view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar',
}

const ROLE_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  vendedor: 'info',
  subadmin: 'warning',
  admin: 'success',
}

type ModalState = { mode: 'create' } | { mode: 'edit'; user: User }

export default function Users() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users').then(r => r.data),
  })
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  // Form state for create/edit role select (Radix Select needs controlled value)
  const [createRole, setCreateRole] = useState<string>('vendedor')
  const [editRole, setEditRole] = useState<string>('vendedor')

  const savePermissions = useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: Permissions }) =>
      api.put(`/api/users/${userId}/permissions`, payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setSelectedUser(null)
      setPermissions(null)
    },
    onError: () => {
      toast.error('No se pudo guardar. Intenta de nuevo.')
    },
  })

  const createUser = useMutation({
    mutationFn: (body: { email: string; name: string; password: string; role: string }) =>
      api.post('/api/users', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setModal(null)
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        toast.error('Este email ya está registrado')
      } else {
        toast.error('No se pudo guardar. Intenta de nuevo.')
      }
    },
  })

  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { name?: string; role?: string; is_active?: boolean; password?: string } }) =>
      api.patch(`/api/users/${id}`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setModal(null)
    },
    onError: () => {
      toast.error('No se pudo guardar. Intenta de nuevo.')
    },
  })

  async function openPermissions(user: User) {
    setSelectedUser(user)
    try {
      const res = await api.get<Permissions>(`/api/users/${user.id}/permissions`)
      setPermissions(res.data)
    } catch {
      setSelectedUser(null)
      toast.error('Error al cargar permisos')
    }
  }

  function toggle(module: Module, action: Action) {
    if (!permissions) return
    setPermissions({ ...permissions, [module]: { ...permissions[module], [action]: !permissions[module][action] } })
  }

  function abrirCrear() {
    setCreateRole('vendedor')
    setModal({ mode: 'create' })
  }

  function abrirEditar(u: User) {
    setEditRole(u.role)
    setModal({ mode: 'edit', user: u })
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Usuarios</h1>
        <Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>
          Nuevo Usuario
        </Button>
      </div>

      <Card>
        <Table density="compact">
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Email</TH>
              <TH>Rol</TH>
              <TH>Estado</TH>
              <TH className="w-24" />
            </TR>
          </THead>
          <TBody>
            {isLoading ? (
              [1, 2, 3, 4].map(i => (
                <TR key={i}>
                  <TD><Skeleton className="h-4 w-32" /></TD>
                  <TD><Skeleton className="h-4 w-40" /></TD>
                  <TD><Skeleton className="h-4 w-16" /></TD>
                  <TD><Skeleton className="h-4 w-16" /></TD>
                  <TD><Skeleton className="h-4 w-12" /></TD>
                </TR>
              ))
            ) : (
              users.map(u => (
                <TR key={u.id}>
                  <TD className="font-medium text-gray-900 dark:text-white">{u.name}</TD>
                  <TD className="text-gray-500 dark:text-gray-400">{u.email}</TD>
                  <TD>
                    <Badge variant={ROLE_VARIANT[u.role] ?? 'neutral'}>{u.role}</Badge>
                  </TD>
                  <TD>
                    {u.is_active
                      ? <Badge variant="success">Activo</Badge>
                      : <Badge variant="neutral">Inactivo</Badge>}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Tooltip label="Editar">
                        <Button size="icon-sm" variant="ghost" onClick={() => abrirEditar(u)}>
                          <Pencil size={14} />
                        </Button>
                      </Tooltip>
                      {u.role !== 'admin' && (
                        <Tooltip label="Permisos">
                          <Button size="icon-sm" variant="ghost" aria-label="Permisos" onClick={() => openPermissions(u)}>
                            <Shield size={14} />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      {/* Modal crear usuario */}
      <Modal open={modal?.mode === 'create'} onOpenChange={open => { if (!open) setModal(null) }}>
        <ModalContent size="md">
          <ModalHeader>
            <ModalTitle>Nuevo Usuario</ModalTitle>
          </ModalHeader>
          <form
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              createUser.mutate({
                name: fd.get('name') as string,
                email: fd.get('email') as string,
                password: fd.get('password') as string,
                role: createRole,
              })
            }}
          >
            <ModalBody>
              <div className="space-y-4">
                <FormField label="Nombre" required>
                  <Input name="name" type="text" required />
                </FormField>
                <FormField label="Email" required>
                  <Input name="email" type="email" required />
                </FormField>
                <FormField label="Contraseña" required>
                  <Input name="password" type="password" required />
                </FormField>
                <FormField label="Rol" required>
                  <Select value={createRole} onValueChange={setCreateRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vendedor">Vendedor</SelectItem>
                      <SelectItem value="subadmin">Subadmin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? 'Guardando...' : 'Crear Usuario'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      {/* Modal editar usuario */}
      <Modal open={modal?.mode === 'edit'} onOpenChange={open => { if (!open) setModal(null) }}>
        <ModalContent size="md">
          <ModalHeader>
            <ModalTitle>Editar Usuario</ModalTitle>
            {modal?.mode === 'edit' && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{modal.user.email}</p>
            )}
          </ModalHeader>
          {modal?.mode === 'edit' && (
            <form
              onSubmit={e => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const password = fd.get('password') as string
                const body: { name?: string; role?: string; is_active?: boolean; password?: string } = {
                  name: fd.get('name') as string,
                  role: editRole,
                  is_active: fd.get('is_active') === 'on',
                }
                if (password) body.password = password
                updateUser.mutate({ id: modal.user.id, body })
              }}
            >
              <ModalBody>
                <div className="space-y-4">
                  <FormField label="Nombre" required>
                    <Input name="name" type="text" required defaultValue={modal.user.name} />
                  </FormField>
                  <FormField label="Rol" required>
                    <Select value={editRole} onValueChange={setEditRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vendedor">Vendedor</SelectItem>
                        <SelectItem value="subadmin">Subadmin</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Nueva Contraseña">
                    <Input name="password" type="password" placeholder="Dejar vacío para no cambiar" />
                  </FormField>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      name="is_active"
                      type="checkbox"
                      defaultChecked={modal.user.is_active}
                      className="size-4 rounded border-gray-300 dark:border-gray-600 text-brand-600 focus:ring-brand-500/20"
                    />
                    Usuario activo
                  </label>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" disabled={updateUser.isPending}>
                  {updateUser.isPending ? 'Guardando...' : 'Guardar'}
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>

      {/* Modal permisos */}
      <Modal
        open={!!(selectedUser && permissions)}
        onOpenChange={open => { if (!open) { setSelectedUser(null); setPermissions(null) } }}
      >
        <ModalContent size="lg">
          <ModalHeader>
            <ModalTitle>Permisos: {selectedUser?.name}</ModalTitle>
            {selectedUser && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Rol base: {selectedUser.role}</p>
            )}
          </ModalHeader>
          <ModalBody>
            {permissions && (
              <Table density="compact">
                <THead>
                  <TR>
                    <TH>Módulo</TH>
                    {ACTIONS.map(a => (
                      <TH key={a} className="text-center">{ACTION_LABELS[a]}</TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {MODULES.map(module => (
                    <TR key={module}>
                      <TD className="font-medium text-gray-700 dark:text-gray-300">
                        {MODULE_LABELS[module]}
                      </TD>
                      {ACTIONS.map(action => (
                        <TD key={action} className="text-center">
                          <input
                            type="checkbox"
                            checked={permissions[module]?.[action] ?? false}
                            onChange={() => toggle(module, action)}
                            className="size-4 rounded border-gray-300 dark:border-gray-600 text-brand-600 focus:ring-brand-500/20 cursor-pointer"
                          />
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => { setSelectedUser(null); setPermissions(null) }}
            >
              Cancelar
            </Button>
            <Button
              disabled={savePermissions.isPending}
              onClick={() => selectedUser && permissions && savePermissions.mutate({ userId: selectedUser.id, payload: permissions })}
            >
              {savePermissions.isPending ? 'Guardando...' : 'Guardar permisos'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
