import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import DteBadge from '../components/DteBadge'
import type { NotaDebito } from '../types'

export default function NotasDebito() {
  const [items, setItems] = useState<NotaDebito[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<NotaDebito[]>('/api/dte/notas-debito/').then(r => {
      setItems(r.data)
      setLoading(false)
    })
  }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Notas de Débito</h1>
        <Link
          to="/notas-debito/nueva"
          className="px-4 py-2 text-sm font-semibold bg-brand-500 hover:bg-brand-400 text-gray-900 rounded-xl"
        >
          Nueva ND
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
              {items.map(nd => (
                <tr key={nd.id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="px-4 py-3">
                    <Link to={`/notas-debito/${nd.id}`} className="text-brand-400 hover:underline">
                      ND-{nd.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{nd.fecha}</td>
                  <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{nd.razon}</td>
                  <td className="px-4 py-3 text-right text-gray-200">
                    ${Number(nd.monto_total).toLocaleString('es-CL')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <DteBadge estado={nd.dte_estado} />
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-600 text-sm">
                    Sin notas de débito
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
