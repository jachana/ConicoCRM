import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Upload, FileSpreadsheet, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../lib/api'
import { Button, Card, Table, THead, TBody, TR, TH, TD } from '../ui'
import { Stat } from './StatCard'

interface GDLine {
  sku: string | null
  cantidad: number
}

interface GDValid {
  folio_guia: number
  rut_receptor: string | null
  fecha: string
  tipo_traslado: number
  sede_destino: string | null
  folio_factura: number | null
  status: 'crear' | 'omitir'
  row_num: number
  lineas_count: number
  lineas: GDLine[]
  cliente_encontrado: boolean | null
  factura_encontrada: boolean | null
}

interface GDInvalid {
  row_num: number
  folio_guia: string | null
  sheet: string
  motivo: string
}

interface PreviewResp {
  valid: GDValid[]
  invalid: GDInvalid[]
  a_crear: number
  a_omitir: number
  invalid_count: number
  sin_cliente: number
  factura_encontrada: number
  factura_pendiente: number
}

interface ImportResult {
  folio_guia: number
  import_status: 'creado' | 'creado_factura_ok' | 'creado_factura_pendiente' | 'omitido' | 'error'
  motivo?: string
}

interface ImportReport {
  created_count: number
  omitted_count: number
  error_count: number
  total_rows: number
  rows: ImportResult[]
}

interface ImportResp {
  status: string
  import_id: string
  timestamp: string
  report: ImportReport
}

export function ImportGDSection() {
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
      const resp = await api.post<PreviewResp>('/api/onboarding/guias-despacho-historicas/preview', fd, {
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
      const resp = await api.post<ImportResp>('/api/onboarding/guias-despacho-historicas/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(resp.data)
      setStep('done')
      const { created_count, omitted_count, error_count } = resp.data.report
      toast.success(
        `GDs importadas — ${created_count} creada${created_count !== 1 ? 's' : ''}${omitted_count ? `, ${omitted_count} omitida${omitted_count !== 1 ? 's' : ''}` : ''}${error_count ? `, ${error_count} con error` : ''}`
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
      const resp = await api.get('/api/onboarding/guias-despacho-historicas/template', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_guias_despacho_historicas.xlsx'
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
          Descarga la plantilla Excel con dos hojas: <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">Cabecera GD</code> y{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">Detalle GD</code>.
          Cabecera requiere: <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">folio_guia</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">fecha</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">tipo_traslado</code>.
          Detalle requiere: <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">folio_guia</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">cantidad</code>.
          Las GDs importadas no reemiten SII y no descuentan stock.
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
            <span className="text-gray-500 dark:text-gray-400 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
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
            <Stat label="Total GDs válidas" value={preview.valid.length} />
            <Stat label="A crear" value={preview.a_crear} color="green" />
            <Stat label="A omitir (ya existen)" value={preview.a_omitir} color="gray" />
            <Stat label="Filas inválidas" value={preview.invalid_count} color={preview.invalid_count > 0 ? 'red' : 'gray'} />
            <Stat label="Sin cliente" value={preview.sin_cliente} color={preview.sin_cliente > 0 ? 'yellow' : 'gray'} />
            {preview.factura_pendiente > 0 && (
              <Stat label="Factura pendiente" value={preview.factura_pendiente} color="yellow" />
            )}
          </div>

          {preview.invalid.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Filas con errores ({preview.invalid.length}):</p>
              {preview.invalid.map((r) => (
                <div key={`${r.sheet}-${r.row_num}`} className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleError(r.row_num)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3.5 h-3.5 text-red-700 dark:text-red-400 shrink-0" />
                      <span className="text-xs text-red-700 dark:text-red-400 font-medium">
                        Fila {r.row_num} [{r.sheet}]
                        {r.folio_guia && <span className="ml-2">(Folio {r.folio_guia})</span>}
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
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">GDs válidas ({preview.valid.length}):</p>
              {preview.valid.map((row) => (
                <div key={row.row_num} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleRow(row.row_num)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3 text-xs text-gray-700 dark:text-gray-300 min-w-0">
                      <span className="font-mono font-medium shrink-0">GD {row.folio_guia}</span>
                      <span className="text-gray-500 shrink-0">{row.fecha}</span>
                      <span className="text-gray-500 shrink-0">Tipo {row.tipo_traslado}</span>
                      {row.sede_destino && <span className="text-gray-500 truncate">{row.sede_destino}</span>}
                      <span className="text-gray-500 dark:text-gray-400 shrink-0">{row.lineas_count} línea{row.lineas_count !== 1 ? 's' : ''}</span>
                      {row.cliente_encontrado === false && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded font-medium bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400">
                          Sin cliente
                        </span>
                      )}
                      {row.factura_encontrada === false && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded font-medium bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400">
                          Factura pendiente
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
                            <TH>Folio GD</TH>
                            <TH>Fecha</TH>
                            <TH>Tipo</TH>
                            <TH>RUT Receptor</TH>
                            <TH>Sede</TH>
                            <TH>Folio Factura</TH>
                            <TH>Líneas</TH>
                          </TR>
                        </THead>
                        <TBody>
                          <TR>
                            <TD className="font-mono text-xs">{row.folio_guia}</TD>
                            <TD className="text-xs">{row.fecha}</TD>
                            <TD className="text-xs">{row.tipo_traslado}</TD>
                            <TD className="font-mono text-xs">{row.rut_receptor ?? '—'}</TD>
                            <TD className="text-xs">{row.sede_destino ?? '—'}</TD>
                            <TD className="font-mono text-xs">{row.folio_factura ?? '—'}</TD>
                            <TD className="text-xs">{row.lineas.map(l => `${l.sku ?? '?'} ×${l.cantidad}`).join(', ') || '—'}</TD>
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
              No hay GDs válidas a crear. Revisa los errores y vuelve a intentar.
            </p>
          )}
        </Card>
      )}

      {step === 'preview' && preview && preview.a_crear > 0 && (
        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={reset}>Cancelar</Button>
          <Button onClick={handleImport} disabled={busy}>
            {busy ? 'Importando...' : `Importar ${preview.a_crear} GD histórica${preview.a_crear !== 1 ? 's' : ''}`}
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
            <Stat label="GDs creadas" value={result.report.created_count} color="green" />
            <Stat label="GDs omitidas" value={result.report.omitted_count} color="gray" />
            <Stat label="Errores" value={result.report.error_count} color={result.report.error_count > 0 ? 'red' : 'gray'} />
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Folio GD</TH>
                  <TH>Estado</TH>
                  <TH>Motivo</TH>
                </TR>
              </THead>
              <TBody>
                {result.report.rows.map((r, idx) => (
                  <TR key={`${r.folio_guia}-${idx}`}>
                    <TD className="font-mono text-xs">{r.folio_guia}</TD>
                    <TD>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${
                        r.import_status === 'creado' || r.import_status === 'creado_factura_ok'
                          ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                          : r.import_status === 'creado_factura_pendiente'
                          ? 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                          : r.import_status === 'error'
                          ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                          : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
                      }`}>
                        {r.import_status === 'creado'
                          ? 'Creado'
                          : r.import_status === 'creado_factura_ok'
                          ? 'Creado (factura vinculada)'
                          : r.import_status === 'creado_factura_pendiente'
                          ? 'Creado (factura pendiente)'
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
