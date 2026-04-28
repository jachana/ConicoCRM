import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Card, CardContent, EmptyState, Skeleton } from './ui'
import { CreditCard } from 'lucide-react'

interface CreditoOut {
  linea_credito: number | null
  credito_usado: number | null
  credito_disponible: number | null
}

interface Props {
  empresaId: number
}

function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'warning' | 'danger' | 'success' }) {
  const colorMap = {
    default: 'text-gray-900 dark:text-gray-100',
    warning: 'text-warning-600 dark:text-warning-400',
    danger:  'text-danger-600 dark:text-danger-400',
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
  const { data, isLoading } = useQuery<CreditoOut>({
    queryKey: ['empresa-credito', empresaId],
    queryFn: () => api.get(`/api/empresas/${empresaId}/credito`).then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    )
  }

  if (!data || data.linea_credito == null) {
    return (
      <EmptyState
        icon={<CreditCard />}
        title="Sin línea de crédito"
        description="Esta empresa no tiene línea de crédito configurada."
      />
    )
  }

  const pct = data.linea_credito > 0
    ? Math.round((Number(data.credito_usado ?? 0) / Number(data.linea_credito)) * 100)
    : 0

  const usadoTone: 'default' | 'warning' | 'danger' = pct > 80 ? 'danger' : pct > 50 ? 'warning' : 'default'
  const dispTone: 'success' | 'danger' = (data.credito_disponible ?? 0) < 0 ? 'danger' : 'success'

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Línea de Crédito" value={fmtMoney(data.linea_credito)} />
        <Stat label="Crédito Usado" value={fmtMoney(data.credito_usado)} tone={usadoTone} />
        <Stat label="Disponible" value={fmtMoney(data.credito_disponible)} tone={dispTone} />
      </div>
      {data.linea_credito > 0 && (
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
      )}
    </div>
  )
}
