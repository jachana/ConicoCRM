import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import DteBadge from '../components/DteBadge'
import type { NotaCredito } from '../types'

export default function NotasCredito() {
  const [items, setItems] = useState<NotaCredito[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<NotaCredito[]>('/api/dte/notas-credito/').then(r => {
      setItems(r.data)
      setLoading(false)
    })
  }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Notas de Crédito</h1>
        <Link
          to="/notas-credito/nueva"
          className="px-4 py-2 text-sm font-semibold bg-brand-500 hover:bg-brand-400 text-gray-900 rounded-xl"
        >
          Nueva NC
        </Link>
      </div>
      {loading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : (
        <div className="bg-[#111827] border border-white/8 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-gray-500 text-[11px] uppercase tracking-wider">
                <th className="px-4 py-3 text-left">N°</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Razón</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">DTE</th>
              </tr>
            </thead>
            <tbody>
              {items.map(nc => (
                <tr key={nc.id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="px-4 py-3">
                    <Link to={`/notas-credito/${nc.id}`} className="text-brand-400 hover:underline">
                      NC-{nc.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{nc.fecha}</td>
                  <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{nc.razon}</td>
                  <td className="px-4 py-3 text-right text-gray-200">
                    ${Number(nc.monto_total).toLocaleString('es-CL')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <DteBadge estado={nc.dte_estado} />
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-600 text-sm">
                    Sin notas de crédito
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
