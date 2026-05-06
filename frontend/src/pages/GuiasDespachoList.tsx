import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Eye, Download, Mail, Trash2, Plus, FileSpreadsheet, X as XIcon, Inbox } from 'lucide-react'
import {
  listarGuiasDespacho,
  exportarGuiasDespachoExcel,
  enviarEmailGuiaDespacho,
  eliminarGuiaDespacho,
  MOTIVOS_TRASLADO,
  type GuiaListFilters,
  type GuiaDespachoListItem,
  type GuiaDespachoListResponse,
  type GuiaEstado,
  type GuiaDteEstado,
  type MotivoTraslado,
} from '../api/guiasDespacho'
import { openPdf } from '../lib/pdf'
import DteBadge from '../components/DteBadge'
import ConfirmModal from '../components/ui/ConfirmModal'
import {
  Button, Input, Badge, EmptyState, Skeleton, Card,
  Table, THead, TBody, TR, TH, TD,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tooltip,
} from '../components/ui'

const ESTADO_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  emitida: 'info',
  anulada: 'danger',
}

const DTE_ESTADOS: { value: GuiaDteEstado; label: string }[] = [
  { value: 'no_emitida', label: 'Sin emitir' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'procesando', label: 'Procesando' },
  { value: 'aceptada', label: 'Aceptada' },
  { value: 'rechazada', label: 'Rechazada' },
]

