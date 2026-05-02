import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Upload, FileSpreadsheet, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../lib/api'
import { Button, Card, Table, THead, TBody, TR, TH, TD } from '../ui'
import { Stat } from './StatCard'

interface CotizacionLinea {
  sku: string | null
  descripcion: string
  formato: string | null
  cantidad: number
  precio: number
  descuento: number
}

interface CotizacionGroup {
  numero_cot: string | null
  rut_cliente: string
  rut_empresa: string | null
  fecha: string
  vigencia_hasta: string | null
  estado: string
  vendedor_email: string | null
  status: 'crear' | 'omitir'
  row_nums: number[]
  total_neto: number
  total_iva: number
  total: number
  lineas: CotizacionLinea[]
}

interface InvalidRow {
  row_num: number
  numero_cot: string | null
  motivo: string
}

interface PreviewResp {
  total_cots: number
  cots_validas: number
  cots_invalidas: number
  a_crear: number
  a_omitir: number
  cotizaciones: CotizacionGroup[]
  invalid_rows: InvalidRow[]
}

interface CotizacionGroupResult extends CotizacionGroup {
  import_status: 'crear' | 'omitir' | 'error'
  cot_id?: number
}

interface ImportReport {
  created_count: number
  omitted_count: number
  error_count: number
  total_cots: number
  cotizaciones: CotizacionGroupResult[]
}

interface ImportResp {
  status: 'success' | 'partial' | 'error'
  import_id: string
  timestamp: string
  report: ImportReport
}

function formatCLP(value: number): string {
  return `$ ${value.toLocaleString('es-CL')}`
}

export function ImportCotizacionesSection() {
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
      const resp = await api.post<PreviewResp>('/api/onboarding/cotizaciones-abiertas/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(resp.data)
      setStep('preview')
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
      const resp = await api.post<ImportResp>('/api/onboarding/cotizaciones-abiertas/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(resp.data.report)
      setStep('done')
      const { created_count, omitted_count, error_count } = resp.data.report
      toast.success(
        `Cotizaciones importadas — ${created_count} creada${created_count !== 1 ? 's' : ''}${omitted_count ? `, ${omitted_count} omitida${omitted_count !== 1 ? 's' : ''}` : ''}${error_count ? `, ${error_count} con error` : ''}`
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
      const resp = await api.get('/api/onboarding/cotizaciones-abiertas/template', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_cotizaciones_abiertas.xlsx'
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
    setExpandedErrors(new Set())
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
          Descarga la plantilla, complétala con las cotizaciones pendientes y súbela. Columnas:{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">numero_cot</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">rut_cliente</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">fecha</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">vendedor_email</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">descripcion</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">cantidad</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">precio</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">descuento</code>.
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
            <Stat label="Total Cots" value={preview.total_cots} />
            <Stat label="A crear" value={preview.a_crear} color="green" />
            <Stat label="A omitir (ya existen)" value={preview.a_omitir} color="gray" />
            <Stat label="Filas con error" value={preview.cots_invalidas} color={preview.cots_invalidas > 0 ? 'red' : 'gray'} />
          </div>

          {preview.invalid_rows.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Filas con errores ({preview.invalid_rows.length}):</p>
              {preview.invalid_rows.map((r) => (
                <div key={r.row_num} className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleError(r.row_num)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3.5 h-3.5 text-red-700 dark:text-red-400 shrink-0" />
                      <span className="text-xs text-red-700 dark:text-red-400 font-medium">
                        Fila {r.row_num}
                        {r.numero_cot && <span className="ml-2">(Cot {r.numero_cot})</span>}
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

          {preview.cotizaciones.length > 0 && (
            <div className="overflow-x-auto">
              <Table density="compact">
                <THead>
                  <TR>
                    <TH>N° Cot</TH>
                    <TH>Fecha</TH>
                    <TH>RUT Cliente</TH>
                    <TH>Vendedor</TH>
                    <TH>Líneas</TH>
                    <TH>Total</TH>
                    <TH>Acción</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.cotizaciones.map((cot, idx) => (
                    <TR key={`${cot.numero_cot ?? ''}-${idx}`}>
                      <TD className="font-mono text-xs">{cot.numero_cot ?? '—'}</TD>
                      <TD className="text-xs">{cot.fecha}</TD>
                      <TD className="text-xs font-medium">{cot.rut_cliente}</TD>
                      <TD className="text-xs">{cot.vendedor_email ?? '—'}</TD>
                      <TD className="text-xs text-center">{cot.lineas.length}</TD>
                      <TD className="text-xs text-right font-mono">{formatCLP(cot.total)}</TD>
                      <TD>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          cot.status === 'crear'
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          {cot.status === 'crear' ? 'Crear' : 'Omitir'}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}

          {preview.cotizaciones.length === 0 && preview.a_crear === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              No hay cotizaciones válidas a crear. Revisa los errores y vuelve a intentar.
            </p>
          )}
        </Card>
      )}

      {step === 'preview' && preview && preview.a_crear > 0 && (
        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={reset}>Cancelar</Button>
          <Button onClick={handleImport} disabled={busy}>
            {busy ? 'Importando...' : `Importar ${preview.a_crear} cotización${preview.a_crear !== 1 ? 'es' : ''}`}
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
            <Stat label="Cots creadas" value={result.created_count} color="green" />
            <Stat label="Cots omitidas" value={result.omitted_count} color="gray" />
            <Stat label="Errores" value={result.error_count} color={result.error_count > 0 ? 'red' : 'gray'} />
          </div>
          <div className="overflow-x-auto">
            <Table density="compact">
              <THead>
                <TR>
                  <TH>N° Cot</TH>
                  <TH>Fecha</TH>
                  <TH>RUT Cliente</TH>
                  <TH>Total</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {result.cotizaciones.map((cot, idx) => (
                  <TR key={`${cot.numero_cot ?? ''}-${idx}`}>
                    <TD className="font-mono text-xs">{cot.numero_cot ?? '—'}</TD>
                    <TD className="text-xs">{cot.fecha}</TD>
                    <TD className="text-xs font-medium">{cot.rut_cliente}</TD>
                    <TD className="text-xs text-right font-mono">{formatCLP(cot.total)}</TD>
                    <TD>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${
                        cot.import_status === 'crear'
                          ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                          : cot.import_status === 'error'
                          ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                          : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
                      }`}>
                        {cot.import_status === 'crear' ? 'Creada' : cot.import_status === 'error' ? 'Error' : 'Omitida'}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="outline" size="sm" onClick={reset}>Importar más</Button>
            <Button variant="ghost" size="sm" onClick={reset}>Limpiar</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
