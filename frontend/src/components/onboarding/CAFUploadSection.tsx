import { useState } from 'react'
import { toast } from 'sonner'
import { AxiosError } from 'axios'
import { Button, Card } from '../ui'
import { CAFUploadArea } from './CAFUploadArea'
import { CAFUploadReport } from './CAFUploadReport'
import { CAFListSection } from './CAFListSection'
import { uploadCAFs } from '../../api/cafs'
import type { CAFUploadResponse } from '../../api/cafs'

interface CAFUploadSectionProps {
  onUploadComplete?: () => void
}

type Step = 'idle' | 'uploading' | 'done'

export function CAFUploadSection({ onUploadComplete }: CAFUploadSectionProps) {
  const [files, setFiles] = useState<File[]>([])
  const [step, setStep] = useState<Step>('idle')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CAFUploadResponse | null>(null)
  const [refreshListTrigger, setRefreshListTrigger] = useState(0)

  async function handleUpload() {
    if (files.length === 0) {
      toast.error('Selecciona al menos un archivo')
      return
    }

    setLoading(true)
    setStep('uploading')

    try {
      const uploadResult = await uploadCAFs(files)
      setResult(uploadResult)
      setStep('done')

      // Show summary toast
      if (uploadResult.processed > 0) {
        toast.success(
          `CAFs cargados exitosamente: ${uploadResult.processed}/${uploadResult.total_files}`
        )
      } else {
        toast.error(`No se pudieron procesar los CAFs`)
      }

      // Trigger CAF list refresh
      setRefreshListTrigger((prev) => prev + 1)

      // Callback
      if (onUploadComplete) {
        onUploadComplete()
      }
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string }>
      const errorMessage = axiosError?.response?.data?.detail ?? 'Error al subir CAFs'
      toast.error(errorMessage)
      setStep('idle')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setFiles([])
    setStep('idle')
    setResult(null)
  }

  function handleCloseReport() {
    handleReset()
  }

  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <Card padded>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
          1. Cargar CAF
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Arrastra o selecciona archivos CAF en formato XML. Puedes subir múltiples archivos a la vez.
        </p>

        <CAFUploadArea
          files={files}
          onFilesSelect={setFiles}
          disabled={loading}
        />

        {files.length > 0 && step === 'idle' && (
          <div className="flex gap-2 mt-4 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={loading}
              loading={loading}
            >
              {loading ? 'Subiendo...' : `Subir ${files.length} archivo${files.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        )}
      </Card>

      {/* Upload Results */}
      {result && step === 'done' && (
        <Card padded>
          <CAFUploadReport
            results={result.results}
            onClose={handleCloseReport}
          />
        </Card>
      )}

      {/* CAF List */}
      <CAFListSection refreshTrigger={refreshListTrigger} />
    </div>
  )
}
