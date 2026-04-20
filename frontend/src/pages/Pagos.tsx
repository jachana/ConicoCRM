import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, X, Check, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { Pago, Factura } from '../types'

const METODOS_PAGO = ['efectivo', 'transferencia', 'cheque', 'debito', 'credito', 'deposito']

function fmtMoney(n: number | string | null | undefined) {
  return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`
}

export default function Pagos() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'subadmin'

  const [showModal, setShowModal] = useState(false)
  const [facturaId, setFacturaId] = useState<number | ''>('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('transferencia')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const { data: pagos = [], isLoading } = useQuery<Pago[]>({
    queryKey: ['pagos'],
    queryFn: () => api.get('/api/pagos/').then(r => r.data),
  })

  const { data: facturas = [] } = useQuery<Factura[]>({
    queryKey: ['facturas'],
    queryFn: () => api.get('/api/facturas/').then(r => r.data),
    enabled: showModal,
  })

  const facturasDisponibles = facturas.filter(f => f.estado !== 'anulada' && f.estado !== 'pagada')
  const facturaSeleccionada = facturaId ? facturas.find(f => f.id === facturaId) : null
  const saldo = facturaSeleccionada
    ? Number(facturaSeleccionada.total) - Number(facturaSeleccionada.monto_pagado ?? 0)
    : null

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/api/pagos/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pagos'] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      setShowModal(false)
      resetModal()
      setToast({ msg: 'Pago registrado correctamente', ok: true })
      setTimeout(() => setToast(null), 3500)
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Error al registrar pago'),
  })

  const deleteMut = useMutation({
    mutationFn: (pagoId: number) => api.delete(`/api/pagos/${pagoId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pagos'] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      setToast({ msg: 'Abono eliminado', ok: true })
      setTimeout(() => setToast(null), 3000)
    },
    onError: (err: any) => {
      setToast({ msg: err?.response?.data?.detail || 'Error al eliminar', ok: false })
      setTimeout(() => setToast(null), 4000)
    },
  })

  function resetModal() {
    setFacturaId('')
    setFecha(new Date().toISOString().split('T')[0])
    setMonto('')
    setMetodo('transferencia')
    setNota('')
    setError('')
  }

  const totalPagos = pagos.reduce((s, p) => s + Number(p.monto), 0)

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Pagos</h1>
          {pagos.length > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {pagos.length} abono{pagos.length !== 1 ? 's' : ''} · Total: {fmtMoney(totalPagos)}
            </p>
          )}
        </div>
        <button
          onClick={() => { resetModal(); setShowModal(true) }}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-brand-500 hover:bg-brand-400 text-gray-900 rounded-lg font-medium transition-colors"
        >
          <Plus size={15} />
          Registrar abono
        </button>
      </div>

      {/* Mobile cards */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : pagos.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <p className="text-gray-400 dark:text-gray-500 text-sm">Sin pagos registrados aún</p>
          <button
            onClick={() => { resetModal(); setShowModal(true) }}
            className="mt-3 text-sm text-brand-400 hover:text-brand-300 transition-colors"
          >
            Registrar primer abono →
          </button>
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {pagos.map(p => (
              <div key={p.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => navigate(`/facturas/${p.factura_id}`)}
                        className="text-sm font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1"
                      >
                        FAC-{String(p.factura?.numero ?? p.factura_id).padStart(5, '0')}
                        <ExternalLink size={11} />
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{p.fecha}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900 dark:text-white">{fmtMoney(p.monto)}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 capitalize bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                        {p.metodo_pago}
                      </span>
                    </div>
                    {p.nota && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{p.nota}</p>}
                    {p.registrado_por && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">por {p.registrado_por.name}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => { if (window.confirm('¿Eliminar este abono?')) deleteMut.mutate(p.id) }}
                      className="p-1.5 text-red-400 hover:text-red-500 rounded-lg transition-colors flex-shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium text-left">Factura</th>
                  <th className="px-4 py-3 font-medium text-left">Fecha</th>
                  <th className="px-4 py-3 font-medium text-right">Monto</th>
                  <th className="px-4 py-3 font-medium text-left">Método</th>
                  <th className="px-4 py-3 font-medium text-left">Nota</th>
                  <th className="px-4 py-3 font-medium text-left">Registrado por</th>
                  {isAdmin && <th className="px-4 py-3 w-12" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pagos.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/facturas/${p.factura_id}`)}
                        className="text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1"
                      >
                        FAC-{String(p.factura?.numero ?? p.factura_id).padStart(5, '0')}
                        <ExternalLink size={11} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{p.fecha}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{fmtMoney(p.monto)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs capitalize bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                        {p.metodo_pago}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[200px] truncate">{p.nota ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{p.registrado_por?.name ?? '—'}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { if (window.confirm('¿Eliminar este abono?')) deleteMut.mutate(p.id) }}
                          className="p-1 text-red-400 hover:text-red-600 rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-5 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Registrar abono</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
                <X size={16} />
              </button>
            </div>
            {error && (
              <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Factura</label>
                <select
                  value={facturaId}
                  onChange={e => setFacturaId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Seleccionar factura...</option>
                  {facturasDisponibles.map(f => (
                    <option key={f.id} value={f.id}>
                      FAC-{String(f.numero).padStart(5, '0')} · {f.cliente?.nombre} · {fmtMoney(f.total)}
                    </option>
                  ))}
                </select>
                {saldo !== null && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Saldo pendiente: <span className="font-medium text-amber-600 dark:text-amber-400">{fmtMoney(saldo)}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Monto</label>
                <input type="number" min="1" step="1" value={monto} onChange={e => setMonto(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Método de pago</label>
                <select value={metodo} onChange={e => setMetodo(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                  {METODOS_PAGO.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nota (opcional)</label>
                <input type="text" value={nota} onChange={e => setNota(e.target.value)}
                  placeholder="Referencia, número de transferencia..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button
                disabled={!facturaId || !monto || createMut.isPending}
                onClick={() => createMut.mutate({ factura_id: Number(facturaId), fecha, monto: Number(monto), metodo_pago: metodo, nota: nota || null })}
                className="flex-1 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-gray-900 rounded-lg transition-colors font-medium flex items-center justify-center gap-1.5">
                <Check size={14} />
                {createMut.isPending ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-20 md:bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
