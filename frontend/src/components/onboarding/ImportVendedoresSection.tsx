import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Upload, FileSpreadsheet, Key, XCircle, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { api } from '../../lib/api'
import { Button, Card, Table, THead, TBody, TR, TH, TD } from '../ui'
import { Stat } from './StatCard'

interface PreviewRow {
  row_num: number
  email: string
  nombre: string
  rol: string
  status: 'valid' | 'invalid'
  errors: string[]
}

interface PreviewResp {
  total_filas: number
  filas_validas: number
  filas_invalidas: number
  a_crear: number
  a_actualizar: number
  rows: PreviewRow[]
}

interface ImportResultRow {
  row_num: number
  email: string
  nombre: string
  rol: string
  status: 'created' | 'updated' | 'error'
  errors: string[]
  temp_password: string | null
}

interface ImportReport {
  created_count: number
  updated_count: number
  error_count: number
  total_rows: number
  rows: ImportResultRow[]
}

interface ImportResp {
  status: 'success' | 'partial' | 'error'
  import_id: string
  timestamp: string
  report: ImportReport
}

const RESULT_STATUS_STYLE: Record<ImportResultRow['status'], string> = {
  created:  'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
  updated:  'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
  error:    'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
}

const RESULT_STATUS_LABEL: Record<ImportResultRow['status'], string> = {
  created: 'Creado',
  updated: 'Actualizado',
  error:   'Error',
}

export function ImportVendedoresSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle')
  const [preview, setPreview] = useState<PreviewResp | null>(null)
  const [result, setResult] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set())
  const [dragActive, setDragActive] = useState(false)
  const [copiedRow, setCopiedRow] = useState<number | null>(null)

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
      fd.append('file', file)
      const resp = await api.post('/api/onboarding/usuarios/preview', fd, {
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
      fd.append('file', file)
      const resp = await api.post<ImportResp>('/api/onboarding/usuarios/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(resp.data.report)
      setStep('done')
      const { created_count, updated_count, error_count } = resp.data.report
      toast.success(
        `Importación completada — ${created_count} creados, ${updated_count} actualizados${error_count ? `, ${error_count} con error` : ''}`
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
      const resp = await api.get('/api/onboarding/usuarios/template', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_vendedores.xlsx'
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
    setCopiedRow(null)
  }

  function toggleErrorExpanded(rowNum: number) {
    const newSet = new Set(expandedErrors)
    if (newSet.has(rowNum)) {
      newSet.delete(rowNum)
    } else {
      newSet.add(rowNum)
    }
    setExpandedErrors(newSet)
  }

  function handleCopyPassword(rowNum: number, password: string) {
    navigator.clipboard.writeText(password).then(() => {
      setCopiedRow(rowNum)
      setTimeout(() => setCopiedRow(null), 2000)
    }).catch(() => toast.error('No se pudo copiar'))
  }

  const hasTempPasswords = result?.rows.some((r) => r.temp_password !== null) ?? false

  return (
    <div className="space-y-4">
      <Card padded>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">1. Plantilla y archivo</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Descarga la plantilla, completa los vendedores/usuarios y vuelve a subir el archivo. Columnas:{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">email</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">nombre</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">rol</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">rut</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">activo</code>.
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
            <Stat label="A crear" value={preview.a_crear} color="green" />
            <Stat label="A actualizar" value={preview.a_actualizar} color="yellow" />
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
                          {r.email && <span className="ml-2">({r.email})</span>}
                          {r.nombre && <span className="ml-2">{r.nombre}</span>}
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
                    <TH>Email</TH>
                    <TH>Nombre</TH>
                    <TH>Rol</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.rows
                    .filter((r) => r.status === 'valid')
                    .map((r) => (
                      <TR key={r.row_num}>
                        <TD className="font-mono text-xs">{r.row_num}</TD>
                        <TD className="text-xs font-medium">{r.email}</TD>
                        <TD className="text-xs">{r.nombre}</TD>
                        <TD className="text-xs text-gray-600 dark:text-gray-400">{r.rol}</TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
            </div>
          )}

          {preview.filas_validas === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              No hay filas válidas. Revisa los errores arriba y vuelve a intentar.
            </p>
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
            <Stat label="Creados" value={result.created_count} color="green" />
            <Stat label="Actualizados" value={result.updated_count} color="yellow" />
            <Stat label="Errores" value={result.error_count} color={result.error_count > 0 ? 'red' : 'gray'} />
          </div>

          {hasTempPasswords && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
              <Key className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                Guarda estas contraseñas — no se vuelven a mostrar.
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Fila</TH>
                  <TH>Email</TH>
                  <TH>Nombre</TH>
                  <TH>Rol</TH>
                  <TH>Estado</TH>
                  {hasTempPasswords && <TH>Contraseña temporal</TH>}
                  <TH>Detalles</TH>
                </TR>
              </THead>
              <TBody>
                {result.rows.map((r) => (
                  <TR key={r.row_num}>
                    <TD className="font-mono text-xs">{r.row_num}</TD>
                    <TD className="text-xs font-medium">{r.email}</TD>
                    <TD className="text-xs">{r.nombre}</TD>
                    <TD className="text-xs text-gray-600 dark:text-gray-400">{r.rol}</TD>
                    <TD>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${RESULT_STATUS_STYLE[r.status]}`}>
                        {RESULT_STATUS_LABEL[r.status]}
                      </span>
                    </TD>
                    {hasTempPasswords && (
                      <TD>
                        {r.temp_password ? (
                          <div className="flex items-center gap-1.5">
                            <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded select-all">
                              {r.temp_password}
                            </code>
                            <button
                              onClick={() => handleCopyPassword(r.row_num, r.temp_password!)}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              title="Copiar contraseña"
                              aria-label="Copiar contraseña"
                            >
                              <Copy className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                            </button>
                            {copiedRow === r.row_num && (
                              <span className="text-xs text-green-600 dark:text-green-400">Copiado</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </TD>
                    )}
                    <TD className="text-xs text-gray-500 dark:text-gray-400">
                      {r.errors.length > 0 ? r.errors.join('; ') : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
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
