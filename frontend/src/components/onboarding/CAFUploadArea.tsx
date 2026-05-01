import { useRef, useState, useCallback } from 'react'
import { Upload, File, X } from 'lucide-react'
import { Button } from '../ui'

interface CAFUploadAreaProps {
  files: File[]
  onFilesSelect: (files: File[]) => void
  disabled?: boolean
}

export function CAFUploadArea({ files, onFilesSelect, disabled }: CAFUploadAreaProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || [])
    const xmlFiles = newFiles.filter((f) => f.name.toLowerCase().endsWith('.xml'))

    if (xmlFiles.length === 0) {
      // Show toast or error message - for now just filter silently
      return
    }

    // Append to existing files, avoiding duplicates by name
    const existingNames = new Set(files.map((f) => f.name))
    const filesToAdd = xmlFiles.filter((f) => !existingNames.has(f.name))

    onFilesSelect([...files, ...filesToAdd])
    e.target.value = ''
  }, [files, onFilesSelect])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files || [])
    const xmlFiles = droppedFiles.filter((f) => f.name.toLowerCase().endsWith('.xml'))

    if (xmlFiles.length === 0) {
      return
    }

    // Append to existing files, avoiding duplicates by name
    const existingNames = new Set(files.map((f) => f.name))
    const filesToAdd = xmlFiles.filter((f) => !existingNames.has(f.name))

    onFilesSelect([...files, ...filesToAdd])
  }, [files, onFilesSelect])

  const removeFile = useCallback((fileName: string) => {
    onFilesSelect(files.filter((f) => f.name !== fileName))
  }, [files, onFilesSelect])

  return (
    <div className="space-y-4">
      <div
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
          isDragActive
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xml"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Arrastra archivos CAF aquí o{' '}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold disabled:opacity-50"
              >
                selecciona archivos
              </button>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Solo se aceptan archivos .xml
            </p>
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {files.length} archivo{files.length !== 1 ? 's' : ''} seleccionado{files.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <File className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate font-medium">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(file.name)}
                  disabled={disabled}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                  title="Eliminar archivo"
                >
                  <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Upload className="w-3.5 h-3.5" />}
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
          >
            Seleccionar archivo
          </Button>
        </div>
      )}
    </div>
  )
}
