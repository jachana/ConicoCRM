import { useState } from 'react'
import { Button, Card } from '../ui'
import { usePaymentImport } from '../../hooks/usePaymentImport'
import { PaymentUploadArea } from './PaymentUploadArea'
import { PaymentPreviewTable } from './PaymentPreviewTable'
import { PaymentImportReport } from './PaymentImportReport'
import { Download } from 'lucide-react'

export function PaymentImportSection() {
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle')
  const [importId, setImportId] = useState<string>('')
  const [downloadReportLoading, setDownloadReportLoading] = useState(false)

  const { preview, result, loading, downloadTemplate, previewFile, importFile, downloadReport, reset } =
    usePaymentImport()

  function handleFileSelect(f: File) {
    setFile(f)
    setPreview(null)
    setResult(null)
    setStep('idle')
  }

  async function handlePreview() {
    if (!file) return
    try {
      await previewFile(file)
      setStep('preview')
    } catch {
      // Error already handled by hook
    }
  }

  async function handleImport() {
    if (!file) return
    setStep('importing')
    try {
      const res = await importFile(file)
      setImportId(res.rows[0]?.fila?.toString() || 'unknown') // Use a generated ID or from API
      setStep('done')
    } catch {
      setStep('preview')
      // Error toast already shown by hook
    }
  }

  async function handleDownloadReport() {
    setDownloadReportLoading(true)
    try {
      await downloadReport(importId)
    } finally {
      setDownloadReportLoading(false)
    }
  }

  function handleReset() {
    setFile(null)
    setStep('idle')
    reset()
  }

  async function handleDownloadTemplate() {
    try {
      await downloadTemplate()
    } catch {
      // Error toast already shown by hook
    }
  }

  return (
    <div className="space-y-4">
      <Card padded>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">1. Plantilla y archivo</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Descarga la plantilla, completa los pagos y vuelve a subir el archivo. Columnas requeridas:{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">fecha_pago</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">rut_cliente</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">monto</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">folio_documento</code>. Los pagos se
          buscarán automáticamente y se aplicarán a las facturas disponibles.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="w-3.5 h-3.5" />}
            onClick={handleDownloadTemplate}
            disabled={loading}
          >
            Descargar plantilla
          </Button>
        </div>

        <PaymentUploadArea file={file} onFileSelect={handleFileSelect} onPreview={handlePreview} disabled={loading} />
      </Card>

      {file && step === 'idle' && (
        <div className="flex justify-end">
          <Button onClick={handlePreview} disabled={loading}>
            {loading ? 'Analizando...' : 'Previsualizar'}
          </Button>
        </div>
      )}

      {preview && (step === 'preview' || step === 'done') && (
        <Card padded>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">2. Previsualización</h2>
          <PaymentPreviewTable preview={preview} />
        </Card>
      )}

      {step === 'preview' && preview && preview.filas_validas > 0 && (
        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={loading}>
            {loading ? 'Importando...' : `Importar ${preview.filas_validas} pago${preview.filas_validas !== 1 ? 's' : ''}`}
          </Button>
        </div>
      )}

      {step === 'preview' && preview && preview.filas_validas === 0 && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={handleReset}>
            Volver a subir
          </Button>
        </div>
      )}

      {result && step === 'done' && (
        <Card padded>
          <PaymentImportReport
            result={result}
            importId={importId}
            onDownloadReport={handleDownloadReport}
            onReset={handleReset}
            downloadLoading={downloadReportLoading}
          />
        </Card>
      )}
    </div>
  )
}
