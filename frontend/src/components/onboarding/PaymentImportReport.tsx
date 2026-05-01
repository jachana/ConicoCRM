import { Download, CheckCircle2, AlertCircle, XCircle, Clock } from 'lucide-react'
import { Button, Table, THead, TBody, TR, TH, TD } from '../ui'
import { ImportResp } from '../../hooks/usePaymentImport'

interface PaymentImportReportProps {
  result: ImportResp
  importId: string
  onDownloadReport: (importId: string) => Promise<void>
  onReset: () => void
  downloadLoading?: boolean
}

const ESTADO_ICON: Record<string, React.ReactNode> = {
  created: <CheckCircle2 className="w-3.5 h-3.5" />,
  updated: <AlertCircle className="w-3.5 h-3.5" />,
  pending: <Clock className="w-3.5 h-3.5" />,
  error: <XCircle className="w-3.5 h-3.5" />,
}

const ESTADO_STYLE: Record<string, string> = {
  created: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
  updated: 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
  pending: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
  error: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
}

const ESTADO_LABEL: Record<string, string> = {
  created: 'Creado',
  updated: 'Actualizado',
  pending: 'Pendiente',
  error: 'Error',
}

export function PaymentImportReport({
  result,
  importId,
  onDownloadReport,
  onReset,
  downloadLoading,
}: PaymentImportReportProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Resultado de la importación</h3>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Download className="w-3.5 h-3.5" />}
          onClick={() => onDownloadReport(importId)}
          loading={downloadLoading}
        >
          Descargar reporte
        </Button>
      </div>

      <div className="flex flex-wrap gap-4">
        <Stat label="Creados" value={result.created} color="green" />
        <Stat label="Actualizados" value={result.updated} color="yellow" />
        <Stat label="Pendientes" value={result.pending} color="blue" />
        <Stat label="Errores" value={result.error} color={result.error > 0 ? 'red' : 'gray'} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Detalle de procesamiento:</p>
        <Table density="compact">
          <THead>
            <TR>
              <TH>Fila</TH>
              <TH>Fecha</TH>
              <TH>RUT Cliente</TH>
              <TH>Monto</TH>
              <TH>Folio</TH>
              <TH>Estado</TH>
              {result.rows.some((r) => r.motivo) && <TH>Detalle</TH>}
            </TR>
          </THead>
          <TBody>
            {result.rows.slice(0, 50).map((row, i) => (
              <TR key={i}>
                <TD className="text-gray-500 text-xs">{row.fila}</TD>
                <TD className="text-xs">{row.fecha_pago}</TD>
                <TD className="font-mono text-xs">{row.rut_cliente}</TD>
                <TD className="text-right font-mono text-xs">{row.monto.toLocaleString('es-CL')}</TD>
                <TD className="text-xs">{row.folio_documento}</TD>
                <TD>
                  <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${ESTADO_STYLE[row.estado]}`}>
                    {ESTADO_ICON[row.estado]}
                    {ESTADO_LABEL[row.estado]}
                  </div>
                </TD>
                {result.rows.some((r) => r.motivo) && (
                  <TD className="text-xs text-gray-500 dark:text-gray-400 italic">{row.motivo || '-'}</TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
        {result.rows.length > 50 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Mostrando 50 de {result.rows.length} filas</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onReset}>
          Nueva importación
        </Button>
      </div>
    </div>
  )
}

function Stat({ label, value, color = 'gray' }: { label: string; value: number; color?: 'green' | 'yellow' | 'blue' | 'red' | 'gray' }) {
  const colorCls: Record<string, string> = {
    green: 'text-green-700 dark:text-green-400',
    yellow: 'text-yellow-700 dark:text-yellow-400',
    blue: 'text-blue-700 dark:text-blue-400',
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
