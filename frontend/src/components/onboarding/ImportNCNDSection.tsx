import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Upload, FileSpreadsheet, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../lib/api'
import { Button, Card, Table, THead, TBody, TR, TH, TD } from '../ui'
import { Stat } from './StatCard'

interface NCNDValid {
  tipo: string
  folio: number
  fecha: string
  motivo: string
  neto: number
  iva: number
  total: number
  folio_referencia: number | null
  tipo_referencia: number | null
  status: 'crear' | 'omitir'
  pendiente_ref: boolean
  row_num: number
}

interface NCNDInvalid {
  row_num: number
  folio_raw: string | null
  tipo_raw: string | null
  motivo: string
}

interface PreviewResp {
  valid: NCNDValid[]
  invalid: NCNDInvalid[]
  a_crear: number
  a_omitir: number
  invalid_count: number
  pendiente_ref: number
}

interface ImportResult {
  tipo: string
  folio: number
  import_status: 'creado' | 'creado_pendiente' | 'omitido' | 'error'
  motivo?: string
}

interface ImportResp {
  created: number
  omitted: number
  pendiente_ref: number
  errors: number
  results: ImportResult[]
}

function formatCLP(value: number): string {
  return `$ ${value.toLocaleString('es-CL')}`
}

export function ImportNCNDSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle')
  const [preview, setPreview] = useState<PreviewResp | null>(null)
  const [result, setResult] = useState<ImportResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set())
  const [dragActive, setDragActive] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    reset()
    setFile(f)
    e.target.value = ''
  }

  function handleDragEnter(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); setDragActive(true) }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); setDragActive(false) }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation() }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (!f || !f.name.endsWith('.xlsx')) { toast.error('Solo se permiten archivos .xlsx'); return }
    reset()
    setFile(f)
  }

  async function handlePreview() {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const resp = await api.post<PreviewResp>('/api/onboarding/nc-nd-historicas/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(resp.data)
      setStep('preview')
      setExpandedRows(new Set())
      setExpandedErrors(new Set())
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      toast.error(axiosErr?.response?.data?.detail ?? 'Error al previsualizar')
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
      const resp = await api.post<ImportResp>('/api/onboarding/nc-nd-historicas/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(resp.data)
      setStep('done')
      const { created, omitted, errors } = resp.data
      toast.success(
        `NC/ND importadas — ${created} creada${created !== 1 ? 's' : ''}${omitted ? `, ${omitted} omitida${omitted !== 1 ? 's' : ''}` : ''}${errors ? `, ${errors} con error` : ''}`
      )
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      toast.error(axiosErr?.response?.data?.detail ?? 'Error al importar')
      setStep('preview')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadTemplate() {
    try {
      const resp = await api.get('/api/onboarding/nc-nd-historicas/template', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_nc_nd_historicas.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
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
    setExpandedRows(new Set())
    setExpandedErrors(new Set())
  }

  function toggleRow(rowNum: number) {
    const s = new Set(expandedRows)
    s.has(rowNum) ? s.delete(rowNum) : s.add(rowNum)
    setExpandedRows(s)
  }

  function toggleError(rowNum: number) {
    const s = new Set(expandedErrors)
    s.has(rowNum) ? s.delete(rowNum) : s.add(rowNum)
    setExpandedErrors(s)
  }

  return (
    <div className="space-y-4">
      <Card padded>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">1. Plantilla y archivo</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Descarga la plantilla, completa las NC/ND históricas y vuelve a subir. Columnas requeridas:{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">tipo</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">folio</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">fecha</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">motivo</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">total</code>.
          Tipo debe ser <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">NC</code> o{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">ND</code>.
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
            <Stat label="Total filas válidas" value={preview.valid.length} />
            <Stat label="A crear" value={preview.a_crear} color="green" />
            <Stat label="A omitir (ya existen)" value={preview.a_omitir} color="gray" />
            <Stat label="Filas inválidas" value={preview.invalid_count} color={preview.invalid_count > 0 ? 'red' : 'gray'} />
            <Stat label="Pendientes (ref. no encontrada)" value={preview.pendiente_ref} color={preview.pendiente_ref > 0 ? 'yellow' : 'gray'} />
          </div>

          {preview.invalid.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Filas con errores ({preview.invalid.length}):</p>
              {preview.invalid.map((r) => (
                <div key={r.row_num} className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleError(r.row_num)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3.5 h-3.5 text-red-700 dark:text-red-400 shrink-0" />
                      <span className="text-xs text-red-700 dark:text-red-400 font-medium">
                        Fila {r.row_num}
                        {r.folio_raw && <span className="ml-2">(Folio {r.folio_raw})</span>}
                        {r.tipo_raw && <span className="ml-2">· {r.tipo_raw}</span>}
                      </span>
                    </div>
                    {expandedErrors.has(r.row_num) ? (
                      <ChevronUp className="w-3.5 h-3.5 text-red-700 dark:text-red-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-red-700 dark:text-red-400 shrink-0" />
                    )}
                  </button>
                  {expandedErrors.has(r.row_num) && (
                    <div className="px-3 py-2 border-t border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-700 dark:text-red-400">{r.motivo}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {preview.valid.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Filas válidas ({preview.valid.length}):</p>
              {preview.valid.map((row) => (
                <div key={row.row_num} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleRow(row.row_num)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3 text-xs text-gray-700 dark:text-gray-300 min-w-0">
                      <span className="font-mono font-medium shrink-0">{row.tipo} {row.folio}</span>
                      <span className="text-gray-500 shrink-0">{row.fecha}</span>
                      <span className="text-gray-500 truncate">{row.motivo}</span>
                      <span className="font-mono shrink-0">{formatCLP(row.total)}</span>
                      {row.pendiente_ref && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded font-medium bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400">
                          Ref. pendiente
                        </span>
                      )}
                      <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${
                        row.status === 'crear'
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {row.status === 'crear' ? 'Crear' : 'Omitir'}
                      </span>
                    </div>
                    {expandedRows.has(row.row_num) ? (
                      <ChevronUp className="w-3.5 h-3.5 text-gray-500 shrink-0 ml-2" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0 ml-2" />
                    )}
                  </button>
                  {expandedRows.has(row.row_num) && (
                    <div className="border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
                      <Table density="compact">
                        <THead>
                          <TR>
                            <TH>Tipo</TH>
                            <TH>Folio</TH>
                            <TH>Fecha</TH>
                            <TH>Motivo</TH>
                            <TH>Neto</TH>
                            <TH>IVA</TH>
                            <TH>Total</TH>
                            <TH>Folio Ref.</TH>
                          </TR>
                        </THead>
                        <TBody>
                          <TR>
                            <TD className="text-xs font-medium">{row.tipo}</TD>
                            <TD className="font-mono text-xs">{row.folio}</TD>
                            <TD className="text-xs">{row.fecha}</TD>
                            <TD className="text-xs">{row.motivo}</TD>
                            <TD className="text-xs text-right font-mono">{formatCLP(row.neto)}</TD>
                            <TD className="text-xs text-right font-mono">{formatCLP(row.iva)}</TD>
                            <TD className="text-xs text-right font-mono">{formatCLP(row.total)}</TD>
                            <TD className="text-xs font-mono">{row.folio_referencia ?? '—'}</TD>
                          </TR>
                        </TBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {preview.valid.length === 0 && preview.a_crear === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              No hay NC/ND válidas a crear. Revisa los errores y vuelve a intentar.
            </p>
          )}
        </Card>
      )}

      {step === 'preview' && preview && preview.a_crear > 0 && (
        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={reset}>Cancelar</Button>
          <Button onClick={handleImport} disabled={busy}>
            {busy ? 'Importando...' : `Importar ${preview.a_crear} NC/ND histórica${preview.a_crear !== 1 ? 's' : ''}`}
          </Button>
        </div>
      )}

      {step === 'preview' && preview && preview.a_crear === 0 && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={reset}>Volver a subir</Button>
        </div>
      )}

      {result && step === 'done' && (
        <Card padded>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">3. Resultado</h2>
          <div className="flex flex-wrap gap-4 mb-4">
            <Stat label="NC/ND creadas" value={result.created} color="green" />
            <Stat label="NC/ND omitidas" value={result.omitted} color="gray" />
            <Stat label="Pendientes ref." value={result.pendiente_ref} color={result.pendiente_ref > 0 ? 'yellow' : 'gray'} />
            <Stat label="Errores" value={result.errors} color={result.errors > 0 ? 'red' : 'gray'} />
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Tipo</TH>
                  <TH>Folio</TH>
                  <TH>Estado</TH>
                  <TH>Motivo</TH>
                </TR>
              </THead>
              <TBody>
                {result.results.map((r, idx) => (
                  <TR key={`${r.tipo}-${r.folio}-${idx}`}>
                    <TD className="text-xs font-medium">{r.tipo}</TD>
                    <TD className="font-mono text-xs">{r.folio}</TD>
                    <TD>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${
                        r.import_status === 'creado'
                          ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                          : r.import_status === 'creado_pendiente'
                          ? 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                          : r.import_status === 'error'
                          ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                          : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
                      }`}>
                        {r.import_status === 'creado'
                          ? 'Creado'
                          : r.import_status === 'creado_pendiente'
                          ? 'Creado (ref. pendiente)'
                          : r.import_status === 'error'
                          ? 'Error'
                          : 'Omitido'}
                      </span>
                    </TD>
                    <TD className="text-xs text-gray-500 dark:text-gray-400">{r.motivo ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="outline" size="sm" onClick={reset}>Nueva importación</Button>
            <Button variant="ghost" size="sm" onClick={reset}>Limpiar</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
