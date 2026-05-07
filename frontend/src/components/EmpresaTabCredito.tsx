import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Badge, Card, CardContent, EmptyState, Skeleton } from './ui'
import { CreditCard, AlertCircle } from 'lucide-react'

interface CreditoOut {
  linea_credito: number | null
  credito_usado: number | null
  credito_disponible: number | null
}

interface FacturaResumen {
  id: number
  numero: number
  fecha: string
  fecha_vencimiento: string | null
  contacto: string | null
  total: number
  monto_pagado: number
  estado: string
}

interface DeudaOut {
  total_facturado: number
  total_pagado: number
  deuda: number
  facturas: FacturaResumen[]
}

interface Props {
  empresaId: number
}

function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function isVencida(fechaVencimiento: string | null) {
  if (!fechaVencimiento) return false
  return new Date(fechaVencimiento) < new Date(new Date().toDateString())
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'warning' | 'danger' | 'success' }) {
  const colorMap = {
    default: 'text-gray-900 dark:text-gray-100',
    warning: 'text-warning-600 dark:text-warning-400',
    danger: 'text-danger-600 dark:text-danger-400',
    success: 'text-success-600 dark:text-success-400',
  }
  return (
    <Card variant="subtle">
      <CardContent className="py-3">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{label}</div>
        <div className={`text-lg font-bold font-num ${colorMap[tone ?? 'default']}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

export default function EmpresaTabCredito({ empresaId }: Props) {
  const { data: credito, isLoading: loadingCredito } = useQuery<CreditoOut>({
    queryKey: ['empresa-credito', empresaId],
    queryFn: () => api.get(`/api/empresas/${empresaId}/credito`).then(r => r.data),
  })

  const { data: deuda, isLoading: loadingDeuda } = useQuery<DeudaOut>({
    queryKey: ['empresa-deuda', empresaId],
    queryFn: () => api.get(`/api/empresas/${empresaId}/deuda`).then(r => r.data),
  })

  const impagas = deuda?.facturas.filter(f => f.estado === 'emitida' || f.estado === 'parcial') ?? []

  return (
    <div className="flex flex-col gap-6">
      {/* Credit line section */}
      {loadingCredito ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : credito?.linea_credito != null ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat label="Línea de Crédito" value={fmtMoney(credito.linea_credito)} />
            <Stat
              label="Crédito Usado"
              value={fmtMoney(credito.credito_usado)}
              tone={
                credito.linea_credito > 0
                  ? Math.round((Number(credito.credito_usado ?? 0) / Number(credito.linea_credito)) * 100) > 80
                    ? 'danger'
                    : Math.round((Number(credito.credito_usado ?? 0) / Number(credito.linea_credito)) * 100) > 50
                    ? 'warning'
                    : 'default'
                  : 'default'
              }
            />
            <Stat
              label="Disponible"
              value={fmtMoney(credito.credito_disponible)}
              tone={(credito.credito_disponible ?? 0) < 0 ? 'danger' : 'success'}
            />
          </div>
          {credito.linea_credito > 0 && (() => {
            const pct = Math.round((Number(credito.credito_usado ?? 0) / Number(credito.linea_credito)) * 100)
            return (
              <div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  <span>Uso del crédito</span>
                  <span className="font-num font-medium">{pct}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-danger-500' : pct > 50 ? 'bg-warning-500' : 'bg-success-500'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            )
          })()}
        </div>
      ) : null}

      {/* Unpaid invoices section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Facturas impagas
          </h3>
          {!loadingDeuda && deuda && (
            <span className="text-sm font-num font-bold text-danger-600 dark:text-danger-400">
              {fmtMoney(Number(deuda.deuda))} pendiente
            </span>
          )}
        </div>

        {loadingDeuda ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : impagas.length === 0 ? (
          <EmptyState
            icon={<CreditCard />}
            title="Sin deuda pendiente"
            description="Todas las facturas están pagadas."
          />
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Factura</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Emisión</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Vence</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pendiente</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {impagas.map(f => {
                  const vencida = isVencida(f.fecha_vencimiento)
                  const pendiente = Number(f.total) - Number(f.monto_pagado)
                  return (
                    <tr
                      key={f.id}
                      className={`${vencida ? 'bg-danger-50/30 dark:bg-danger-950/20' : ''} hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors`}
                    >
                      <td className="px-3 py-2.5">
                        <Link
                          to={`/facturas/${f.id}`}
                          className="font-num font-medium text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          #{f.numero}
                        </Link>
                        {f.contacto && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{f.contacto}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 font-num">{fmtDate(f.fecha)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`font-num ${vencida ? 'text-danger-600 dark:text-danger-400 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                          {vencida && <AlertCircle className="inline w-3 h-3 mr-1 -mt-0.5" />}
                          {fmtDate(f.fecha_vencimiento)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-num font-semibold text-gray-900 dark:text-gray-100">
                        {fmtMoney(pendiente)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={f.estado === 'parcial' ? 'warning' : 'neutral'} size="sm">
                          {f.estado}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
