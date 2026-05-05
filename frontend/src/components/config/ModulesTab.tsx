import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import {
  Button, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter,
  Skeleton, Tooltip,
} from '../ui'

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

function computeCascadeOff(registry: RegistryEntry[], effective: Record<string, boolean>, slug: string): string[] {
  const queue = [...(registry.find(e => e.slug === slug)?.dependents ?? [])]
  const visited = new Set([slug])
  const cascade: string[] = []
  while (queue.length) {
    const dep = queue.pop()!
    if (visited.has(dep)) continue
    visited.add(dep)
    if (effective[dep]) {
      cascade.push(dep)
      const depEntry = registry.find(e => e.slug === dep)
      if (depEntry) queue.push(...depEntry.dependents)
    }
  }
  return cascade
}

export default function ModulesTab({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient()
  const [pendingOff, setPendingOff] = useState<{ parent: string; cascade: string[] } | null>(null)

  const { data, isLoading, isError } = useQuery<ModulosResponse>({
    queryKey: ['empresa-modulos', empresaId],
    queryFn: () => api.get(`/api/empresas/${empresaId}/modulos`).then(r => r.data),
  })

  const mutation = useMutation({
    mutationFn: (vars: { slugs: Record<string, boolean> }) =>
      api.patch(`/api/empresas/${empresaId}/modulos`, { modulos: vars.slugs }).then(r => r.data),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['empresa-modulos', empresaId] })
      const prev = qc.getQueryData<ModulosResponse>(['empresa-modulos', empresaId])
      if (prev) {
        qc.setQueryData<ModulosResponse>(['empresa-modulos', empresaId], {
          ...prev,
          stored: { ...prev.stored, ...vars.slugs },
          effective: { ...prev.effective, ...vars.slugs },
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['empresa-modulos', empresaId], ctx.prev)
      toast.error('No se pudo actualizar el módulo')
    },
    onSuccess: (serverData: ModulosResponse) => {
      qc.setQueryData(['empresa-modulos', empresaId], serverData)
      toast.success('Módulo actualizado')
      qc.invalidateQueries({ queryKey: ['empresa-modulos', empresaId] })
    },
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
    <>
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
              const isBlocked = missingReqs.length > 0
              const blockingLabel = missingReqs
                .map(r => data.registry.find(e => e.slug === r)?.label ?? r)
                .join(', ')

              const handleToggle = () => {
                if (isBlocked) return
                const newVal = !isOn
                if (!newVal) {
                  const cascade = computeCascadeOff(data.registry, data.effective, entry.slug)
                  if (cascade.length > 0) {
                    setPendingOff({ parent: entry.slug, cascade })
                    return
                  }
                }
                mutation.mutate({ slugs: { [entry.slug]: newVal } })
              }

              const switchBtn = (
                <button
                  role="switch"
                  aria-checked={isOn}
                  aria-label={entry.label}
                  disabled={isBlocked}
                  onClick={handleToggle}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    isOn ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'
                  } ${isBlocked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      isOn ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              )

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
                    {isBlocked ? (
                      <Tooltip label={`Requiere ${blockingLabel}`} side="left">
                        <span>{switchBtn}</span>
                      </Tooltip>
                    ) : switchBtn}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>

    {pendingOff && (
      <Modal open onOpenChange={(open) => { if (!open && !mutation.isPending) setPendingOff(null) }}>
        <ModalContent size="sm" hideClose={mutation.isPending}>
          <ModalHeader>
            <ModalTitle className="text-danger-700 dark:text-danger-400">
              Apagar {data.registry.find(e => e.slug === pendingOff.parent)?.label ?? pendingOff.parent}
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Esto también apagará:{' '}
              <span className="font-medium">
                {pendingOff.cascade
                  .map(s => data.registry.find(e => e.slug === s)?.label ?? s)
                  .join(', ')}
              </span>
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="ghost"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => setPendingOff(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={mutation.isPending}
              onClick={() => {
                const slugs: Record<string, boolean> = { [pendingOff.parent]: false }
                for (const s of pendingOff.cascade) slugs[s] = false
                mutation.mutate({ slugs }, {
                  onSettled: () => setPendingOff(null),
                })
              }}
            >
              Continuar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    )}
    </>
  )
}
