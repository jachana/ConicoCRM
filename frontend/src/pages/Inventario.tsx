import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, TrendingUp, TrendingDown } from 'lucide-react'
import { api } from '../lib/api'
import type { MovimientoInventario, MovimientoListOut, Producto, StockBajoItem } from '../types'

const MOTIVO_LABELS: Record<string, string> = {
  conteo_fisico: 'Conteo físico',
  merma: 'Merma',
  correccion: 'Corrección',
  otro: 'Otro',
}

const TIPO_LABELS: Record<string, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
}

function MovimientoIcon({ tipo, signo }: { tipo: string; signo: number }) {
  if (tipo === 'entrada' || (tipo === 'ajuste' && signo === 1))
    return <TrendingUp size={14} className="text-green-500" />
  return <TrendingDown size={14} className="text-red-500" />
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function ReferenciaCelda({ tipo, id }: { tipo: string | null; id: number | null }) {
  if (!tipo || !id) return <span className="text-gray-400">—</span>
  const map: Record<string, string> = {
    orden_compra: `/ordenes-compra/${id}`,
    nota_venta: `/notas-venta/${id}`,
  }
  const href = map[tipo]
  const label = tipo === 'orden_compra' ? `OC #${id}` : tipo === 'nota_venta' ? `NV #${id}` : `${tipo} #${id}`
  if (href) return <a href={href} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">{label}</a>
  return <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
}

export default function Inventario() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'stock' | 'movimientos'>('stock')
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const [ajusteOpen, setAjusteOpen] = useState(false)
  const [ajusteProductoId, setAjusteProductoId] = useState('')
  const [ajusteCantidad, setAjusteCantidad] = useState('1')
  const [ajusteSigno, setAjusteSigno] = useState<1 | -1>(1)
  const [ajusteMotivo, setAjusteMotivo] = useState('conteo_fisico')
  const [ajusteNota, setAjusteNota] = useState('')
  const [ajusteError, setAjusteError] = useState('')

  const { data: productos = [] } = useQuery<Producto[]>({
    queryKey: ['productos', busqueda],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const params = new URLSearchParams()
  if (filtroTipo) params.set('tipo', filtroTipo)
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)
  params.set('page', '1')
  params.set('page_size', '100')

  const { data: movimientos } = useQuery<MovimientoListOut>({
    queryKey: ['movimientos', filtroTipo, fechaDesde, fechaHasta],
    queryFn: () => api.get(`/api/inventario/movimientos?${params}`).then(r => r.data),
    enabled: tab === 'movimientos',
  })

  const { data: stockBajo = [] } = useQuery<StockBajoItem[]>({
    queryKey: ['stock-bajo'],
    queryFn: () => api.get('/api/inventario/stock-bajo').then(r => r.data),
  })

  const ajusteMut = useMutation({
    mutationFn: (payload: object) => api.post('/api/inventario/ajustes', payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['movimientos'] })
      qc.invalidateQueries({ queryKey: ['stock-bajo'] })
      setAjusteOpen(false)
      setAjusteProductoId('')
      setAjusteCantidad('1')
      setAjusteSigno(1)
      setAjusteMotivo('conteo_fisico')
      setAjusteNota('')
      setAjusteError('')
    },
    onError: (e: any) => setAjusteError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  function submitAjuste(e: React.FormEvent) {
    e.preventDefault()
    if (!ajusteProductoId) { setAjusteError('Selecciona un producto'); return }
    ajusteMut.mutate({
      producto_id: parseInt(ajusteProductoId),
      cantidad: parseInt(ajusteCantidad) || 1,
      signo: ajusteSigno,
      motivo: ajusteMotivo,
      nota: ajusteNota || null,
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Inventario</h1>
        <button
          onClick={() => setAjusteOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={16} />
          Ajuste manual
        </button>
      </div>

      {stockBajo.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-300">
            {stockBajo.length} producto{stockBajo.length > 1 ? 's' : ''} con stock crítico
          </span>
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
        {(['stock', 'movimientos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t === 'stock' ? 'Stock actual' : 'Movimientos'}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <div>
          <div className="mb-3">
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-72 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">SKU</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Stock mínimo</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Stock actual</th>
                  <th className="text-center px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {productos.map(p => {
                  const critico = p.stock_actual < p.stock_minimo
                  return (
                    <tr key={p.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{p.nombre}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.sku ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{p.stock_minimo}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${critico ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                        {p.stock_actual}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {critico ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            <AlertTriangle size={10} /> Crítico
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">OK</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'movimientos' && (
        <div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">Todos los tipos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
            </select>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Tipo</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Cantidad</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Referencia</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {(movimientos?.items ?? []).map((m: MovimientoInventario) => (
                  <tr key={m.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtFecha(m.created_at)}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{m.producto?.nombre ?? `#${m.producto_id}`}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                        <MovimientoIcon tipo={m.tipo} signo={m.signo} />
                        {TIPO_LABELS[m.tipo] ?? m.tipo}
                        {m.motivo && <span className="text-gray-400 dark:text-gray-500 text-xs">({MOTIVO_LABELS[m.motivo] ?? m.motivo})</span>}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${m.signo === 1 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {m.signo === 1 ? '+' : '-'}{m.cantidad}
                    </td>
                    <td className="px-4 py-3"><ReferenciaCelda tipo={m.referencia_tipo} id={m.referencia_id} /></td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{m.usuario?.name ?? '—'}</td>
                  </tr>
                ))}
                {!movimientos?.items?.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin movimientos</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {movimientos && movimientos.total > 100 && (
            <p className="mt-2 text-sm text-gray-500">Mostrando 100 de {movimientos.total} movimientos.</p>
          )}
        </div>
      )}

      {ajusteOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">Ajuste manual de stock</h2>
              <button onClick={() => { setAjusteOpen(false); setAjusteError('') }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={submitAjuste} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Producto</label>
                <select
                  value={ajusteProductoId}
                  onChange={e => setAjusteProductoId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">Seleccionar producto...</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.sku ? ` (${p.sku})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de ajuste</label>
                <div className="flex gap-4">
                  {([1, -1] as const).map(s => (
                    <label key={s} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input type="radio" name="signo" value={s} checked={ajusteSigno === s} onChange={() => setAjusteSigno(s)} />
                      {s === 1 ? 'Suma (entrada)' : 'Resta (salida)'}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cantidad</label>
                <input type="number" min="1" value={ajusteCantidad} onChange={e => setAjusteCantidad(e.target.value)} required
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo</label>
                <select value={ajusteMotivo} onChange={e => setAjusteMotivo(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  <option value="conteo_fisico">Conteo físico</option>
                  <option value="merma">Merma</option>
                  <option value="correccion">Corrección</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nota (opcional)</label>
                <textarea value={ajusteNota} onChange={e => setAjusteNota(e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              {ajusteError && <p className="text-red-600 text-sm">{ajusteError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setAjusteOpen(false); setAjusteError('') }}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                  Cancelar
                </button>
                <button type="submit" disabled={ajusteMut.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                  {ajusteMut.isPending ? 'Guardando...' : 'Guardar ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
