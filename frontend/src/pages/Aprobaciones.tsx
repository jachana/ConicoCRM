// frontend/src/pages/Aprobaciones.tsx
import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'

interface CreditAprobacion {
  tipo: 'credito'
  id: number
  vendedor: { id: number; name: string; email: string } | null
  empresa: { id: number; nombre: string } | null
  total: number
  nota: string | null
  estado: string
  cotizacion_id: number | null
  nv_id: number | null
  created_at: string
}

interface LineaPropuesta {
  linea_id: number
  descripcion: string
  valor_neto_actual: number
  margen_actual: number | null
  valor_neto_propuesto: number
  margen_propuesto: number
}

interface MargenAprobacion {
  tipo: 'margen'
  id: number
  vendedor: { id: number; name: string; email: string } | null
  cotizacion_id: number | null
  nota: string | null
  estado: string
  lineas_propuestas: LineaPropuesta[]
  created_at: string
}

type AnyAprobacion = CreditAprobacion | MargenAprobacion

const fmtMoney = (n: number) => `$ ${Math.round(n).toLocaleString('es-CL')}`
const fmtFecha = (s: string) => s.split('T')[0]
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`

export default function Aprobaciones() {
  const user = useAuthStore(s => s.user)
  const isAdminUser = !!user && (user.role === 'admin' || user.role === 'subadmin')
  const queryClient = useQueryClient()
  const [actingKey, setActingKey] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: creditos = [], isLoading: loadingCredito } = useQuery<CreditAprobacion[]>({
    queryKey: ['aprobaciones-credito-pendientes'],
    queryFn: () =>
      api.get('/api/aprobaciones/?estado=pendiente').then(r =>
        r.data.map((a: any) => ({ ...a, tipo: 'credito' }))
      ),
    enabled: isAdminUser,
  })

  const { data: margenes = [], isLoading: loadingMargen } = useQuery<MargenAprobacion[]>({
    queryKey: ['aprobaciones-margen-pendientes'],
    queryFn: () =>
      api.get('/api/aprobaciones_margen/?estado=pendiente').then(r =>
        r.data.map((a: any) => ({ ...a, tipo: 'margen' }))
      ),
    enabled: isAdminUser,
  })

  const isLoading = loadingCredito || loadingMargen

  const all: AnyAprobacion[] = [...creditos, ...margenes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const creditMutation = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'aprobar' | 'denegar' }) =>
      api.patch(`/api/aprobaciones/${id}`, { accion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aprobaciones-credito-pendientes'] })
      setActingKey(null)
    },
    onError: () => setActingKey(null),
  })

  const margenMutation = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'aprobar' | 'denegar' }) =>
      api.patch(`/api/aprobaciones_margen/${id}`, { accion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aprobaciones-margen-pendientes'] })
      setActingKey(null)
    },
    onError: () => setActingKey(null),
  })

  function handleAccion(a: AnyAprobacion, accion: 'aprobar' | 'denegar') {
    const key = `${a.tipo}-${a.id}`
    setActingKey(key)
    if (a.tipo === 'credito') creditMutation.mutate({ id: a.id, accion })
    else margenMutation.mutate({ id: a.id, accion })
  }

  if (!isAdminUser) return <Navigate to="/" replace />

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Aprobaciones</h1>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Cargando...</div>
        ) : all.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No hay solicitudes pendientes.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Vendedor</th>
                <th className="px-4 py-3 text-left">Empresa / Cotización</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Nota</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {all.map(a => {
                const key = `${a.tipo}-${a.id}`
                const isExpanded = expanded === key
                const acting = actingKey === key
                return (
                  <React.Fragment key={key}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          a.tipo === 'credito'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        }`}>
                          {a.tipo === 'credito' ? 'Crédito' : 'Margen'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {a.vendedor?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {a.tipo === 'credito'
                          ? (a.empresa?.nombre ?? '—')
                          : `COT-${String(a.cotizacion_id ?? '').padStart(5, '0')}`}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-medium">
                        {a.tipo === 'credito' ? fmtMoney(a.total) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {a.nota ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {fmtFecha(a.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {a.tipo === 'margen' && (
                            <button
                              onClick={() => setExpanded(isExpanded ? null : key)}
                              className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                              title="Ver detalle"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          )}
                          <button
                            onClick={() => handleAccion(a, 'aprobar')}
                            disabled={acting}
                            className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => handleAccion(a, 'denegar')}
                            disabled={acting}
                            className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                          >
                            Denegar
                          </button>
                        </div>
                      </td>
                    </tr>
                    {a.tipo === 'margen' && isExpanded && (
                      <tr key={`${key}-detail`} className="bg-blue-50/50 dark:bg-blue-900/10">
                        <td colSpan={7} className="px-6 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                <th className="pb-1.5 text-left font-medium">Producto</th>
                                <th className="pb-1.5 text-right font-medium">Precio actual</th>
                                <th className="pb-1.5 text-right font-medium">Margen actual</th>
                                <th className="pb-1.5 text-right font-medium">Precio propuesto</th>
                                <th className="pb-1.5 text-right font-medium">Margen prop.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {a.lineas_propuestas.map((lp, i) => (
                                <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                                  <td className="py-1.5 text-gray-700 dark:text-gray-300">{lp.descripcion}</td>
                                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{fmtMoney(lp.valor_neto_actual)}</td>
                                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                                    {lp.margen_actual != null ? fmtPct(lp.margen_actual) : '—'}
                                  </td>
                                  <td className="py-1.5 text-right font-medium text-blue-700 dark:text-blue-300">{fmtMoney(lp.valor_neto_propuesto)}</td>
                                  <td className="py-1.5 text-right font-medium text-blue-700 dark:text-blue-300">{fmtPct(lp.margen_propuesto)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
