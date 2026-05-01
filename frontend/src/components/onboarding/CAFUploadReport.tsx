import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { Button, Table, THead, TBody, TR, TH, TD } from '../ui'
import type { CAFUploadResult } from '../../api/cafs'

interface CAFUploadReportProps {
  results: CAFUploadResult[]
  onClose: () => void
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  valid: <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />,
  warning: <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />,
  error: <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />,
}

const STATUS_STYLE: Record<string, string> = {
  valid: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
}

function getResultStatus(result: CAFUploadResult): 'valid' | 'warning' | 'error' {
  if (!result.valid) return 'error'
  if (result.warnings.length > 0) return 'warning'
  return 'valid'
}

export function CAFUploadReport({ results, onClose }: CAFUploadReportProps) {
  const validCount = results.filter((r) => r.valid).length
  const errorCount = results.filter((r) => !r.valid).length
  const warningCount = results.filter((r) => r.warnings.length > 0).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Resultado de la carga
        </h3>
      </div>

      <div className="flex flex-wrap gap-4">
        <Stat label="Exitosos" value={validCount} color="green" />
        <Stat label="Advertencias" value={warningCount} color="yellow" />
        <Stat label="Errores" value={errorCount} color={errorCount > 0 ? 'red' : 'gray'} />
      </div>

      <div className="space-y-3">
        {results.map((result) => {
          const status = getResultStatus(result)
          return (
            <div
              key={result.filename}
              className={`border rounded-lg p-3 ${STATUS_STYLE[status]}`}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0">{STATUS_ICON[status]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {result.filename}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {result.message}
                  </p>

                  {result.valid && result.tipo_dte && (
                    <div className="mt-2 text-xs text-gray-700 dark:text-gray-300">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="font-medium">Tipo DTE:</span> {result.tipo_dte}
                        </div>
                        <div>
                          <span className="font-medium">Rut:</span> {result.rut_emisor}
                        </div>
                        <div>
                          <span className="font-medium">Folios:</span> {result.num_inicio} - {result.num_fin}
                        </div>
                        <div>
                          <span className="font-medium">Total:</span>{' '}
                          {(result.num_fin! - result.num_inicio! + 1).toLocaleString('es-CL')}
                        </div>
                      </div>
                    </div>
                  )}

                  {result.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-red-700 dark:text-red-400">Errores:</p>
                      <ul className="text-xs text-red-600 dark:text-red-400 list-disc list-inside mt-1">
                        {result.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.warnings.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                        Advertencias:
                      </p>
                      <ul className="text-xs text-yellow-600 dark:text-yellow-400 list-disc list-inside mt-1">
                        {result.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  color = 'gray',
}: {
  label: string
  value: number
  color?: 'green' | 'yellow' | 'red' | 'gray'
}) {
  const colorCls: Record<string, string> = {
    green: 'text-green-700 dark:text-green-400',
    yellow: 'text-yellow-700 dark:text-yellow-400',
    red: 'text-red-700 dark:text-red-400',
    gray: 'text-gray-700 dark:text-gray-300',
  }
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${colorCls[color] ?? colorCls.gray}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  )
}
