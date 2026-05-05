import { useQuery } from '@tanstack/react-query'
import { listarAuditoria, type AuditLog } from '../../api/auditoria'
import {
  Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, Skeleton,
} from '../ui'

interface Props {
  slug: string
  label: string
  empresaId: number
  onClose: () => void
}

interface DiffEntry {
  slug: string
  before: boolean
  after: boolean
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}

function stateLabel(val: boolean): string {
  return val ? 'Activo' : 'Inactivo'
}

function extractDiff(log: AuditLog, slug: string): DiffEntry | null {
  if (!log.diff_json) return null
  const raw = log.diff_json as { diff?: unknown }
  if (!Array.isArray(raw.diff)) return null
  const entry = (raw.diff as DiffEntry[]).find(d => d.slug === slug)
  return entry ?? null
}

export default function ModuleAuditModal({ slug, label, empresaId, onClose }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-module', slug, empresaId],
    queryFn: () =>
      listarAuditoria({
        action: 'modulos.toggle',
        entity_type: 'Empresa',
        entity_id: String(empresaId),
        limit: 50,
      }),
  })

  const events = data
    ? data.items.filter(log => extractDiff(log, slug) !== null)
    : []

  return (
    <Modal open onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Historial: {label}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          {isLoading && (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Error al cargar el historial. Intenta nuevamente.
            </p>
          )}

          {!isLoading && !isError && events.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sin historial para este módulo.
            </p>
          )}

          {!isLoading && !isError && events.length > 0 && (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {events.map(log => {
                const diff = extractDiff(log, slug)!
                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                      {formatDate(log.created_at)}
                    </span>
                    <span className="mx-4 flex-1 text-gray-700 dark:text-gray-300 truncate">
                      {log.user_name ?? 'Sistema'}
                    </span>
                    <span className="flex-shrink-0 text-gray-600 dark:text-gray-300">
                      <span className={diff.before ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                        {stateLabel(diff.before)}
                      </span>
                      {' → '}
                      <span className={diff.after ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                        {stateLabel(diff.after)}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
