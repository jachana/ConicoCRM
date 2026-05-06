import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { History } from 'lucide-react'
import { api } from '../../lib/api'
import {
  Button, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter,
  Skeleton, Tooltip,
} from '../ui'
import ModuleAuditModal from './ModuleAuditModal'

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

// Indeterminate checkbox component
function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  className,
  disabled,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (checked: boolean) => void
  className?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  // Set indeterminate property imperatively — React doesn't support it as a prop
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate ?? false
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      className={`h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer ${className ?? ''}`}
    />
  )
}

export default function ModulesTab({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient()
  type PendingOff =
    | { kind: 'single'; parent: string; cascade: string[] }
    | { kind: 'bulk'; cascade: string[]; bulkSlugs: Record<string, boolean> }
  const [pendingOff, setPendingOff] = useState<PendingOff | null>(null)
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [auditSlug, setAuditSlug] = useState<{ slug: string; label: string } | null>(null)

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

  // --- Bulk selection helpers ---
  const toggleSlug = (slug: string) => {
    setSelectedSlugs(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  const toggleCategory = (cat: string, selectAll: boolean) => {
    const slugsInCat = byCategory[cat].map(e => e.slug)
    setSelectedSlugs(prev => {
      const next = new Set(prev)
      if (selectAll) {
        slugsInCat.forEach(s => next.add(s))
      } else {
        slugsInCat.forEach(s => next.delete(s))
      }
      return next
    })
  }

  const clearSelection = () => setSelectedSlugs(new Set())

  // --- Bulk enable ---
  const handleBulkEnable = () => {
    if (!data) return
    const slugsToEnable: Record<string, boolean> = {}
    selectedSlugs.forEach(slug => {
      const entry = data.registry.find(e => e.slug === slug)
      if (!entry) return
      const missingReqs = entry.requires.filter(r => !(data.effective[r] ?? false))
      const isBlocked = missingReqs.length > 0
      const isOn = data.effective[slug] ?? false
      // Skip blocked and already-on modules silently
      if (!isBlocked && !isOn) {
        slugsToEnable[slug] = true
      }
    })
    if (Object.keys(slugsToEnable).length === 0) return
    mutation.mutate({ slugs: slugsToEnable }, {
      onSettled: () => clearSelection(),
    })
  }

  // --- Bulk disable ---
  const handleBulkDisable = () => {
    if (!data) return
    // Collect all selected-on modules
    const onSlugs = Array.from(selectedSlugs).filter(slug => data.effective[slug] ?? false)
    if (onSlugs.length === 0) return

    // Compute union of all cascades across all selected-on modules.
    // We need to treat the effective state as if all onSlugs are off simultaneously,
    // so use a working copy of effective with all onSlugs set to false.
    const workingEffective = { ...data.effective }
    for (const s of onSlugs) workingEffective[s] = false

    const onSlugSet = new Set(onSlugs)
    const allCascadeSet = new Set<string>()
    for (const slug of onSlugs) {
      const cascade = computeCascadeOff(data.registry, workingEffective, slug)
      // Only include cascades that aren't already in the selected set being turned off
      for (const c of cascade) {
        if (!onSlugSet.has(c)) allCascadeSet.add(c)
      }
    }

    const allCascade = Array.from(allCascadeSet)

    if (allCascade.length > 0) {
      // Build the full slugs map for the confirmation handler
      const bulkSlugs: Record<string, boolean> = {}
      for (const s of onSlugs) bulkSlugs[s] = false
      for (const s of allCascade) bulkSlugs[s] = false

      // Use pendingOff with kind='bulk' representing the bulk operation
      setPendingOff({
        kind: 'bulk',
        cascade: allCascade,
        bulkSlugs,
      })
    } else {
      const slugs: Record<string, boolean> = {}
      for (const s of onSlugs) slugs[s] = false
      mutation.mutate({ slugs }, {
        onSettled: () => clearSelection(),
      })
    }
  }

  return (
    <>
    <div className="space-y-6 pb-20">
      {orderedCategories.map(cat => {
        const entries = byCategory[cat]
        const slugsInCat = entries.map(e => e.slug)
        const selectedInCat = slugsInCat.filter(s => selectedSlugs.has(s))
        const allSelected = selectedInCat.length === slugsInCat.length
        const someSelected = selectedInCat.length > 0 && !allSelected

        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <IndeterminateCheckbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(checked) => toggleCategory(cat, checked)}
              />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {CATEGORIA_LABELS[cat] ?? cat}
              </h3>
            </div>
            <div className="space-y-2">
              {entries.map(entry => {
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
                      setPendingOff({ kind: 'single', parent: entry.slug, cascade })
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
                    className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${
                      selectedSlugs.has(entry.slug)
                        ? 'border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-950/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={selectedSlugs.has(entry.slug)}
                        onChange={() => toggleSlug(entry.slug)}
                        className={`h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer ${
                          isBlocked ? 'opacity-40' : ''
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
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
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
                      <Tooltip label="Ver historial" side="left">
                        <button
                          type="button"
                          aria-label={`Historial de ${entry.label}`}
                          onClick={() => setAuditSlug({ slug: entry.slug, label: entry.label })}
                          className="rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
                        >
                          <History className="size-4" />
                        </button>
                      </Tooltip>
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
        )
      })}
    </div>

    {/* Bulk action bar */}
    {selectedSlugs.size > 0 && (
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-4 border-t border-gray-200 bg-white px-6 py-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {selectedSlugs.size} {selectedSlugs.size === 1 ? 'módulo seleccionado' : 'módulos seleccionados'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={mutation.isPending}
            onClick={handleBulkEnable}
          >
            Habilitar
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={mutation.isPending}
            onClick={handleBulkDisable}
          >
            Deshabilitar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={mutation.isPending}
            onClick={clearSelection}
          >
            Limpiar
          </Button>
        </div>
      </div>
    )}

    {/* Single-toggle cascade-confirm Modal */}
    {pendingOff && pendingOff.kind === 'single' && (
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

    {/* Bulk disable cascade-confirm Modal */}
    {pendingOff && pendingOff.kind === 'bulk' && (
      <Modal open onOpenChange={(open) => { if (!open && !mutation.isPending) setPendingOff(null) }}>
        <ModalContent size="sm" hideClose={mutation.isPending}>
          <ModalHeader>
            <ModalTitle className="text-danger-700 dark:text-danger-400">
              Deshabilitar módulos seleccionados
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Esto también apagará módulos dependientes:{' '}
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
                mutation.mutate({ slugs: pendingOff.bulkSlugs }, {
                  onSettled: () => {
                    setPendingOff(null)
                    clearSelection()
                  },
                })
              }}
            >
              Continuar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    )}
    {/* Per-module audit history modal */}
    {auditSlug && (
      <ModuleAuditModal
        slug={auditSlug.slug}
        label={auditSlug.label}
        empresaId={empresaId}
        onClose={() => setAuditSlug(null)}
      />
    )}
    </>
  )
}
