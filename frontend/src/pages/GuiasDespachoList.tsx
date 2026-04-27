import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, Download, Mail, Trash2, Plus, FileSpreadsheet, X as XIcon } from 'lucide-react'
import {
  listarGuiasDespacho,
  exportarGuiasDespachoExcel,
  enviarEmailGuiaDespacho,
  eliminarGuiaDespacho,
  MOTIVOS_TRASLADO,
  type GuiaListFilters,
  type GuiaDespachoListItem,
  type GuiaEstado,
  type GuiaDteEstado,
  type MotivoTraslado,
} from '../api/guiasDespacho'
import { openPdf } from '../lib/pdf'
import DteBadge from '../components/DteBadge'

const ESTADO_COLORS: Record<string, string> = {
  emitida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  anulada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
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

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const filters: GuiaListFilters = useMemo(() => ({
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    estado: estados.length > 0 ? estados : undefined,
    dte_estado: dteEstado ? [dteEstado] : undefined,
    motivo_traslado: motivo || undefined,
    vendedor_id: vendedorId ? Number(vendedorId) : undefined,
    page,
    page_size: PAGE_SIZE,
  }), [fechaDesde, fechaHasta, estados, dteEstado, motivo, vendedorId, page])

  const { data: guias = [], isLoading, isFetching } = useQuery<GuiaDespachoListItem[]>({
    queryKey: ['guias-despacho-list', filters],
    queryFn: () => listarGuiasDespacho(filters),
  })

  const eliminarMut = useMutation({
    mutationFn: (id: number) => eliminarGuiaDespacho(id),
    onSuccess: () => {
      showToast('Guía eliminada')
      qc.invalidateQueries({ queryKey: ['guias-despacho-list'] })
    },
    onError: () => showToast('No se pudo eliminar (¿ya emitida?)', false),
  })

  const sendEmailMut = useMutation({
    mutationFn: (id: number) => enviarEmailGuiaDespacho(id),
    onSuccess: () => {
      showToast('Email enviado')
      qc.invalidateQueries({ queryKey: ['guias-despacho-list'] })
    },
    onError: () => showToast('Error al enviar email', false),
  })

  async function handleExport() {
    try {
      const blob = await exportarGuiasDespachoExcel(filters)
      const date = new Date().toISOString().split('T')[0]
      downloadBlob(blob, `guias-despacho-${date}.xlsx`)
    } catch {
      showToast('Error al exportar', false)
    }
  }

  function handleDownloadPdf(id: number) {
    openPdf(`/api/guias-despacho/${id}/pdf`).catch(() => showToast('Error al abrir PDF', false))
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
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
            <FileSpreadsheet size={15} /> Exportar Excel
          </button>
          <button onClick={() => navigate('/guias-despacho/nueva')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg">
            <Plus size={15} /> Nueva guía
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-end bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800">
        <div>
          <label htmlFor="fecha-desde" className="block text-xs text-gray-500 mb-1">Desde</label>
          <input id="fecha-desde" type="date" value={fechaDesde}
            onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        </div>
        <div>
          <label htmlFor="fecha-hasta" className="block text-xs text-gray-500 mb-1">Hasta</label>
          <input id="fecha-hasta" type="date" value={fechaHasta}
            onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Estado</label>
          <div className="flex gap-2 py-1.5">
            {(['emitida', 'anulada'] as GuiaEstado[]).map(e => (
              <label key={e} className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={estados.includes(e)} onChange={() => toggleEstado(e)} />
                {e}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">DTE</label>
          <select value={dteEstado} onChange={e => { setDteEstado(e.target.value as GuiaDteEstado | ''); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="">Todas</option>
            {DTE_ESTADOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Motivo</label>
          <select value={motivo}
            onChange={e => { setMotivo(e.target.value ? Number(e.target.value) as MotivoTraslado : ''); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="">Todos</option>
            {MOTIVOS_TRASLADO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Vendedor ID</label>
          <input type="number" placeholder="ID" value={vendedorId}
            onChange={e => { setVendedorId(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-24" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters}
            className="text-xs text-gray-400 hover:text-gray-600 underline px-2 py-1.5">
            <XIcon size={12} className="inline" /> Limpiar
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-gray-400 py-12 text-center text-sm">Cargando...</div>
      ) : guias.length === 0 ? (
        <div className="text-gray-400 py-12 text-center text-sm">Sin guías de despacho para los filtros aplicados</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                {['Nº', 'Fecha', 'Cliente', 'Motivo', 'NV', 'Total', 'Estado', 'DTE', 'Vendedor', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {guias.map(g => {
                const motivoLabel = MOTIVOS_TRASLADO.find(m => m.value === g.motivo_traslado)?.label.split(' — ')[1] ?? '—'
                const canDelete = g.dte_estado === 'no_emitida' && g.estado !== 'anulada'
                return (
                  <tr key={g.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-white font-num">
                      <Link to={`/guias-despacho/${g.id}`} className="hover:text-brand-500">
                        {String(g.numero).padStart(5, '0')}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(g.fecha)}</td>
                    <td className="px-3 py-3 text-gray-900 dark:text-white">{g.cliente?.nombre ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300 text-xs">{motivoLabel}</td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300 font-num">
                      {g.nota_venta_id
                        ? <Link to={`/notas-venta/${g.nota_venta_id}`} className="text-brand-500 hover:underline">N°{g.nota_venta_id}</Link>
                        : '—'}
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap font-num">{fmtMoney(g.total)}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[g.estado] ?? ''}`}>
                        {g.estado}
                      </span>
                    </td>
                    <td className="px-3 py-3"><DteBadge estado={g.dte_estado} /></td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300 text-xs">{g.vendedor?.name ?? '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <Link to={`/guias-despacho/${g.id}`} title="Ver"
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded">
                          <Eye size={15} />
                        </Link>
                        <button onClick={() => handleDownloadPdf(g.id)} title="PDF"
                          className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded">
                          <Download size={15} />
                        </button>
                        <button onClick={() => sendEmailMut.mutate(g.id)} title="Enviar email"
                          disabled={sendEmailMut.isPending}
                          className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded disabled:opacity-50">
                          <Mail size={15} />
                        </button>
                        <button onClick={() => {
                          if (window.confirm(`¿Eliminar guía N°${g.numero}? Solo posible si DTE no fue emitida.`)) {
                            eliminarMut.mutate(g.id)
                          }
                        }} title="Eliminar (solo si DTE no emitida)" disabled={!canDelete}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-30 disabled:cursor-not-allowed">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(page > 1 || hasNextPage) && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button disabled={page <= 1 || isFetching}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">
            Anterior
          </button>
          <span className="text-sm text-gray-500">Página {page}</span>
          <button disabled={!hasNextPage || isFetching}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">
            Siguiente
          </button>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
