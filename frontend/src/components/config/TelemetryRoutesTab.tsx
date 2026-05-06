import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer } from 'recharts'
import { api } from '../../lib/api'
import {
  Button, Card, EmptyState, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Skeleton,
  Table, TBody, TD, TH, THead, TR,
  Modal, ModalContent, ModalHeader, ModalTitle, ModalBody,
} from '../ui'
import { Sparkline } from './Sparkline'

type Period = '24h' | '7d' | '30d'
type OrderBy = 'p95' | 'count' | 'error_rate'

interface TrendBucket {
  hour: string
  p95: number
  count: number
}

interface RouteMetrics {
  route: string
  count: number
  p50: number
  p95: number
  p99: number
  error_rate: number
  trend: TrendBucket[]
}

interface RoutesResponse {
  period: string
  routes: RouteMetrics[]
}

function fmtMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

function fmtHour(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function RouteDetailModal({
  route,
  open,
  onClose,
}: {
  route: RouteMetrics | null
  open: boolean
  onClose: () => void
}) {
  if (!route) return null

  const chartData = route.trend.map(b => ({
    label: fmtHour(b.hour),
    p95: Math.round(b.p95),
    count: b.count,
  }))

  return (
    <Modal open={open} onOpenChange={v => !v && onClose()}>
      <ModalContent className="max-w-2xl">
        <ModalHeader>
          <ModalTitle className="text-sm font-mono truncate">{route.route}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Requests', value: route.count.toLocaleString('es-CL') },
              { label: 'p50', value: fmtMs(route.p50) },
              { label: 'p95', value: fmtMs(route.p95) },
              { label: 'Error rate', value: `${(route.error_rate * 100).toFixed(1)}%` },
            ].map(m => (
              <Card key={m.label} padded className="text-center">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">{m.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{m.label}</div>
              </Card>
            ))}
          </div>

          {chartData.length > 0 ? (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">p95 latencia por hora</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}ms`} width={48} />
                  <RechartTooltip
                    formatter={(v: unknown) => [`${v}ms`, 'p95']}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="p95" fill="var(--color-brand-500, #6366f1)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Sin datos de tendencia</p>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

export default function TelemetryRoutesTab() {
  const [period, setPeriod] = useState<Period>('24h')
  const [orderBy, setOrderBy] = useState<OrderBy>('p95')
  const [selected, setSelected] = useState<RouteMetrics | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const { data, isLoading } = useQuery<RoutesResponse>({
    queryKey: ['telemetry-routes', period, orderBy],
    queryFn: () =>
      api.get('/api/admin/telemetry/routes', { params: { period, order_by: orderBy } }).then(r => r.data),
  })

  const routes = data?.routes ?? []

  function openDetail(route: RouteMetrics) {
    setSelected(route)
    setModalOpen(true)
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={period} onValueChange={v => setPeriod(v as Period)}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Últimas 24h</SelectItem>
            <SelectItem value="7d">Últimos 7d</SelectItem>
            <SelectItem value="30d">Últimos 30d</SelectItem>
          </SelectContent>
        </Select>

        <Select value={orderBy} onValueChange={v => setOrderBy(v as OrderBy)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="p95">Ordenar: p95</SelectItem>
            <SelectItem value="count">Ordenar: requests</SelectItem>
            <SelectItem value="error_rate">Ordenar: errores</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : routes.length === 0 ? (
        <EmptyState
          title="Sin datos"
          description="No hay métricas de rutas para el período seleccionado."
        />
      ) : (
        <Table density="compact">
          <THead>
            <TR>
              <TH>Ruta</TH>
              <TH className="text-right">Requests</TH>
              <TH className="text-right">p50</TH>
              <TH className="text-right">p95</TH>
              <TH className="text-right">p99</TH>
              <TH className="text-right">Error %</TH>
              <TH>Tendencia</TH>
            </TR>
          </THead>
          <TBody>
            {routes.map(r => (
              <TR
                key={r.route}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                onClick={() => openDetail(r)}
              >
                <TD className="font-mono text-xs max-w-xs truncate">{r.route}</TD>
                <TD className="text-right tabular-nums">{r.count.toLocaleString('es-CL')}</TD>
                <TD className="text-right tabular-nums">{fmtMs(r.p50)}</TD>
                <TD
                  className={`text-right tabular-nums font-medium ${
                    r.p95 >= 1000
                      ? 'text-danger-600 dark:text-danger-400'
                      : r.p95 >= 500
                      ? 'text-warning-600 dark:text-warning-400'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {fmtMs(r.p95)}
                </TD>
                <TD className="text-right tabular-nums">{fmtMs(r.p99)}</TD>
                <TD
                  className={`text-right tabular-nums ${
                    r.error_rate >= 0.05
                      ? 'text-danger-600 dark:text-danger-400'
                      : r.error_rate >= 0.01
                      ? 'text-warning-600 dark:text-warning-400'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {(r.error_rate * 100).toFixed(1)}%
                </TD>
                <TD>
                  <Sparkline data={r.trend} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <div className="text-xs text-gray-400 dark:text-gray-500">
        Haz click en una fila para ver el detalle por hora. Rojo: p95 ≥ 1s o error ≥ 5%.
      </div>

      <RouteDetailModal
        route={selected}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}
