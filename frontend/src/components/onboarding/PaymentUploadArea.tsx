import { useRef } from 'react'
import { Upload, FileSpreadsheet } from 'lucide-react'
import { Button } from '../ui'

interface PaymentUploadAreaProps {
  file: File | null
  onFileSelect: (file: File) => void
  onPreview: () => void
  disabled?: boolean
}

export function PaymentUploadArea({ file, onFileSelect, onPreview, disabled }: PaymentUploadAreaProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    onFileSelect(f)
    e.target.value = ''
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Upload className="w-3.5 h-3.5" />}
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
        >
          {file ? 'Cambiar archivo' : 'Seleccionar archivo .xlsx'}
        </Button>
      </div>

      {file && (
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <FileSpreadsheet className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          <span className="truncate font-medium">{file.name}</span>
          <span className="text-gray-400 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
        </div>
      )}

      {file && (
        <div className="flex justify-end">
          <Button onClick={onPreview} disabled={disabled}>
            {disabled ? 'Analizando...' : 'Previsualizar'}
          </Button>
        </div>
      )}
    </div>
  )
}
