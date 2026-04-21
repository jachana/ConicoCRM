import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { CobranzaDashboard, RecordatorioItem, Factura, ImportXMLResult } from '../types'

type Tab = 'dashboard' | 'facturas' | 'recordatorios'

const fmt = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

const fmtDate = (s: string | null) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('es-CL') : '—'

export default function Cobranza() {
  const [tab, setTab] = useState<Tab>('dashboard')

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Cobranza</h1>
      <div className="flex gap-0 border-b mb-6">
        <button className={tabClass('dashboard')} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button className={tabClass('facturas')} onClick={() => setTab('facturas')}>Facturas</button>
        <button className={tabClass('recordatorios')} onClick={() => setTab('recordatorios')}>Recordatorios</button>
      </div>
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'facturas' && <FacturasTab />}
      {tab === 'recordatorios' && <RecordatoriosTab />}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardTab() {
  const { data, isLoading, error } = useQuery<CobranzaDashboard>({
    queryKey: ['cobranza-dashboard'],
    queryFn: () => api.get('/api/cobranza/dashboard').then(r => r.data),
  })

  if (isLoading) return <p className="text-gray-500">Cargando…</p>
  if (error || !data) return <p className="text-red-600">Error al cargar dashboard</p>

  const aging = data.aging
  const agingRows = [
    { label: '0 – 30 días', ...aging.d_0_30 },
    { label: '31 – 60 días', ...aging.d_31_60 },
    { label: '61 – 90 días', ...aging.d_61_90 },
    { label: '90+ días', ...aging.d_90_plus },
  ]

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card label="Total por cobrar" value={fmt(data.total_por_cobrar)} color="blue" />
        <Card label="Total vencido" value={fmt(data.total_vencido)} color="red" />
        <Card label="Próximas a vencer (≤7 días)" value={fmt(data.proximas_a_vencer)} color="yellow" />
      </div>

      {/* Aging */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Aging</h2>
        <table className="w-full text-sm border dark:border-gray-700 rounded overflow-hidden">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left p-3 font-medium dark:text-gray-300">Período</th>
              <th className="text-right p-3 font-medium dark:text-gray-300">Cantidad</th>
              <th className="text-right p-3 font-medium dark:text-gray-300">Monto</th>
            </tr>
          </thead>
          <tbody>
            {agingRows.map(r => (
              <tr key={r.label} className="border-t dark:border-gray-700 dark:text-gray-300">
                <td className="p-3">{r.label}</td>
                <td className="p-3 text-right">{r.count}</td>
                <td className="p-3 text-right">{fmt(r.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Por empresa */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Por empresa</h2>
        <table className="w-full text-sm border dark:border-gray-700 rounded overflow-hidden">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left p-3 font-medium dark:text-gray-300">Empresa</th>
              <th className="text-right p-3 font-medium dark:text-gray-300">Total pendiente</th>
              <th className="text-right p-3 font-medium dark:text-gray-300">Vencido</th>
            </tr>
          </thead>
          <tbody>
            {data.por_empresa.map(e => (
              <tr key={e.empresa_id} className="border-t dark:border-gray-700 dark:text-gray-300">
                <td className="p-3">{e.empresa_nombre}</td>
                <td className="p-3 text-right">{fmt(e.total)}</td>
                <td className="p-3 text-right text-red-600 dark:text-red-400">{fmt(e.vencido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string; color: 'blue' | 'red' | 'yellow' }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300',
    red: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-950/40 dark:border-yellow-800 dark:text-yellow-300',
  }
  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

// ─── Facturas ─────────────────────────────────────────────────────────────────

function FacturasTab() {
  const [estado, setEstado] = useState('')
  const [showImport, setShowImport] = useState(false)

  const { data: facturas = [], isLoading } = useQuery<Factura[]>({
    queryKey: ['cobranza-facturas', estado],
    queryFn: () =>
      api.get('/api/facturas/', { params: estado ? { estado } : {} }).then(r => r.data),
  })

  const ESTADO_COLORS: Record<string, string> = {
    emitida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    pagada: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    anulada: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <select
            className="border rounded px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
            value={estado}
            onChange={e => setEstado(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="emitida">Emitida</option>
            <option value="parcial">Parcial</option>
            <option value="pagada">Pagada</option>
            <option value="anulada">Anulada</option>
          </select>
        </div>
        <button
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
          onClick={() => setShowImport(true)}
        >
          Importar XML
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Cargando…</p>
      ) : (
        <table className="w-full text-sm border dark:border-gray-700 rounded overflow-hidden">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">N°</th>
              <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Fecha</th>
              <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Vencimiento</th>
              <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Empresa</th>
              <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Estado</th>
              <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Origen</th>
              <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400">Total</th>
            </tr>
          </thead>
          <tbody>
            {facturas.map(f => (
              <tr key={f.id} className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="p-3 text-gray-900 dark:text-white">{f.numero.toString().padStart(5, '0')}</td>
                <td className="p-3 text-gray-900 dark:text-white">{fmtDate(f.fecha)}</td>
                <td className="p-3 text-gray-900 dark:text-white">{fmtDate(f.fecha_vencimiento)}</td>
                <td className="p-3 text-gray-900 dark:text-white">{f.empresa?.nombre ?? '—'}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[f.estado] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                    {f.estado}
                  </span>
                </td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {f.origen}
                  </span>
                </td>
                <td className="p-3 text-right text-gray-900 dark:text-white">{fmt(f.total)}</td>
              </tr>
            ))}
            {facturas.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-400 text-sm">
                  No hay facturas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ImportXMLResult | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (inputRef.current && e.dataTransfer.files.length > 0) {
      const dt = new DataTransfer()
      Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f))
      inputRef.current.files = dt.files
    }
  }

  const handleUpload = async () => {
    const files = inputRef.current?.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const form = new FormData()
      Array.from(files).forEach(f => form.append('files', f))
      const r = await api.post('/api/facturas/import/xml/bulk', form)
      setResult(r.data)
      qc.invalidateQueries({ queryKey: ['cobranza-facturas'] })
      qc.invalidateQueries({ queryKey: ['cobranza-dashboard'] })
    } catch (e: any) {
      setResult({ creadas: 0, actualizadas: 0, errores: [{ filename: 'upload', message: e.message }] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Importar XML DTE</h2>

        {!result ? (
          <>
            <div
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 mb-4"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <p className="text-gray-500 dark:text-gray-400 text-sm">Arrastra archivos XML aquí o haz clic para seleccionar</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Se pueden seleccionar múltiples archivos</p>
            </div>
            <input ref={inputRef} type="file" accept=".xml" multiple className="hidden" />
            <div className="flex justify-end gap-2">
              <button className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" onClick={onClose}>
                Cancelar
              </button>
              <button
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              <p className="text-sm text-green-700">✓ {result.creadas} creadas, {result.actualizadas} actualizadas</p>
              {result.errores.length > 0 && (
                <div>
                  <p className="text-sm text-red-600 font-medium">{result.errores.length} error(es):</p>
                  {result.errores.map((e, i) => (
                    <div key={i} className="text-xs text-red-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{e.filename}: {e.message}</span>
                      {e.empresa_data && (
                        <Link
                          to={`/empresas?create=true&rut=${encodeURIComponent(e.empresa_data.rut)}&nombre=${encodeURIComponent(e.empresa_data.nombre)}&email=${encodeURIComponent(e.empresa_data.email)}`}
                          className="text-blue-500 underline whitespace-nowrap hover:text-blue-400"
                        >
                          Crear empresa →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Recordatorios ────────────────────────────────────────────────────────────

function RecordatoriosTab() {
  const qc = useQueryClient()
  const [modalItem, setModalItem] = useState<RecordatorioItem | null>(null)

  const { data: items = [], isLoading } = useQuery<RecordatorioItem[]>({
    queryKey: ['cobranza-recordatorios'],
    queryFn: () => api.get('/api/cobranza/recordatorios').then(r => r.data),
  })

  const enviarMut = useMutation({
    mutationFn: ({ id, to, subject, body }: { id: number; to: string; subject: string; body: string }) =>
      api.post(`/api/facturas/${id}/recordatorio`, { to, subject, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobranza-recordatorios'] })
      setModalItem(null)
    },
  })

  if (isLoading) return <p className="text-gray-500 text-sm">Cargando…</p>

  if (items.length === 0)
    return <p className="text-gray-500 text-sm">No hay facturas pendientes de recordatorio.</p>

  return (
    <div>
      <table className="w-full text-sm border dark:border-gray-700 rounded overflow-hidden">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">N°</th>
            <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Empresa</th>
            <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400">Saldo</th>
            <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400">Días vencida</th>
            <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Último recordatorio</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="p-3 text-gray-900 dark:text-white">{item.numero.toString().padStart(5, '0')}</td>
              <td className="p-3 text-gray-900 dark:text-white">{item.empresa_nombre ?? item.cliente_nombre ?? '—'}</td>
              <td className="p-3 text-right text-gray-900 dark:text-white">{fmt(item.saldo)}</td>
              <td className="p-3 text-right text-red-600 dark:text-red-400 font-medium">{item.dias_vencida}</td>
              <td className="p-3 text-gray-900 dark:text-white">{item.ultimo_recordatorio ? fmtDate(item.ultimo_recordatorio) : 'Nunca'}</td>
              <td className="p-3 text-right">
                <button
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => setModalItem(item)}
                >
                  Enviar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modalItem && (
        <RecordatorioModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onSend={(to, subject, body) =>
            enviarMut.mutate({ id: modalItem.id, to, subject, body })
          }
          sending={enviarMut.isPending}
          error={enviarMut.error ? String(enviarMut.error) : null}
        />
      )}
    </div>
  )
}

function RecordatorioModal({
  item,
  onClose,
  onSend,
  sending,
  error,
}: {
  item: RecordatorioItem
  onClose: () => void
  onSend: (to: string, subject: string, body: string) => void
  sending: boolean
  error: string | null
}) {
  const numStr = item.numero.toString().padStart(5, '0')
  const [to, setTo] = useState(item.correo_enviar ?? '')
  const [subject, setSubject] = useState(`Recordatorio de pago — Factura N°${numStr}`)
  const [body, setBody] = useState(
    `Estimado/a ${item.empresa_nombre ?? item.cliente_nombre ?? 'cliente'},\n\n` +
    `Le recordamos que la factura N°${numStr} por un monto de $${Math.round(item.total).toLocaleString('es-CL')} ` +
    `con fecha de vencimiento ${item.fecha_vencimiento ? fmtDate(item.fecha_vencimiento) : 'no especificada'} ` +
    `se encuentra pendiente de pago.\n\n` +
    `Han transcurrido ${item.dias_vencida} día(s) desde su vencimiento.\n\n` +
    `Le rogamos proceder con el pago a la brevedad posible.\n\n` +
    `Saludos,\nConico`
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Enviar recordatorio — Factura N°{numStr}</h2>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Para</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Asunto</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mensaje</label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm h-40 resize-none dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            onClick={() => onSend(to, subject, body)}
            disabled={sending || !to}
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
