import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import DteBadge from '../components/DteBadge'
import type { NotaDebito } from '../types'

export default function NotaDebitoDetalle() {
  const { id } = useParams<{ id: string }>()
  const [nd, setNd] = useState<NotaDebito | null>(null)
  const [emitiendo, setEmitiendo] = useState(false)
  const [emitirOpen, setEmitirOpen] = useState(false)

  useEffect(() => {
    api.get<NotaDebito>(`/api/dte/notas-debito/${id}`).then(r => setNd(r.data))
  }, [id])

  async function handleEmitir() {
    setEmitiendo(true)
    try {
      await api.post(`/api/dte/notas-debito/${id}/emitir`)
      setEmitirOpen(false)
      const r = await api.get<NotaDebito>(`/api/dte/notas-debito/${id}`)
      setNd(r.data)
    } catch {
      alert('Error al emitir. Intente de nuevo.')
    } finally {
      setEmitiendo(false)
    }
  }

  if (!nd) return <div className="p-6 text-gray-500 text-sm">Cargando...</div>

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-white">ND-{nd.numero}</h1>
        <DteBadge estado={nd.dte_estado} />
        {nd.dte_estado === 'no_emitida' && (
          <button
            onClick={() => setEmitirOpen(true)}
            className="px-3 py-1.5 text-xs font-medium bg-brand-500 hover:bg-brand-400 text-gray-900 rounded-lg"
          >
            Emitir DTE
          </button>
        )}
      </div>

      <div className="bg-[#111827] border border-white/8 rounded-2xl p-5 mb-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Fecha</span><span className="text-gray-200">{nd.fecha}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Razón</span><span className="text-gray-200">{nd.razon}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Neto</span><span className="text-gray-200">${Number(nd.monto_neto).toLocaleString('es-CL')}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">IVA</span><span className="text-gray-200">${Number(nd.monto_iva).toLocaleString('es-CL')}</span></div>
        <div className="flex justify-between font-semibold"><span className="text-gray-400">Total</span><span className="text-white">${Number(nd.monto_total).toLocaleString('es-CL')}</span></div>
      </div>

      <div className="bg-[#111827] border border-white/8 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 text-gray-500 text-[11px] uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Descripción</th>
              <th className="px-4 py-3 text-right">Cant.</th>
              <th className="px-4 py-3 text-right">P. Unit.</th>
              <th className="px-4 py-3 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {nd.lineas.map(l => (
              <tr key={l.id} className="border-b border-white/5">
                <td className="px-4 py-2 text-gray-300">{l.descripcion}</td>
                <td className="px-4 py-2 text-right text-gray-400">{l.cantidad}</td>
                <td className="px-4 py-2 text-right text-gray-400">${Number(l.precio_unitario).toLocaleString('es-CL')}</td>
                <td className="px-4 py-2 text-right text-gray-200">${Number(l.subtotal).toLocaleString('es-CL')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {emitirOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-semibold mb-2">¿Emitir Nota de Débito?</h3>
            <p className="text-gray-400 text-sm mb-4">Total: ${Number(nd.monto_total).toLocaleString('es-CL')}</p>
            <div className="flex gap-3">
              <button onClick={() => setEmitirOpen(false)} className="flex-1 py-2 text-sm text-gray-400 border border-white/10 rounded-lg">Cancelar</button>
              <button onClick={handleEmitir} disabled={emitiendo} className="flex-1 py-2 text-sm font-semibold bg-brand-500 hover:bg-brand-400 text-gray-900 rounded-lg disabled:opacity-50">
                {emitiendo ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
