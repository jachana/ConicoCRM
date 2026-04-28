import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Inbox,
  Lock,
} from 'lucide-react'
import { listarAuditoria, exportarAuditoriaCsvUrl, type AuditLog, type AuditFiltros } from '../api/auditoria'
import { useAuthStore } from '../stores/auth'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tooltip,
} from '../components/ui'

const ENTITY_OPTIONS = [
  'Cotizacion', 'NotaVenta', 'Factura', 'NotaCredito', 'NotaDebito',
  'Producto', 'ListaPrecios', 'Empresa', 'Cliente', 'User',
  'PermissionOverride', 'SystemConfig',
]
const ACTION_OPTIONS = ['create', 'update', 'delete']

const ACTION_VARIANT: Record<string, 'info' | 'warning' | 'danger' | 'neutral'> = {
  create: 'info',
  update: 'warning',
  delete: 'danger',
}

const PAGE_SIZE = 50

function fmtDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AdminAuditoria() {
  const accessToken = useAuthStore(s => s.accessToken)
  const user = useAuthStore(s => s.user)
  const { role: effectiveRole } = useEffectivePermissions()
  const isAdmin = (effectiveRole ?? user?.role) === 'admin'
  const [filtros, setFiltros] = useState<AuditFiltros>({ limit: PAGE_SIZE, offset: 0 })
  const [diffViewing, setDiffViewing] = useState<AuditLog | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['auditoria', filtros],
    queryFn: () => listarAuditoria(filtros),
    enabled: isAdmin,
  })

  const items: AuditLog[] = data?.items ?? []
  const total = data?.total ?? 0
  const errorMsg = isError
    ? (() => {
        const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
        return typeof detail === 'string' ? detail : 'Error al cargar auditoría'
      })()
    : null

  function setFiltro<K extends keyof AuditFiltros>(k: K, v: AuditFiltros[K]) {
    setFiltros(prev => ({ ...prev, [k]: v, offset: 0 }))
  }

  function descargarCsv() {
    const url = exportarAuditoriaCsvUrl({
      ...filtros,
      limit: undefined,
      offset: undefined,
    })
    // Download via fetch + blob to attach Bearer token.
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.blob())
      .then(b => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(b)
        link.download = 'auditoria.csv'
        link.click()
        URL.revokeObjectURL(link.href)
      })
  }

  const offset = filtros.offset ?? 0
  const limit = filtros.limit ?? PAGE_SIZE
  const lastPageOffset = Math.max(0, Math.floor((total - 1) / limit) * limit)

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Auditoría</h1>
        <Card padded>
          <EmptyState
            icon={<Lock />}
            title="Acceso restringido"
            description="No tienes permiso para acceder a esta sección."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Auditoría</h1>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Download />}
          onClick={descargarCsv}
        >
          Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <Card className="mb-4 p-3">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <FormField label="Entidad">
            <Select
              value={filtros.entity_type ?? 'all'}
              onValueChange={v => setFiltro('entity_type', v === 'all' ? undefined : v)}
            >
              <SelectTrigger size="sm" aria-label="Entidad"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las entidades</SelectItem>
                {ENTITY_OPTIONS.map(o => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Acción">
            <Select
              value={filtros.action ?? 'all'}
              onValueChange={v => setFiltro('action', v === 'all' ? undefined : v)}
            >
              <SelectTrigger size="sm" aria-label="Acción"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las acciones</SelectItem>
                {ACTION_OPTIONS.map(o => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Usuario">
            <Input
              type="number"
              size="sm"
              placeholder="user_id"
              value={filtros.user_id ?? ''}
              onChange={e => setFiltro('user_id', e.target.value ? Number(e.target.value) : undefined)}
              aria-label="Usuario"
            />
          </FormField>

          <FormField label="ID de entidad">
            <Input
              type="text"
              size="sm"
              placeholder="entity_id"
              value={filtros.entity_id ?? ''}
              onChange={e => setFiltro('entity_id', e.target.value || undefined)}
              aria-label="ID de entidad"
            />
          </FormField>

          <FormField label="Desde">
            <Input
              type="date"
              size="sm"
              value={filtros.from_date ?? ''}
              onChange={e => setFiltro('from_date', e.target.value || undefined)}
              aria-label="Desde"
            />
          </FormField>

          <FormField label="Hasta">
            <Input
              type="date"
              size="sm"
              value={filtros.to_date ?? ''}
              onChange={e => setFiltro('to_date', e.target.value || undefined)}
              aria-label="Hasta"
            />
          </FormField>
        </div>
      </Card>

      {errorMsg && (
        <div className="bg-danger-50 dark:bg-danger-500/10 text-danger-600 dark:text-danger-400 border border-danger-500/30 p-2 rounded mb-3 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Tabla */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="Sin registros"
          description="No hay registros de auditoría para los filtros aplicados."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table density="compact">
            <THead>
              <TR>
                <TH>Timestamp</TH>
                <TH>Usuario</TH>
                <TH>Acción</TH>
                <TH>Entidad</TH>
                <TH>ID</TH>
                <TH>IP</TH>
                <TH className="text-right">Diff</TH>
              </TR>
            </THead>
            <TBody>
              {items.map(it => (
                <TR key={it.id}>
                  <TD className="font-num text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmtDate(it.created_at)}</TD>
                  <TD className="text-gray-900 dark:text-gray-100">
                    {it.user_name ?? (it.user_id ? `#${it.user_id}` : 'Sistema')}
                  </TD>
                  <TD>
                    <Badge variant={ACTION_VARIANT[it.action] ?? 'neutral'} size="sm">
                      {it.action}
                    </Badge>
                  </TD>
                  <TD className="text-gray-700 dark:text-gray-300">{it.entity_type}</TD>
                  <TD className="font-num text-gray-600 dark:text-gray-400">{it.entity_id}</TD>
                  <TD className="font-mono text-xs text-gray-500 dark:text-gray-400">{it.ip ?? ''}</TD>
                  <TD className="text-right">
                    <Tooltip label="Ver diff">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setDiffViewing(it)}
                        aria-label="Ver diff"
                      >
                        <Eye />
                      </Button>
                    </Tooltip>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {/* Paginación */}
      <div className="flex items-center justify-between mt-3 text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          {total} registros · página {Math.floor(offset / limit) + 1} de {Math.max(1, Math.floor(lastPageOffset / limit) + 1)}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ChevronLeft />}
            disabled={offset <= 0}
            onClick={() => setFiltros(f => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - limit) }))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            rightIcon={<ChevronRight />}
            disabled={offset + limit >= total}
            onClick={() => setFiltros(f => ({ ...f, offset: (f.offset ?? 0) + limit }))}
          >
            Siguiente
          </Button>
        </div>
      </div>

      {/* Modal diff */}
      <Modal open={diffViewing !== null} onOpenChange={(open) => { if (!open) setDiffViewing(null) }}>
        <ModalContent size="xl">
          <ModalHeader>
            <ModalTitle>
              {diffViewing
                ? `Diff · ${diffViewing.entity_type} #${diffViewing.entity_id} · ${diffViewing.action}`
                : 'Diff'}
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <pre className="text-xs bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 p-3 rounded overflow-auto whitespace-pre-wrap font-mono">
              {diffViewing ? JSON.stringify(diffViewing.diff_json, null, 2) : ''}
            </pre>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setDiffViewing(null)}>
              Cerrar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
