import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Eye, Download, Mail, Trash2, Plus, FileSpreadsheet, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import {
  listarBoletas,
  exportarBoletasExcel,
  enviarEmailBoleta,
  anularBoleta,
  type BoletaListFilters,
  type BoletaListItem,
  type BoletaEstado,
  type BoletaDteEstado,
  type BoletaMetodoPago,
} from '../api/boletas'
import { openPdf } from '../lib/pdf'
import DteBadge from '../components/DteBadge'
import BoletaAnularModal from '../components/BoletaAnularModal'
import BoletaEmailModal from '../components/BoletaEmailModal'
import {
  Button, Input, FormField, Badge, EmptyState, Skeleton, Tooltip,
  Table, THead, TBody, TR, TH, TD,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'

const ESTADO_VARIANT: Record<string, 'info' | 'danger' | 'neutral'> = {
  emitida: 'info',
  anulada: 'danger',
}

const DTE_ESTADOS: { value: BoletaDteEstado; label: string }[] = [
  { value: 'no_emitida', label: 'Sin emitir' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'procesando', label: 'Procesando' },
  { value: 'aceptada', label: 'Aceptada' },
  { value: 'rechazada', label: 'Rechazada' },
]

const METODOS_PAGO: { value: BoletaMetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'otro', label: 'Otro' },
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

export default function BoletasList() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [patente, setPatente] = useState('')
  const [estados, setEstados] = useState<BoletaEstado[]>([])
  const [dteEstado, setDteEstado] = useState<BoletaDteEstado | ''>('')
  const [metodoPago, setMetodoPago] = useState<BoletaMetodoPago | ''>('')
  const [vendedorId, setVendedorId] = useState('')
  const [page, setPage] = useState(1)

  const [anularTarget, setAnularTarget] = useState<BoletaListItem | null>(null)
  const [emailTarget, setEmailTarget] = useState<BoletaListItem | null>(null)

  const filters: BoletaListFilters = useMemo(() => ({
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    patente: patente || undefined,
    estado: estados.length > 0 ? estados : undefined,
    dte_estado: dteEstado ? [dteEstado] : undefined,
    metodo_pago: metodoPago || undefined,
    vendedor_id: vendedorId ? Number(vendedorId) : undefined,
    page,
    page_size: PAGE_SIZE,
  }), [fechaDesde, fechaHasta, patente, estados, dteEstado, metodoPago, vendedorId, page])

  const { data: boletas = [], isLoading, isFetching } = useQuery<BoletaListItem[]>({
    queryKey: ['boletas-list', filters],
    queryFn: () => listarBoletas(filters),
  })

  const sendEmailMut = useMutation({
    mutationFn: ({ id, email }: { id: number; email?: string }) => enviarEmailBoleta(id, email),
    onSuccess: () => {
      toast.success('Email enviado')
      setEmailTarget(null)
      qc.invalidateQueries({ queryKey: ['boletas-list'] })
    },
  })

  const anularMut = useMutation({
    mutationFn: ({ id, razon }: { id: number; razon: string }) => anularBoleta(id, razon),
    onSuccess: () => {
      toast.success('Boleta anulada')
      setAnularTarget(null)
      qc.invalidateQueries({ queryKey: ['boletas-list'] })
    },
  })

  async function handleExport() {
    try {
      const blob = await exportarBoletasExcel(filters)
      const date = new Date().toISOString().split('T')[0]
      downloadBlob(blob, `boletas-${date}.xlsx`)
    } catch {
      toast.error('Error al exportar')
    }
  }

  function handleDownloadPdf(id: number) {
    openPdf(`/api/boletas/${id}/pdf`).catch(() => toast.error('Error al abrir PDF'))
  }

  async function handleSendEmail(b: BoletaListItem) {
    try {
      await enviarEmailBoleta(b.id)
      toast.success('Email enviado')
      qc.invalidateQueries({ queryKey: ['boletas-list'] })
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } }
      if (e?.response?.status === 422) {
        setEmailTarget(b)
      } else {
        toast.error('Error al enviar email')
      }
    }
  }

  function toggleEstado(v: BoletaEstado) {
    setEstados(prev => prev.includes(v) ? prev.filter(e => e !== v) : [...prev, v])
    setPage(1)
  }

  function clearFilters() {
    setFechaDesde(''); setFechaHasta(''); setPatente('')
    setEstados([]); setDteEstado(''); setMetodoPago(''); setVendedorId('')
    setPage(1)
  }

  const hasFilters = !!(fechaDesde || fechaHasta || patente || estados.length || dteEstado || metodoPago || vendedorId)
  const hasNextPage = boletas.length === PAGE_SIZE

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Boletas</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" leftIcon={<FileSpreadsheet />} onClick={handleExport}>
            Excel
          </Button>
          <Button leftIcon={<Plus />} onClick={() => navigate('/boletas/nueva')}>
            Nueva boleta
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3 items-end bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-800 shadow-elev-1">
        <FormField label="Desde">
          <Input type="date" size="sm" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPage(1) }} className="w-36" />
        </FormField>
        <FormField label="Hasta">
          <Input type="date" size="sm" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPage(1) }} className="w-36" />
        </FormField>
        <FormField label="Patente">
          <Input
            size="sm"
            placeholder="Patente..."
            value={patente}
            onChange={e => { setPatente(e.target.value.toUpperCase()); setPage(1) }}
            className="w-32"
          />
        </FormField>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
          <div className="flex gap-3 py-1.5">
            {(['emitida', 'anulada'] as BoletaEstado[]).map(e => (
              <label key={e} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={estados.includes(e)}
                  onChange={() => toggleEstado(e)}
                  className="rounded accent-brand-500"
                />
                {e}
              </label>
            ))}
          </div>
        </div>
        <FormField label="DTE">
          <Select value={dteEstado || 'all'} onValueChange={v => { setDteEstado(v === 'all' ? '' : (v as BoletaDteEstado)); setPage(1) }}>
            <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {DTE_ESTADOS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Método pago">
          <Select value={metodoPago || 'all'} onValueChange={v => { setMetodoPago(v === 'all' ? '' : (v as BoletaMetodoPago)); setPage(1) }}>
            <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {METODOS_PAGO.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Vendedor ID">
          <Input
            type="number"
            size="sm"
            placeholder="ID"
            value={vendedorId}
            onChange={e => { setVendedorId(e.target.value); setPage(1) }}
            className="w-24"
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
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : boletas.length === 0 ? (
          <EmptyState icon={<Inbox />} title="Sin boletas" description="No hay boletas que coincidan con los filtros." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Nº</TH>
                  <TH>Fecha</TH>
                  <TH>Tipo</TH>
                  <TH>Receptor</TH>
                  <TH>Patente</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Método</TH>
                  <TH>Estado</TH>
                  <TH>DTE</TH>
                  <TH>Vendedor</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {boletas.map(b => {
                  const receptor = b.cliente?.nombre ?? b.nombre_receptor ?? '—'
                  const canAnular = b.estado !== 'anulada'
                  return (
                    <TR key={b.id} interactive onClick={() => navigate(`/boletas/${b.id}`)}>
                      <TD className="font-num font-medium text-gray-900 dark:text-gray-100">
                        {String(b.numero).padStart(5, '0')}
                      </TD>
                      <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">{fmtDate(b.fecha)}</TD>
                      <TD className="text-gray-700 dark:text-gray-300">{b.tipo_dte}</TD>
                      <TD className="text-gray-900 dark:text-gray-100">{receptor}</TD>
                      <TD className="text-gray-700 dark:text-gray-300 font-num">{b.patente_vehiculo ?? '—'}</TD>
                      <TD className="font-num font-medium text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmtMoney(b.total)}</TD>
                      <TD className="text-gray-700 dark:text-gray-300 capitalize">{b.metodo_pago}</TD>
                      <TD>
                        <Badge variant={ESTADO_VARIANT[b.estado] ?? 'neutral'} showDot className="capitalize">{b.estado}</Badge>
                      </TD>
                      <TD><DteBadge estado={b.dte_estado} /></TD>
                      <TD className="text-gray-500 dark:text-gray-400 text-xs">{b.vendedor?.name ?? '—'}</TD>
                      <TD onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <Tooltip label="Ver">
                            <Button size="icon-xs" variant="ghost" onClick={() => navigate(`/boletas/${b.id}`)}>
                              <Eye />
                            </Button>
                          </Tooltip>
                          <Tooltip label="PDF">
                            <Button size="icon-xs" variant="ghost" onClick={() => handleDownloadPdf(b.id)}>
                              <Download />
                            </Button>
                          </Tooltip>
                          <Tooltip label="Enviar email">
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              loading={sendEmailMut.isPending}
                              onClick={() => handleSendEmail(b)}
                            >
                              <Mail />
                            </Button>
                          </Tooltip>
                          <Tooltip label={canAnular ? 'Anular' : 'Ya anulada'}>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              disabled={!canAnular}
                              className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                              onClick={() => setAnularTarget(b)}
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

      {anularTarget && (
        <BoletaAnularModal
          isOpen
          boleta={anularTarget}
          onClose={() => setAnularTarget(null)}
          onConfirm={(razon) => anularMut.mutate({ id: anularTarget.id, razon })}
          isPending={anularMut.isPending}
          error={anularMut.error ? 'No se pudo anular' : null}
        />
      )}
      {emailTarget && (
        <BoletaEmailModal
          isOpen
          boleta={emailTarget}
          onClose={() => setEmailTarget(null)}
          onConfirm={(email) => sendEmailMut.mutate({ id: emailTarget.id, email })}
          isPending={sendEmailMut.isPending}
          error={sendEmailMut.error ? 'No se pudo enviar' : null}
        />
      )}
    </div>
  )
}
