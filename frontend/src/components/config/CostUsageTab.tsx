import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import {
  Button, Card, EmptyState, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Skeleton,
  Table, TBody, TD, TH, THead, TR,
} from '../ui'

type Period = '24h' | '7d' | '30d'

interface EmpresaCostMetrics {
  empresa_id: number | null
  request_count: number
  lioren_call_count: number
  lioren_cost_clp: number
  dte_emitidos_count: number
  slow_request_count: number
}

interface CostTelemetryResponse {
  period: string
  empresas: EmpresaCostMetrics[]
  total: EmpresaCostMetrics
}

function fmtClp(n: number) {
  return `$${n.toLocaleString('es-CL')}`
}

function exportCsv(empresas: EmpresaCostMetrics[], period: string) {
  const header = ['empresa_id', 'requests', 'lioren_calls', 'lioren_cost_clp', 'dte_emitidos', 'slow_requests']
  const rows = empresas.map(e => [
    e.empresa_id ?? '(sin empresa)',
    e.request_count,
    e.lioren_call_count,
    e.lioren_cost_clp,
    e.dte_emitidos_count,
    e.slow_request_count,
  ])
  const csv = [header, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `telemetry-cost-${period}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function CostUsageTab() {
  const [period, setPeriod] = useState<Period>('30d')

  const { data, isLoading } = useQuery<CostTelemetryResponse>({
    queryKey: ['telemetry-cost', period],
    queryFn: () =>
      api.get('/api/admin/telemetry/cost', { params: { period } }).then(r => r.data),
  })

  const empresas = useMemo(() => {
    if (!data?.empresas) return []
    return [...data.empresas].sort((a, b) => b.lioren_cost_clp - a.lioren_cost_clp)
  }, [data])

  const total = data?.total
  const activeCount = empresas.length

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Select value={period} onValueChange={v => setPeriod(v as Period)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Últimas 24h</SelectItem>
            <SelectItem value="7d">Últimos 7d</SelectItem>
            <SelectItem value="30d">Últimos 30d</SelectItem>
          </SelectContent>
        </Select>

        {empresas.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => exportCsv(empresas, period)}>
            Exportar CSV
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : empresas.length === 0 ? (
        <EmptyState
          title="Sin datos"
          description="No hay métricas de costo para el período seleccionado."
        />
      ) : (
        <>
          {total && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Costo total Lioren', value: fmtClp(total.lioren_cost_clp) },
                { label: 'Total requests', value: total.request_count.toLocaleString('es-CL') },
                { label: 'Empresas activas', value: activeCount.toLocaleString('es-CL') },
              ].map(tile => (
                <Card key={tile.label} padded className="text-center">
                  <div className="text-xl font-semibold text-gray-900 dark:text-white">{tile.value}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tile.label}</div>
                </Card>
              ))}
            </div>
          )}

          <Table density="compact">
            <THead>
              <TR>
                <TH>Empresa ID</TH>
                <TH className="text-right">Requests</TH>
                <TH className="text-right">Lioren calls</TH>
                <TH className="text-right">Costo Lioren</TH>
                <TH className="text-right">DTE emitidos</TH>
                <TH className="text-right">Req. lentos</TH>
              </TR>
            </THead>
            <TBody>
              {empresas.map(e => (
                <TR key={e.empresa_id ?? 'null'}>
                  <TD className="tabular-nums font-mono text-xs">
                    {e.empresa_id ?? <span className="text-gray-500 dark:text-gray-400 italic">sin empresa</span>}
                  </TD>
                  <TD className="text-right tabular-nums">{e.request_count.toLocaleString('es-CL')}</TD>
                  <TD className="text-right tabular-nums">{e.lioren_call_count.toLocaleString('es-CL')}</TD>
                  <TD className="text-right tabular-nums font-medium">
                    {fmtClp(e.lioren_cost_clp)}
                  </TD>
                  <TD className="text-right tabular-nums">{e.dte_emitidos_count.toLocaleString('es-CL')}</TD>
                  <TD
                    className={`text-right tabular-nums ${
                      e.slow_request_count > 0
                        ? 'text-warning-600 dark:text-warning-400'
                        : 'text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {e.slow_request_count.toLocaleString('es-CL')}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            Ordenado por costo Lioren descendente. Req. lentos: p95 ≥ 1s.
          </div>
        </>
      )}
    </div>
  )
}
