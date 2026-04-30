// frontend/src/pages/Aprobaciones.tsx
import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'
import {
  Badge, Button, Card, EmptyState, Skeleton, Tooltip,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

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

interface LineaDescuentoPropuesta {
  linea_id: number
  descripcion: string
  descuento_actual: number
  descuento_propuesto: number
}

interface DescuentoSolicitud {
  tipo: 'descuento'
  id: number
  vendedor: { id: number; name: string; email: string } | null
  cotizacion_id: number | null
  nota: string | null
  estado: string
  lineas_propuestas: LineaDescuentoPropuesta[]
  created_at: string
}

type AnyAprobacion = CreditAprobacion | MargenAprobacion | DescuentoSolicitud

interface TerminoPendiente {
  id: number
  numero: number
  terminos_pago: string | null
  empresa?: { id: number; nombre: string } | null
  vendedor?: { id: number; name: string; email: string } | null
}

const fmtMoney = (n: number) => `$ ${Math.round(n).toLocaleString('es-CL')}`
const fmtFecha = (s: string) => s.split('T')[0]
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`

export default function Aprobaciones() {
  const user = useAuthStore(s => s.user)
  const { role: effectiveRole } = useEffectivePermissions()
  const role = effectiveRole ?? user?.role
  const isAdminUser = !!user && (role === 'admin' || role === 'subadmin')
  const queryClient = useQueryClient()
  const [actingKey, setActingKey] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: creditos = [], isLoading: loadingCredito } = useQuery<CreditAprobacion[]>({
    queryKey: ['aprobaciones-credito-pendientes'],
    queryFn: () =>
      api.get('/api/aprobaciones/?estado=pendiente').then(r =>
        (r.data as Omit<CreditAprobacion, 'tipo'>[]).map(a => ({ ...a, tipo: 'credito' as const }))
      ),
    enabled: isAdminUser,
  })

  const { data: margenes = [], isLoading: loadingMargen } = useQuery<MargenAprobacion[]>({
    queryKey: ['aprobaciones-margen-pendientes'],
    queryFn: () =>
      api.get('/api/aprobaciones_margen/?estado=pendiente').then(r =>
        (r.data as Omit<MargenAprobacion, 'tipo'>[]).map(a => ({ ...a, tipo: 'margen' as const }))
      ),
    enabled: isAdminUser,
  })

  const { data: descuentos = [], isLoading: loadingDescuento } = useQuery<DescuentoSolicitud[]>({
    queryKey: ['solicitudes-descuento-pendientes'],
    queryFn: () =>
      api.get('/api/solicitudes-descuento/?estado=pendiente').then(r =>
        (r.data as Omit<DescuentoSolicitud, 'tipo'>[]).map(a => ({ ...a, tipo: 'descuento' as const }))
      ),
    enabled: isAdminUser,
  })

  const { data: terminosPendientes = [] } = useQuery<TerminoPendiente[]>({
    queryKey: ['cotizaciones-terminos-pendientes'],
    queryFn: () =>
      api.get('/api/cotizaciones/?terminos_pago_estado=pendiente').then(r => r.data),
    enabled: isAdminUser,
  })

  const isLoading = loadingCredito || loadingMargen || loadingDescuento

  const all: AnyAprobacion[] = [...creditos, ...margenes, ...descuentos].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const creditMutation = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'aprobar' | 'denegar' }) =>
      api.patch(`/api/aprobaciones/${id}`, { accion }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['aprobaciones-credito-pendientes'] })
      setActingKey(null)
      toast.success(vars.accion === 'aprobar' ? 'Aprobado' : 'Denegado')
    },
    onError: () => {
      setActingKey(null)
      toast.error('Error al procesar')
    },
  })

  const margenMutation = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'aprobar' | 'denegar' }) =>
      api.patch(`/api/aprobaciones_margen/${id}`, { accion }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['aprobaciones-margen-pendientes'] })
      setActingKey(null)
      toast.success(vars.accion === 'aprobar' ? 'Aprobado' : 'Denegado')
    },
    onError: () => {
      setActingKey(null)
      toast.error('Error al procesar')
    },
  })

  const descuentoMutation = useMutation({
    mutationFn: ({ id, accion, comentario }: { id: number; accion: 'aprobar' | 'rechazar'; comentario?: string }) =>
      api.patch(`/api/solicitudes-descuento/${id}`, { accion, comentario }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes-descuento-pendientes'] })
      setActingKey(null)
      toast.success(vars.accion === 'aprobar' ? 'Aprobado' : 'Rechazado')
    },
    onError: () => {
      setActingKey(null)
      toast.error('Error al procesar')
    },
  })

  const terminosMutation = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'aprobado' | 'rechazado' }) =>
      api.patch(`/api/cotizaciones/${id}`, { terminos_pago_estado: accion }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones-terminos-pendientes'] })
      setActingKey(null)
      toast.success(vars.accion === 'aprobado' ? 'Aprobado' : 'Rechazado')
    },
    onError: () => {
      setActingKey(null)
      toast.error('Error al procesar')
    },
  })

  function handleAccion(a: AnyAprobacion, accion: 'aprobar' | 'denegar') {
    const key = `${a.tipo}-${a.id}`
    setActingKey(key)
    if (a.tipo === 'credito') creditMutation.mutate({ id: a.id, accion })
    else if (a.tipo === 'margen') margenMutation.mutate({ id: a.id, accion })
    else descuentoMutation.mutate({
      id: a.id,
      accion: accion === 'aprobar' ? 'aprobar' : 'rechazar',
    })
  }

  if (!isAdminUser) return <Navigate to="/" replace />

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Aprobaciones</h1>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
          </div>
        ) : all.length === 0 ? (
          <EmptyState icon={<Inbox />} title="No hay solicitudes pendientes" />
        ) : (
          <Table density="compact">
            <THead>
              <TR>
                <TH>Tipo</TH>
                <TH>Vendedor</TH>
                <TH>Empresa / Cotización</TH>
                <TH className="text-right">Total</TH>
                <TH>Nota</TH>
                <TH>Fecha</TH>
                <TH>Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {all.map(a => {
                const key = `${a.tipo}-${a.id}`
                const isExpanded = expanded === key
                const acting = actingKey === key
                return (
                  <React.Fragment key={key}>
                    <TR>
                      <TD>
                        {a.tipo === 'credito' ? (
                          <Badge variant="warning">Crédito</Badge>
                        ) : a.tipo === 'margen' ? (
                          <Badge variant="info">Margen</Badge>
                        ) : (
                          <Badge variant="warning">Descuento</Badge>
                        )}
                      </TD>
                      <TD>{a.vendedor?.name ?? <span className="text-gray-400">—</span>}</TD>
                      <TD>
                        {a.tipo === 'credito'
                          ? (a.empresa?.nombre ?? '—')
                          : `COT-${String(a.cotizacion_id ?? '').padStart(5, '0')}`}
                      </TD>
                      <TD className="text-right font-medium text-gray-900 dark:text-white font-num">
                        {a.tipo === 'credito' ? fmtMoney(a.total) : '—'}
                      </TD>
                      <TD className="text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {a.nota ?? '—'}
                      </TD>
                      <TD className="text-gray-500 dark:text-gray-400 font-num whitespace-nowrap">
                        {fmtFecha(a.created_at)}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          {(a.tipo === 'margen' || a.tipo === 'descuento') && (
                            <Tooltip label={isExpanded ? 'Ocultar detalle' : 'Ver detalle'}>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => setExpanded(isExpanded ? null : key)}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </Button>
                            </Tooltip>
                          )}
                          <Button
                            variant="success"
                            size="sm"
                            disabled={acting}
                            onClick={() => handleAccion(a, 'aprobar')}
                          >
                            Aprobar
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={acting}
                            onClick={() => handleAccion(a, 'denegar')}
                          >
                            {a.tipo === 'descuento' ? 'Rechazar' : 'Denegar'}
                          </Button>
                        </div>
                      </TD>
                    </TR>
                    {a.tipo === 'descuento' && isExpanded && (
                      <TR key={`${key}-detail`} className="bg-warning-50/50 dark:bg-warning-500/10">
                        <TD colSpan={7} className="px-6 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                <th className="pb-1.5 text-left font-medium">Producto</th>
                                <th className="pb-1.5 text-right font-medium">Descuento actual</th>
                                <th className="pb-1.5 text-right font-medium">Descuento propuesto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {a.lineas_propuestas.map((lp, i) => (
                                <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                                  <td className="py-1.5 text-gray-700 dark:text-gray-300">{lp.descripcion}</td>
                                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400 font-num">{lp.descuento_actual}%</td>
                                  <td className="py-1.5 text-right font-medium text-warning-700 dark:text-warning-300 font-num">{lp.descuento_propuesto}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TD>
                      </TR>
                    )}
                    {a.tipo === 'margen' && isExpanded && (
                      <TR key={`${key}-detail`} className="bg-info-50/50 dark:bg-info-500/10">
                        <TD colSpan={7} className="px-6 py-3">
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
                                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400 font-num">{fmtMoney(lp.valor_neto_actual)}</td>
                                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400 font-num">
                                    {lp.margen_actual != null ? fmtPct(lp.margen_actual) : '—'}
                                  </td>
                                  <td className="py-1.5 text-right font-medium text-info-700 dark:text-info-300 font-num">{fmtMoney(lp.valor_neto_propuesto)}</td>
                                  <td className="py-1.5 text-right font-medium text-info-700 dark:text-info-300 font-num">{fmtPct(lp.margen_propuesto)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TD>
                      </TR>
                    )}
                  </React.Fragment>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {terminosPendientes.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Términos de Pago — Pendientes ({terminosPendientes.length})
          </h2>
          <div className="space-y-3">
            {terminosPendientes.map(cot => {
              const key = `terminos-${cot.id}`
              const acting = actingKey === key
              return (
                <Card key={cot.id} padded className="border-warning-500/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        COT-{String(cot.numero).padStart(5, '0')}
                        {cot.empresa && <span className="ml-2 text-gray-500 font-normal">— {cot.empresa.nombre}</span>}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Términos solicitados: <strong className="text-warning-700 dark:text-warning-400">{cot.terminos_pago}</strong>
                      </div>
                      {cot.vendedor && (
                        <div className="text-xs text-gray-400 mt-0.5">Vendedor: {cot.vendedor.name}</div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="success"
                        size="sm"
                        disabled={acting}
                        onClick={() => {
                          setActingKey(key)
                          terminosMutation.mutate({ id: cot.id, accion: 'aprobado' })
                        }}
                      >
                        Aprobar
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={acting}
                        onClick={() => {
                          setActingKey(key)
                          terminosMutation.mutate({ id: cot.id, accion: 'rechazado' })
                        }}
                      >
                        Rechazar
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