function fmtMoney(n: number | string) {
  const num = typeof n === 'string' ? Number(n) : n
  return `$ ${Math.round(num).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const PAGE_SIZE = 50

export default function GuiasDespachoList() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [estados, setEstados] = useState<GuiaEstado[]>([])
  const [dteEstado, setDteEstado] = useState<GuiaDteEstado | ''>('')
  const [motivo, setMotivo] = useState<MotivoTraslado | ''>('')
  const [vendedorId, setVendedorId] = useState('')
  const [page, setPage] = useState(1)
  const [confirmEliminarId, setConfirmEliminarId] = useState<number | null>(null)
  const [confirmEliminarNumero, setConfirmEliminarNumero] = useState<number | null>(null)

  const filters: GuiaListFilters = useMemo(() => ({
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    estado: estados.length > 0 ? estados : undefined,
    dte_estado: dteEstado ? [dteEstado] : undefined,
    motivo_traslado: motivo || undefined,
    vendedor_id: vendedorId ? Number(vendedorId) : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }), [fechaDesde, fechaHasta, estados, dteEstado, motivo, vendedorId, page])

  const { data: listResponse, isLoading, isFetching } = useQuery<GuiaDespachoListResponse>({
    queryKey: ['guias-despacho-list', filters],
    queryFn: () => listarGuiasDespacho(filters),
  })

  const guias = listResponse?.data ?? []

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarGuiaDespacho(id),
    onSuccess: () => {
      toast.success('Guía eliminada')
      qc.invalidateQueries({ queryKey: ['guias-despacho-list'] })
    },
    onError: () => toast.error('No se pudo eliminar (¿ya emitida?)'),
  })

  const sendEmailMut = useMutation({
    mutationFn: (id: number) => enviarEmailGuiaDespacho(id),
    onSuccess: () => {
      toast.success('Email enviado')
      qc.invalidateQueries({ queryKey: ['guias-despacho-list'] })
    },
    onError: () => toast.error('Error al enviar email'),
  })

  async function handleExport() {
    try {
      const blob = await exportarGuiasDespachoExcel(filters)
      const date = new Date().toISOString().split('T')[0]
      downloadBlob(blob, `guias-despacho-${date}.xlsx`)
    } catch {
      toast.error('Error al exportar')
    }
  }

  function handleDownloadPdf(id: number) {
    openPdf(`/api/guias-despacho/${id}/pdf`).catch(() => toast.error('Error al abrir PDF'))
  }

  function toggleEstado(v: GuiaEstado) {
    setEstados(prev => prev.includes(v) ? prev.filter(e => e !== v) : [...prev, v])
    setPage(1)
  }

  function clearFilters() {
    setFechaDesde(''); setFechaHasta('')
    setEstados([]); setDteEstado(''); setMotivo(''); setVendedorId('')
    setPage(1)
  }

  const hasFilters = !!(fechaDesde || fechaHasta || estados.length || dteEstado || motivo || vendedorId)
  const hasNextPage = guias.length === PAGE_SIZE

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Guías de Despacho</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" leftIcon={<FileSpreadsheet />} onClick={handleExport}>
            Exportar Excel
          </Button>
          <Button size="sm" leftIcon={<Plus />} onClick={() => navigate('/guias-despacho/nueva')}>
            Nueva guía
          </Button>
        </div>
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="fecha-desde" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Desde</label>
            <Input
              id="fecha-desde"
              size="sm"
              type="date"
              value={fechaDesde}
              onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
            />
          </div>
          <div>
            <label htmlFor="fecha-hasta" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
            <Input
              id="fecha-hasta"
              size="sm"
              type="date"
              value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
            />
          </div>
          <div>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Estado</span>
            <div className="flex gap-2 py-1.5">
              {(['emitida', 'anulada'] as GuiaEstado[]).map(e => (
                <label key={e} className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 accent-brand-500"
                    checked={estados.includes(e)}
                    onChange={() => toggleEstado(e)}
                  />
                  {e}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">DTE</span>
            <Select
              value={dteEstado || 'all'}
              onValueChange={v => { setDteEstado(v === 'all' ? '' : v as GuiaDteEstado); setPage(1) }}
            >
              <SelectTrigger size="sm" className="min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {DTE_ESTADOS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Motivo</span>
            <Select
              value={motivo === '' ? 'all' : String(motivo)}
              onValueChange={v => {
                setMotivo(v === 'all' ? '' : (Number(v) as MotivoTraslado))
                setPage(1)
              }}
            >
              <SelectTrigger size="sm" className="min-w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {MOTIVOS_TRASLADO.map(m => (
                  <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="vendedor-id" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Vendedor ID</label>
            <Input
              id="vendedor-id"
              size="sm"
              type="number"
              placeholder="ID"
              value={vendedorId}
              onChange={e => { setVendedorId(e.target.value); setPage(1) }}
              className="w-24"
            />
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="xs"
              leftIcon={<XIcon />}
              onClick={clearFilters}
              className="text-gray-500"
            >
              Limpiar
            </Button>
          )}
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : guias.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="Sin guías"
          description="No hay resultados para los filtros aplicados."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table density="compact" className="min-w-[900px]">
            <THead>
              <TR>
                <TH>Nº</TH>
                <TH>Fecha</TH>
                <TH>Cliente</TH>
                <TH>Motivo</TH>
                <TH>NV</TH>
                <TH className="text-right">Total</TH>
                <TH>Estado</TH>
                <TH>DTE</TH>
                <TH>Vendedor</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {guias.map(g => {
                const motivoLabel = MOTIVOS_TRASLADO.find(m => m.value === g.motivo_traslado)?.label.split(' — ')[1] ?? '—'
                const canDelete = g.dte_estado === 'no_emitida' && g.estado !== 'anulada'
                return (
                  <TR key={g.id} interactive onClick={() => navigate(`/guias-despacho/${g.id}`)}>
                    <TD className="font-medium text-gray-900 dark:text-white font-num">
                      {String(g.numero).padStart(5, '0')}
                    </TD>
                    <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">{fmtDate(g.fecha)}</TD>
                    <TD className="text-gray-900 dark:text-white">{g.cliente?.nombre ?? '—'}</TD>
                    <TD className="text-gray-700 dark:text-gray-300 text-xs">{motivoLabel}</TD>
                    <TD className="text-gray-700 dark:text-gray-300 font-num" onClick={e => e.stopPropagation()}>
                      {g.nota_venta_id
                        ? (
                          <button
                            onClick={() => navigate(`/notas-venta/${g.nota_venta_id}`)}
                            className="text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            N°{g.nota_venta_id}
                          </button>
                        )
                        : '—'}
                    </TD>
                    <TD className="font-medium text-gray-900 dark:text-white whitespace-nowrap text-right font-num">{fmtMoney(g.total)}</TD>
                    <TD>
                      <Badge variant={ESTADO_VARIANT[g.estado] ?? 'neutral'} size="sm">
                        {g.estado}
                      </Badge>
                    </TD>
                    <TD><DteBadge estado={g.dte_estado} /></TD>
                    <TD className="text-gray-700 dark:text-gray-300 text-xs">{g.vendedor?.name ?? '—'}</TD>
                    <TD onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip label="Ver">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => navigate(`/guias-despacho/${g.id}`)}
                            aria-label="Ver guía"
                          >
                            <Eye />
                          </Button>
                        </Tooltip>
                        <Tooltip label="PDF">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => handleDownloadPdf(g.id)}
                            aria-label="Descargar PDF"
                          >
                            <Download />
                          </Button>
                        </Tooltip>
                        <Tooltip label="Enviar email">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => sendEmailMut.mutate(g.id)}
                            disabled={sendEmailMut.isPending}
                            aria-label="Enviar email"
                          >
                            <Mail />
                          </Button>
                        </Tooltip>
                        <Tooltip label="Eliminar (solo si DTE no emitida)">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            disabled={!canDelete}
                            onClick={() => {
                              setConfirmEliminarId(g.id); setConfirmEliminarNumero(g.numero)
                            }}
                            aria-label="Eliminar guía"
                            className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                          >
                            <Trash2 />
                          </Button>
                        </Tooltip>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      {(page > 1 || hasNextPage) && (
        <div className="flex items-center justify-center gap-3 py-3">
          <Button variant="ghost" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || isFetching}>
            Anterior
          </Button>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-num">Página {page}</span>
          <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasNextPage || isFetching}>
            Siguiente
          </Button>
        </div>
      )}
      <ConfirmModal
        open={confirmEliminarId !== null}
        onOpenChange={(v) => { if (!v) { setConfirmEliminarId(null); setConfirmEliminarNumero(null) } }}
        title={`¿Eliminar guía N°${confirmEliminarNumero}?`}
        description="Solo posible si el DTE no fue emitido."
        confirmLabel="Eliminar"
        onConfirm={() => { const id = confirmEliminarId; setConfirmEliminarId(null); setConfirmEliminarNumero(null); if (id !== null) eliminarMut.mutate(id) }}
        isPending={eliminarMut.isPending}
      />
    </div>
  )
}
