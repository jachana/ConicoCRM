import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, Download, Mail, Trash2, Plus, FileSpreadsheet } from 'lucide-react'
import {
  listarBoletas,
  exportarBoletasExcel,
  pdfBoletaUrl,
  enviarEmailBoleta,
  anularBoleta,
  type BoletaListFilters,
  type BoletaListItem,
  type BoletaEstado,
  type BoletaDteEstado,
  type BoletaMetodoPago,
} from '../api/boletas'
import DteBadge from '../components/DteBadge'
import BoletaAnularModal from '../components/BoletaAnularModal'
import BoletaEmailModal from '../components/BoletaEmailModal'

const ESTADO_COLORS: Record<string, string> = {
  emitida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  anulada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
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

  // Filter state
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [patente, setPatente] = useState('')
  const [estados, setEstados] = useState<BoletaEstado[]>([])
  const [dteEstado, setDteEstado] = useState<BoletaDteEstado | ''>('')
  const [metodoPago, setMetodoPago] = useState<BoletaMetodoPago | ''>('')
  const [vendedorId, setVendedorId] = useState('')
  const [page, setPage] = useState(1)

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // Modal state
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
      showToast('Email enviado')
      setEmailTarget(null)
      qc.invalidateQueries({ queryKey: ['boletas-list'] })
    },
  })

  const anularMut = useMutation({
    mutationFn: ({ id, razon }: { id: number; razon: string }) => anularBoleta(id, razon),
    onSuccess: () => {
      showToast('Boleta anulada')
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
      showToast('Error al exportar', false)
    }
  }

  function handleDownloadPdf(id: number) {
    window.open(pdfBoletaUrl(id), '_blank')
  }

  async function handleSendEmail(b: BoletaListItem) {
    try {
      await enviarEmailBoleta(b.id)
      showToast('Email enviado')
      qc.invalidateQueries({ queryKey: ['boletas-list'] })
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } }
      if (e?.response?.status === 422) {
        setEmailTarget(b)
      } else {
        showToast('Error al enviar email', false)
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
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Boletas</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <FileSpreadsheet size={15} /> Exportar Excel
          </button>
          <button
            onClick={() => navigate('/boletas/nueva')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg"
          >
            <Plus size={15} /> Nueva boleta
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2 items-end bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Desde</label>
          <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Patente</label>
          <input type="text" placeholder="Patente..." value={patente}
            onChange={e => { setPatente(e.target.value.toUpperCase()); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-32" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Estado</label>
          <div className="flex gap-2 py-1.5">
            {(['emitida', 'anulada'] as BoletaEstado[]).map(e => (
              <label key={e} className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={estados.includes(e)} onChange={() => toggleEstado(e)} />
                {e}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">DTE</label>
          <select value={dteEstado} onChange={e => { setDteEstado(e.target.value as BoletaDteEstado | ''); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="">Todas</option>
            {DTE_ESTADOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Método pago</label>
          <select value={metodoPago} onChange={e => { setMetodoPago(e.target.value as BoletaMetodoPago | ''); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="">Todos</option>
            {METODOS_PAGO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Vendedor ID</label>
          <input type="number" placeholder="ID" value={vendedorId}
            onChange={e => { setVendedorId(e.target.value); setPage(1) }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-24" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-600 underline px-2 py-1.5">
            Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-gray-400 py-12 text-center text-sm">Cargando...</div>
      ) : boletas.length === 0 ? (
        <div className="text-gray-400 py-12 text-center text-sm">Sin boletas para los filtros aplicados</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                {['Nº', 'Fecha', 'Tipo', 'Receptor', 'Patente', 'Total', 'Método', 'Estado', 'DTE', 'Vendedor', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {boletas.map(b => {
                const receptor = b.cliente?.nombre ?? b.nombre_receptor ?? '—'
                const canAnular = b.estado !== 'anulada'
                return (
                  <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-white font-num">
                      <Link to={`/boletas/${b.id}`} className="hover:text-brand-500">
                        {String(b.numero).padStart(5, '0')}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(b.fecha)}</td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{b.tipo_dte}</td>
                    <td className="px-3 py-3 text-gray-900 dark:text-white">{receptor}</td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300 font-num">{b.patente_vehiculo ?? '—'}</td>
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap font-num">{fmtMoney(b.total)}</td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{b.metodo_pago}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[b.estado] ?? ''}`}>
                        {b.estado}
                      </span>
                    </td>
                    <td className="px-3 py-3"><DteBadge estado={b.dte_estado} /></td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300 text-xs">{b.vendedor?.name ?? '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <Link to={`/boletas/${b.id}`} title="Ver"
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded">
                          <Eye size={15} />
                        </Link>
                        <button onClick={() => handleDownloadPdf(b.id)} title="PDF"
                          className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded">
                          <Download size={15} />
                        </button>
                        <button onClick={() => handleSendEmail(b)} title="Enviar email"
                          disabled={sendEmailMut.isPending}
                          className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded disabled:opacity-50">
                          <Mail size={15} />
                        </button>
                        <button onClick={() => setAnularTarget(b)} title="Anular"
                          disabled={!canAnular}
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

      {/* Pagination */}
      {(page > 1 || hasNextPage) && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            disabled={page <= 1 || isFetching}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-500">Página {page}</span>
          <button
            disabled={!hasNextPage || isFetching}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Anular modal */}
      {anularTarget && (
        <BoletaAnularModal
          boleta={anularTarget}
          onCancel={() => setAnularTarget(null)}
          onConfirm={(razon) => anularMut.mutate({ id: anularTarget.id, razon })}
          isPending={anularMut.isPending}
          error={anularMut.error ? 'No se pudo anular' : null}
        />
      )}

      {/* Email modal */}
      {emailTarget && (
        <BoletaEmailModal
          boleta={emailTarget}
          onCancel={() => setEmailTarget(null)}
          onConfirm={(email) => sendEmailMut.mutate({ id: emailTarget.id, email })}
          isPending={sendEmailMut.isPending}
          error={sendEmailMut.error ? 'No se pudo enviar' : null}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

