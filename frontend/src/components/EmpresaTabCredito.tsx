import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface CreditoOut {
  limite_credito: number | null
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

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-1">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold ${color ?? 'text-gray-900 dark:text-white'}`}>{value}</div>
    </div>
  )
}

export default function EmpresaTabCredito({ empresaId }: Props) {
  const { data, isLoading } = useQuery<CreditoOut>({
    queryKey: ['empresa-credito', empresaId],
    queryFn: () => api.get(`/api/empresas/${empresaId}/credito`).then(r => r.data),
  })

  if (isLoading) return <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>

  if (!data || data.limite_credito == null) {
    return (
      <div className="text-gray-400 text-sm py-8 text-center">
        Esta empresa no tiene límite de crédito configurado.
      </div>
    )
  }

  const pct = data.limite_credito > 0
    ? Math.round((Number(data.credito_usado ?? 0) / Number(data.limite_credito)) * 100)
    : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Límite de Crédito" value={fmtMoney(data.limite_credito)} />
        <Stat
          label="Crédito Usado"
          value={fmtMoney(data.credito_usado)}
          color={pct > 80 ? 'text-red-500' : pct > 50 ? 'text-orange-500' : 'text-gray-900 dark:text-white'}
        />
        <Stat
          label="Disponible"
          value={fmtMoney(data.credito_disponible)}
          color={(data.credito_disponible ?? 0) < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}
        />
      </div>
      {data.limite_credito > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Uso del crédito</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-orange-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
