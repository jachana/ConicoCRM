import { CheckCircle2, XCircle } from 'lucide-react'
import { Table, THead, TBody, TR, TH, TD } from '../ui'
import { PreviewResp } from '../../hooks/usePaymentImport'

interface PaymentPreviewTableProps {
  preview: PreviewResp
}

export function PaymentPreviewTable({ preview }: PaymentPreviewTableProps) {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Stat label="Total filas" value={preview.total_filas} />
        <Stat label="Válidas" value={preview.filas_validas} color="green" />
        <Stat label="Con error" value={preview.filas_invalidas} color={preview.filas_invalidas > 0 ? 'red' : 'gray'} />
      </div>

      {preview.errores.length > 0 && (
        <div className="space-y-2 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">Errores encontrados:</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {preview.errores.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Fila {e.fila}: {e.motivo}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview.filas_validas > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Filas a procesar:</p>
          <Table>
            <THead>
              <TR>
                <TH>Fila</TH>
                <TH>Fecha</TH>
                <TH>RUT Cliente</TH>
                <TH>Monto</TH>
                <TH>Folio</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {preview.filas.slice(0, 20).map((row, i) => (
                <TR key={i}>
                  <TD className="text-gray-500">{row.fila}</TD>
                  <TD>{row.fecha_pago}</TD>
                  <TD className="font-mono">{row.rut_cliente}</TD>
                  <TD className="text-right font-mono">{row.monto.toLocaleString('es-CL')}</TD>
                  <TD>{row.folio_documento}</TD>
                  <TD>
                    <div className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="w-3 h-3" />
                      válido
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {preview.filas.length > 20 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Mostrando 20 de {preview.filas.length} filas válidas
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'gray' }: { label: string; value: number; color?: 'green' | 'red' | 'gray' }) {
  const colorCls: Record<string, string> = {
    green: 'text-green-700 dark:text-green-400',
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
