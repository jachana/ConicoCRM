import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { SystemConfig } from '../types'

const COMPANY_FIELDS = [
  { key: 'empresa_nombre', label: 'Nombre empresa' },
  { key: 'empresa_rut', label: 'RUT empresa' },
  { key: 'empresa_direccion', label: 'Dirección' },
  { key: 'empresa_logo_url', label: 'URL del logo' },
]

const BANKING_FIELDS = [
  { key: 'empresa_banco', label: 'Banco' },
  { key: 'empresa_tipo_cuenta', label: 'Tipo de cuenta' },
  { key: 'empresa_numero_cuenta', label: 'N° de cuenta' },
  { key: 'empresa_nombre_titular', label: 'Nombre titular' },
]

export default function Configuracion() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  const { data: config = [], isLoading } = useQuery<SystemConfig[]>({
    queryKey: ['config'],
    queryFn: () => api.get('/api/config/').then(r => r.data),
  })

  const [form, setForm] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (config.length === 0) return
    const map = Object.fromEntries(config.map(c => [c.key, c.value]))
    setForm({
      empresa_nombre: map.empresa_nombre ?? '',
      empresa_rut: map.empresa_rut ?? '',
      empresa_direccion: map.empresa_direccion ?? '',
      empresa_logo_url: map.empresa_logo_url ?? '',
      empresa_banco: map.empresa_banco ?? '',
      empresa_tipo_cuenta: map.empresa_tipo_cuenta ?? '',
      empresa_numero_cuenta: map.empresa_numero_cuenta ?? '',
      empresa_nombre_titular: map.empresa_nombre_titular ?? '',
    })
  }, [config])

  const saveMut = useMutation({
    mutationFn: (updates: Record<string, string>) =>
      api.patch('/api/config/', { updates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      setToast({ msg: 'Configuración guardada', ok: true })
      setTimeout(() => setToast(null), 3000)
    },
    onError: () => {
      setToast({ msg: 'Error al guardar', ok: false })
      setTimeout(() => setToast(null), 3000)
    },
  })

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />

  function handleSave() {
    saveMut.mutate(form)
  }

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Cargando...</div>

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Configuración del Sistema</h1>

      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          toast.ok
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Datos de la Empresa</h2>
        <div className="grid grid-cols-1 gap-4">
          {COMPANY_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{f.label}</label>
              <input
                type="text"
                value={form[f.key] ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Datos Bancarios</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Aparecen en el PDF de cotizaciones como información para transferencias y cheques.</p>
        <div className="grid grid-cols-1 gap-4">
          {BANKING_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{f.label}</label>
              <input
                type="text"
                value={form[f.key] ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
        >
          {saveMut.isPending ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  )
}
