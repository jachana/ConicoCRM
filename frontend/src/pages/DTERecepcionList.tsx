import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, CheckCircle2, XCircle, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import {
  listarDteRecepciones,
  aceptarDteRecepcion,
  rechazarDteRecepcion,
  type DteRecepcionRead,
  type DteRecepcionFilters,
  type DteRecepcionEstado,
} from '../api/dte_recepcion'
import DteRecepcionRechazarModal from '../components/DteRecepcionRechazarModal'
import {
  Button,
  Input,
  FormField,
  Badge,
  EmptyState,
  Skeleton,
  Tooltip,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui'

const ESTADO_VARIANT: Record<DteRecepcionEstado, 'info' | 'success' | 'danger'> = {
  recibido: 'info',
  aceptado: 'success',
  rechazado: 'danger',
}

const ESTADO_LABELS: Record<DteRecepcionEstado, string> = {
  recibido: 'Recibido',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
}

function fmtMoney(n: number | string) {
  const num = typeof n === 'string' ? Number(n) : n
  return `$ ${Math.round(num).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

const PAGE_SIZE = 50

export default function DTERecepcionList() {
  const qc = useQueryClient()

  const [estado, setEstado] = useState<DteRecepcionEstado | ''>('')
  const [rutEmisor, setRutEmisor] = useState('')
  const [page, setPage] = useState(1)

  const [rechazarTarget, setRechazarTarget] = useState<DteRecepcionRead | null>(null)
  const [aceptarTarget, setAceptarTarget] = useState<DteRecepcionRead | null>(null)

  const filters: DteRecepcionFilters = useMemo(
    () => ({
      estado: estado ? (estado as DteRecepcionEstado) : undefined,
      rut_emisor: rutEmisor || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [estado, rutEmisor, page],
  )

  const { data: listResponse, isLoading, isFetching } = useQuery({
    queryKey: ['dte-recepcion-list', filters],
    queryFn: () => listarDteRecepciones(filters),
  })

  const dtes = listResponse?.data ?? []
  const pagination = listResponse?.pagination ?? { limit: PAGE_SIZE, offset: 0, total: 0 }

  const aceptarMut = useMutation({
    mutationFn: (id: number) => aceptarDteRecepcion(id),
    onSuccess: () => {
      toast.success('DTE aceptado')
      setAceptarTarget(null)
      qc.invalidateQueries({ queryKey: ['dte-recepcion-list'] })
    },
    onError: () => {
      toast.error('Error al aceptar DTE')
    },
  })

  const rechazarMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      rechazarDteRecepcion(id, motivo),
    onSuccess: () => {
      toast.success('DTE rechazado')
      setRechazarTarget(null)
      qc.invalidateQueries({ queryKey: ['dte-recepcion-list'] })
    },
    onError: () => {
      toast.error('Error al rechazar DTE')
    },
  })

  function clearFilters() {
    setEstado('')
    setRutEmisor('')
    setPage(1)
  }

  const hasFilters = !!(estado || rutEmisor)
  const hasNextPage = dtes.length === PAGE_SIZE

  async function handleAceptar(dte: DteRecepcionRead) {
    aceptarMut.mutate(dte.id)
  }

  async function handleRechazar(dte: DteRecepcionRead) {
    setRechazarTarget(dte)
  }

  function handleRechazarConfirm(motivo: string) {
    if (rechazarTarget) {
      rechazarMut.mutate({ id: rechazarTarget.id, motivo })
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">DTE Recepción</h1>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3 items-end bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-800 shadow-elev-1">
        <FormField label="Estado">
          <Select
            value={estado || 'all'}
            onValueChange={v => {
              setEstado(v === 'all' ? '' : (v as DteRecepcionEstado))
              setPage(1)
            }}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="recibido">Recibido</SelectItem>
              <SelectItem value="aceptado">Aceptado</SelectItem>
              <SelectItem value="rechazado">Rechazado</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="RUT Emisor">
          <Input
            size="sm"
            placeholder="XX.XXX.XXX-K"
            value={rutEmisor}
            onChange={e => {
              setRutEmisor(e.target.value)
              setPage(1)
            }}
            className="w-40"
          />
        </FormField>

        {hasFilters && (
          <Button size="xs" variant="ghost" onClick={clearFilters}>
            Limpiar
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-elev-1">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : dtes.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Sin DTEs"
            description="No hay DTEs de recepción que coincidan con los filtros."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Tipo</TH>
                  <TH className="text-right">Folio</TH>
                  <TH>RUT Emisor</TH>
                  <TH className="text-right">Monto</TH>
                  <TH>Estado</TH>
                  <TH>Recibido</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {dtes.map(dte => {
                  const canAction = dte.estado === 'recibido'
                  return (
                    <TR key={dte.id}>
                      <TD className="text-gray-900 dark:text-gray-100 font-medium">{dte.tipo}</TD>
                      <TD className="text-gray-900 dark:text-gray-100 font-num font-medium text-right">
                        {dte.folio}
                      </TD>
                      <TD className="text-gray-700 dark:text-gray-300 font-num">{dte.rut_emisor}</TD>
                      <TD className="font-num font-medium text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {fmtMoney(dte.monto)}
                      </TD>
                      <TD>
                        <Badge
                          variant={ESTADO_VARIANT[dte.estado]}
                          showDot
                          className="capitalize"
                        >
                          {ESTADO_LABELS[dte.estado]}
                        </Badge>
                      </TD>
                      <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">
                        {fmtDate(dte.created_at)}
                      </TD>
                      <TD onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <Tooltip label={canAction ? 'Aceptar' : 'Solo recibidos'}>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              disabled={!canAction}
                              loading={aceptarMut.isPending && aceptarTarget?.id === dte.id}
                              className="text-gray-500 hover:text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10"
                              onClick={() => handleAceptar(dte)}
                            >
                              <CheckCircle2 />
                            </Button>
                          </Tooltip>
                          <Tooltip label={canAction ? 'Rechazar' : 'Solo recibidos'}>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              disabled={!canAction}
                              loading={rechazarMut.isPending && rechazarTarget?.id === dte.id}
                              className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                              onClick={() => handleRechazar(dte)}
                            >
                              <XCircle />
                            </Button>
                          </Tooltip>
                          <Tooltip label="Ver">
                            <Button size="icon-xs" variant="ghost" className="text-gray-500">
                              <Eye />
                            </Button>
                          </Tooltip>
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {(page > 1 || hasNextPage) && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-num">Página {page}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasNextPage || isFetching}
            onClick={() => setPage(p => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}

      {/* Rechazar modal */}
      {rechazarTarget && (
        <DteRecepcionRechazarModal
          dteRecepcion={rechazarTarget}
          onCancel={() => setRechazarTarget(null)}
          onConfirm={handleRechazarConfirm}
          isPending={rechazarMut.isPending}
          error={rechazarMut.error ? 'No se pudo rechazar' : null}
        />
      )}
    </div>
  )
}
