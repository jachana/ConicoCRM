import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../lib/api'
import { Button, Card, Badge, Table, THead, TBody, TR, TH, TD, EmptyState } from '../ui'

type StatusType = 'crear' | 'actualizar' | 'error'

interface PreviewRow {
  row_num: number
  empresa_rut: string
  bodega_nombre: string
  bodega_direccion: string | null
  sede_nombre: string
  sede_direccion: string
  status: 'valid' | 'invalid'
  errors: string[]
}

interface PreviewResp {
  total_filas: number
  filas_validas: number
  filas_invalidas: number
  a_crear: { bodegas: number; sedes: number }
  a_actualizar: { bodegas: number; sedes: number }
  rows: PreviewRow[]
}

interface ImportReport {
  created_bodega_count: number
  updated_bodega_count: number
  created_sede_count: number
  updated_sede_count: number
  error_count: number
  total_rows: number
  rows: any[]
}

interface ImportResp {
  status: 'success' | 'partial' | 'error'
  import_id: string
  timestamp: string
  report: ImportReport
}

const STATUS_VARIANT: Record<StatusType, 'success' | 'info' | 'danger'> = {
  crear: 'success',
  actualizar: 'info',
  error: 'danger',
}

const STATUS_LABEL: Record<StatusType, string> = {
  crear: 'Crear',
  actualizar: 'Actualizar',
  error: 'Error',
}

