import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button, Card, Skeleton, Table, THead, TBody, TR, TH, TD } from '../ui'
import { listCAFs } from '../../api/cafs'
import type { CAFDetail } from '../../api/cafs'

interface CAFListSectionProps {
  refreshTrigger?: number
}

export function CAFListSection({ refreshTrigger }: CAFListSectionProps) {
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    if (refreshTrigger !== undefined) {
      setRefetchCount((prev) => prev + 1)
    }
  }, [refreshTrigger])

  const { data: response, isLoading, error, refetch } = useQuery({
    queryKey: ['cafs', refetchCount],
    queryFn: () => listCAFs(),
  })

  const cafs = response?.cafs || []
  const lowFoliosWarnings = cafs.filter((c) => c.porcentaje_consumido >= 80 && c.vigente)

  if (isLoading) {
    return (
      <Card padded>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          CAFs Actuales
        </h2>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card padded>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">Error al cargar CAFs</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
            No se pudieron cargar los CAFs. Intenta de nuevo más tarde.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card padded>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          CAFs Actuales ({cafs.length})
        </h2>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={() => refetch()}
        >
          Actualizar
        </Button>
      </div>

      {lowFoliosWarnings.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Folios en riesgo
          </p>
          <div className="mt-2 space-y-1">
            {lowFoliosWarnings.map((caf) => (
              <div key={caf.id} className="text-xs text-yellow-700 dark:text-yellow-400">
                DTE {caf.tipo_dte}: {caf.folios_restantes} folios restantes ({caf.porcentaje_consumido.toFixed(1)}% consumido)
              </div>
            ))}
          </div>
        </div>
      )}

      {cafs.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay CAFs cargados aún. Sube tu primer CAF arriba.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table density="compact">
            <THead>
              <TR>
                <TH>DTE</TH>
                <TH>Folios</TH>
                <TH className="text-right">Consumido</TH>
                <TH className="text-right">Restantes</TH>
                <TH className="text-center">Uso</TH>
                <TH className="text-center">Estado</TH>
              </TR>
            </THead>
            <TBody>
              {cafs.map((caf) => (
                <TR key={caf.id}>
                  <TD className="font-medium text-gray-900 dark:text-white">{caf.tipo_dte}</TD>
                  <TD className="text-xs font-mono text-gray-600 dark:text-gray-400">
                    {caf.num_inicio.toLocaleString('es-CL')} - {caf.num_fin.toLocaleString('es-CL')}
                  </TD>
                  <TD className="text-right text-xs text-gray-700 dark:text-gray-300">
                    {caf.consumido.toLocaleString('es-CL')}
                  </TD>
                  <TD className="text-right text-xs text-gray-700 dark:text-gray-300">
                    {caf.folios_restantes.toLocaleString('es-CL')}
                  </TD>
                  <TD>
                    <ConsumptionBar
                      percentage={caf.porcentaje_consumido}
                      label={`${caf.porcentaje_consumido.toFixed(1)}%`}
                    />
                  </TD>
                  <TD className="text-center">
                    {caf.vigente ? (
                      <div className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="w-3 h-3" />
                        Vigente
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                        <AlertTriangle className="w-3 h-3" />
                        Vencido
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {cafs.length > 0 && (
        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          <p>Total folios cargados: {cafs.reduce((sum, c) => sum + c.total_folios, 0).toLocaleString('es-CL')}</p>
        </div>
      )}
    </Card>
  )
}

function ConsumptionBar({
  percentage,
  label,
}: {
  percentage: number
  label: string
}) {
  let color = 'bg-green-500'
  if (percentage >= 80) color = 'bg-red-500'
  else if (percentage >= 60) color = 'bg-yellow-500'
  else if (percentage >= 40) color = 'bg-blue-500'

  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-10 text-right">
        {label}
      </span>
    </div>
  )
}
