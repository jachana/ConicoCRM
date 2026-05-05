import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Skeleton } from '../ui'

interface RegistryEntry {
  slug: string
  label: string
  categoria: string
  requires: string[]
  dependents: string[]
}

interface ModulosResponse {
  stored: Record<string, boolean>
  effective: Record<string, boolean>
  registry: RegistryEntry[]
}

const CATEGORIA_LABELS: Record<string, string> = {
  ventas: 'Ventas',
  compras: 'Compras',
  inventario_precios: 'Inventario y Precios',
  finanzas: 'Finanzas',
  dte_sii: 'DTE / SII',
  crm: 'CRM',
  rrhh: 'RRHH',
  aprobaciones: 'Aprobaciones',
}

export default function ModulesTab({ empresaId }: { empresaId: number }) {
  const { data, isLoading, isError } = useQuery<ModulosResponse>({
    queryKey: ['empresa-modulos', empresaId],
    queryFn: () => api.get(`/api/empresas/${empresaId}/modulos`).then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[0, 1, 2].map(i => (
          <div key={i}>
            <Skeleton className="h-4 w-32 mb-3" />
            <div className="space-y-2">
              {[0, 1, 2].map(j => <Skeleton key={j} className="h-16 w-full rounded-lg" />)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Error al cargar módulos. Intenta recargar la página.
      </p>
    )
  }

  const byCategory = data.registry.reduce<Record<string, RegistryEntry[]>>((acc, entry) => {
    if (!acc[entry.categoria]) acc[entry.categoria] = []
    acc[entry.categoria].push(entry)
    return acc
  }, {})

  const orderedCategories = [
    'ventas', 'compras', 'inventario_precios', 'finanzas',
    'dte_sii', 'crm', 'rrhh', 'aprobaciones',
  ].filter(cat => byCategory[cat]?.length)

  return (
    <div className="space-y-6">
      {orderedCategories.map(cat => (
        <div key={cat}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            {CATEGORIA_LABELS[cat] ?? cat}
          </h3>
          <div className="space-y-2">
            {byCategory[cat].map(entry => {
              const isOn = data.effective[entry.slug] ?? false
              const missingReqs = entry.requires.filter(r => !(data.effective[r] ?? false))
              return (
                <div
                  key={entry.slug}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{entry.label}</p>
                    {missingReqs.length > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        Requiere: {missingReqs.map(r => {
                          const dep = data.registry.find(e => e.slug === r)
                          return dep?.label ?? r
                        }).join(', ')}
                      </p>
                    )}
                    {entry.dependents.length > 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        Habilita: {entry.dependents.map(d => {
                          const dep = data.registry.find(e => e.slug === d)
                          return dep?.label ?? d
                        }).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isOn
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {isOn ? 'Activo' : 'Inactivo'}
                    </span>
                    <button
                      disabled
                      aria-checked={isOn}
                      role="switch"
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-not-allowed rounded-full border-2 border-transparent transition-colors ${
                        isOn ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'
                      } opacity-60`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          isOn ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