export function ImportBodegasSedesSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle')
  const [preview, setPreview] = useState<PreviewResp | null>(null)
  const [result, setResult] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set())
  const [dragActive, setDragActive] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(null)
    setResult(null)
    setStep('idle')
    e.target.value = ''
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (!f || !f.name.endsWith('.xlsx')) {
      toast.error('Solo se permiten archivos .xlsx')
      return
    }
    setFile(f)
    setPreview(null)
    setResult(null)
    setStep('idle')
  }

  async function handlePreview() {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const resp = await api.post('/api/onboarding/bodegas-sedes/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(resp.data)
      setStep('preview')
      setExpandedErrors(new Set())
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Error al previsualizar')
    } finally {
      setBusy(false)
    }
  }

  async function handleImport() {
    if (!file) return
    setBusy(true)
    setStep('importing')
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const resp = await api.post<ImportResp>('/api/onboarding/bodegas-sedes/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(resp.data.report)
      setStep('done')
      const { created_bodega_count, updated_bodega_count, created_sede_count, updated_sede_count } = resp.data.report
      toast.success(
        `Importación completada — Bodegas: ${created_bodega_count} creadas, ${updated_bodega_count} actualizadas | Sedes: ${created_sede_count} creadas, ${updated_sede_count} actualizadas`
      )
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Error al importar')
      setStep('preview')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadTemplate() {
    try {
      const resp = await api.get('/api/onboarding/bodegas-sedes/template', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_bodegas_sedes.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al descargar plantilla')
    }
  }

  function reset() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setStep('idle')
    setExpandedErrors(new Set())
  }

  function toggleErrorExpanded(filaNum: number) {
    const newSet = new Set(expandedErrors)
    if (newSet.has(filaNum)) {
      newSet.delete(filaNum)
    } else {
      newSet.add(filaNum)
    }
    setExpandedErrors(newSet)
  }

  return (
    <div className="space-y-4">
      <Card padded>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">1. Plantilla y archivo</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Descarga la plantilla, completa las bodegas y sedes, y vuelve a subir el archivo. Columnas requeridas:{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">empresa_rut</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">bodega_nombre</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">bodega_direccion</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">sede_nombre</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">sede_direccion</code>.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={handleDownloadTemplate}>
            Descargar plantilla
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Upload className="w-3.5 h-3.5" />}
            onClick={() => fileRef.current?.click()}
          >
            {file ? 'Cambiar archivo' : 'Seleccionar archivo .xlsx'}
          </Button>
        </div>

        {/* Drag-drop zone */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`transition-colors rounded-lg border-2 border-dashed p-6 text-center ${
            dragActive ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/10' : 'border-gray-300 dark:border-gray-700'
          }`}
        >
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Arrastra un archivo .xlsx aquí o usa el botón arriba
          </p>
        </div>

        {file && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <FileSpreadsheet className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
            <span className="truncate font-medium">{file.name}</span>
            <span className="text-gray-400 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
        )}
      </Card>

      {file && step === 'idle' && (
        <div className="flex justify-end">
          <Button onClick={handlePreview} disabled={busy}>
            {busy ? 'Analizando...' : 'Previsualizar'}
          </Button>
        </div>
      )}

      {preview && (step === 'preview' || step === 'done') && (
        <Card padded>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">2. Previsualización</h2>
          <div className="flex gap-4 mb-4 flex-wrap">
            <Stat label="Total filas" value={preview.total_filas} />
            <Stat label="Válidas" value={preview.filas_validas} color="green" />
            <Stat label="Bodegas a crear" value={preview.a_crear.bodegas} color="green" />
            <Stat label="Sedes a crear" value={preview.a_crear.sedes} color="green" />
            <Stat label="Con error" value={preview.filas_invalidas} color={preview.filas_invalidas > 0 ? 'red' : 'gray'} />
          </div>

          {preview.filas_invalidas > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Filas con errores ({preview.filas_invalidas}):</p>
              {preview.rows
                .filter((r) => r.status === 'invalid')
                .map((r) => (
                  <div key={r.row_num} className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleErrorExpanded(r.row_num)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <XCircle className="w-3.5 h-3.5 text-red-700 dark:text-red-400 shrink-0" />
                        <span className="text-xs text-red-700 dark:text-red-400 font-medium">
                          Fila {r.row_num}
                          {r.empresa_rut && <span className="ml-2">({r.empresa_rut})</span>}
                          {r.bodega_nombre && <span className="ml-2">{r.bodega_nombre}</span>}
                        </span>
                      </div>
                      {expandedErrors.has(r.row_num) ? (
                        <ChevronUp className="w-3.5 h-3.5 text-red-700 dark:text-red-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-red-700 dark:text-red-400 shrink-0" />
                      )}
                    </button>
                    {expandedErrors.has(r.row_num) && (
                      <div className="px-3 py-2 border-t border-red-200 dark:border-red-800 bg-red-25 dark:bg-red-900/10">
                        <ul className="space-y-1">
                          {r.errors.map((error, i) => (
                            <li key={i} className="text-xs text-red-700 dark:text-red-400 flex gap-2">
                              <span className="shrink-0">•</span>
                              <span>{error}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {preview.filas_validas > 0 && (
            <div className="overflow-x-auto">
              <Table density="compact">
                <THead>
                  <TR>
                    <TH>Fila</TH>
                    <TH>Empresa RUT</TH>
                    <TH>Bodega</TH>
                    <TH>Dirección</TH>
                    <TH>Sede</TH>
                    <TH>Dirección</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.rows
                    .filter((r) => r.status === 'valid')
                    .map((r) => (
                      <TR key={r.row_num}>
                        <TD className="font-mono text-xs">{r.row_num}</TD>
                        <TD className="text-xs">{r.empresa_rut}</TD>
                        <TD className="text-xs font-medium">{r.bodega_nombre}</TD>
                        <TD className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-xs">{r.bodega_direccion}</TD>
                        <TD className="text-xs font-medium">{r.sede_nombre}</TD>
                        <TD className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-xs">{r.sede_direccion}</TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
            </div>
          )}

          {preview.filas_validas === 0 && (
            <EmptyState
              title="No hay filas válidas"
              description="El archivo no contiene filas válidas. Revisa los errores arriba y vuelve a intentar."
            />
          )}
        </Card>
      )}

      {step === 'preview' && preview && preview.filas_validas > 0 && (
        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={reset}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={busy}>
            {busy ? 'Importando...' : `Importar ${preview.filas_validas} fila${preview.filas_validas !== 1 ? 's' : ''}`}
          </Button>
        </div>
      )}

      {step === 'preview' && preview && preview.filas_validas === 0 && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={reset}>
            Volver a subir
          </Button>
        </div>
      )}

      {result && step === 'done' && (
        <Card padded>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">3. Resultado</h2>
          <div className="flex flex-wrap gap-4 mb-4">
            <Stat label="Bodegas creadas" value={result.created_bodega_count} color="green" />
            <Stat label="Bodegas actualizadas" value={result.updated_bodega_count} color="yellow" />
            <Stat label="Sedes creadas" value={result.created_sede_count} color="green" />
            <Stat label="Sedes actualizadas" value={result.updated_sede_count} color="yellow" />
          </div>
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="outline" size="sm" onClick={reset}>
              Importar más
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              Limpiar
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'gray' }: { label: string; value: number; color?: 'green' | 'yellow' | 'red' | 'gray' }) {
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
