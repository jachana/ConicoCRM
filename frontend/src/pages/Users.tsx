import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { User, Permissions, Module, Action } from '../types'

const MODULES: Module[] = [
  'catalogo','clientes','empresas','proveedores','cotizaciones','nota_venta',
  'facturas','ordenes_compra','inventario','rrhh','dashboard','usuarios',
]
const ACTIONS: Action[] = ['view','create','edit','delete']

const MODULE_LABELS: Record<Module, string> = {
  catalogo: 'Catálogo', clientes: 'Clientes', empresas: 'Empresas', proveedores: 'Proveedores',
  cotizaciones: 'Cotizaciones', nota_venta: 'Nota de Venta', facturas: 'Facturas',
  ordenes_compra: 'Órdenes de Compra', inventario: 'Inventario',
  rrhh: 'RRHH', dashboard: 'Dashboard', usuarios: 'Usuarios',
}

const ACTION_LABELS: Record<Action, string> = {
  view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar',
}

export default function Users() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users').then(r => r.data),
  })
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [permissionsError, setPermissionsError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const savePermissions = useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: Permissions }) =>
      api.put(`/api/users/${userId}/permissions`, payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setSelectedUser(null)
      setPermissions(null)
      setSaveError(null)
    },
    onError: () => {
      setSaveError('No se pudo guardar. Intenta de nuevo.')
    },
  })

  async function openPermissions(user: User) {
    setPermissionsError(null)
    setSelectedUser(user)
    try {
      const res = await api.get<Permissions>(`/api/users/${user.id}/permissions`)
      setPermissions(res.data)
    } catch {
      setSelectedUser(null)
      setPermissionsError(user.id.toString())
    }
  }

  function toggle(module: Module, action: Action) {
    if (!permissions) return
    setPermissions({ ...permissions, [module]: { ...permissions[module], [action]: !permissions[module][action] } })
  }

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Usuarios</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Rol</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{u.name}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    aria-label={u.is_active ? 'Activo' : 'Inactivo'}
                    className={`inline-block w-2 h-2 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-gray-400'}`}
                  />
                </td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && permissions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Permisos: {selectedUser.name}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Rol base: {selectedUser.role}</p>
            </div>
            <div className="overflow-auto flex-1 px-6 py-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 dark:text-gray-400">
                    <th className="text-left py-2 pr-6 font-medium">Módulo</th>
                    {ACTIONS.map(a => (
                      <th key={a} className="text-center py-2 px-3 font-medium">{ACTION_LABELS[a]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {MODULES.map(module => (
                    <tr key={module} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="py-2 pr-6 text-gray-700 dark:text-gray-300 font-medium">
                        {MODULE_LABELS[module]}
                      </td>
                      {ACTIONS.map(action => (
                        <td key={action} className="text-center py-2 px-3">
                          <input
                            type="checkbox"
                            checked={permissions[module]?.[action] ?? false}
                            onChange={() => toggle(module, action)}
                            className="w-4 h-4 cursor-pointer accent-blue-600"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
              {saveError && <p className="text-xs text-red-500 mr-auto">{saveError}</p>}
              <button
                onClick={() => { setSelectedUser(null); setPermissions(null); setSaveError(null) }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => savePermissions.mutate({ userId: selectedUser.id, payload: permissions })}
                disabled={savePermissions.isPending}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {savePermissions.isPending ? 'Guardando...' : 'Guardar permisos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
