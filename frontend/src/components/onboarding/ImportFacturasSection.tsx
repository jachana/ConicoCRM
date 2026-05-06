import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Upload, FileSpreadsheet, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../lib/api'
import { Button, Card, Table, THead, TBody, TR, TH, TD } from '../ui'
import { Stat } from './StatCard'

interface FacturaLinea {
  sku: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  exento: boolean
}

interface FacturaGroup {
  folio: number
  tipo_dte: string
  rut_receptor: string
  rut_empresa: string | null
  fecha_emision: string
  neto: number
  iva: number
  total: number
  estado_pago: string
  status: 'crear' | 'omitir'
  cliente_stub: boolean
  row_num: number
  lineas: FacturaLinea[]
}

interface InvalidRow {
  row_num: number
  folio_raw: string | null
  sheet: string
  motivo: string
}

interface PreviewResp {
  total_docs: number
  docs_validos: number
  docs_invalidos: number
  a_crear: number
  a_omitir: number
  stubs_a_crear: number
  facturas: FacturaGroup[]
  invalid_rows: InvalidRow[]
}

interface FacturaGroupResult extends FacturaGroup {
  import_status: 'crear' | 'omitir' | 'error'
  factura_id?: number
}

interface ImportReport {
  created_count: number
  omitted_count: number
  error_count: number
  stubs_created: number
  total_docs: number
  facturas: FacturaGroupResult[]
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

function tipoDteLabel(tipo: string): string {
  const labels: Record<string, string> = {
    '033': 'Factura Afecta',
    '034': 'Factura Exenta',
    '039': 'Boleta Afecta',
    '041': 'Boleta Exenta',
  }
  return labels[tipo] ?? tipo
}

export function ImportFacturasSection() {
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
      const resp = await api.post<PreviewResp>('/api/onboarding/facturas-historicas/preview', fd, {
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
      const resp = await api.post<ImportResp>('/api/onboarding/facturas-historicas/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(resp.data.report)
      setStep('done')
      const { created_count, omitted_count, error_count, stubs_created } = resp.data.report
      toast.success(
        `${created_count} factura${created_count !== 1 ? 's' : ''} importada${created_count !== 1 ? 's' : ''}` +
        (omitted_count ? ` — ${omitted_count} omitida${omitted_count !== 1 ? 's' : ''}` : '') +
        (stubs_created ? `, ${stubs_created} stub${stubs_created !== 1 ? 's' : ''} creado${stubs_created !== 1 ? 's' : ''}` : '') +
        (error_count ? `, ${error_count} con error` : '')
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
      const resp = await api.get('/api/onboarding/facturas-historicas/template', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_facturas_historicas.xlsx'
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
          Descarga la plantilla con dos hojas ('Cabecera DTE' y 'Detalle DTE'), complétala con tus DTEs históricos
          y súbela. Los documentos se registran como origen externo — no se reemiten al SII. Columnas:{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">tipo_dte</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">folio</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">rut_receptor</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">fecha_emision</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">neto</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">iva</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">total</code>.
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
            <Stat label="Total Docs" value={preview.total_docs} />
            <Stat label="A crear" value={preview.a_crear} color="green" />
            <Stat label="A omitir (ya existen)" value={preview.a_omitir} color="gray" />
            <Stat label="Stubs a crear" value={preview.stubs_a_crear} color={preview.stubs_a_crear > 0 ? 'yellow' : 'gray'} />
            <Stat label="Filas con error" value={preview.docs_invalidos} color={preview.docs_invalidos > 0 ? 'red' : 'gray'} />
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
                        {r.folio_raw && <span className="ml-2">(Folio {r.folio_raw})</span>}
                        {r.sheet && <span className="ml-1 text-red-500 dark:text-red-500">· {r.sheet}</span>}
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

          {preview.facturas.length > 0 && (
            <div className="overflow-x-auto">
              <Table density="compact">
                <THead>
                  <TR>
                    <TH>Folio</TH>
                    <TH>Tipo DTE</TH>
                    <TH>Fecha</TH>
                    <TH>RUT Receptor</TH>
                    <TH>Líneas</TH>
                    <TH>Total</TH>
                    <TH>Stub?</TH>
                    <TH>Acción</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.facturas.map((fac, idx) => (
                    <TR key={`${fac.folio}-${idx}`}>
                      <TD className="font-mono text-xs">{fac.folio}</TD>
                      <TD className="text-xs">{tipoDteLabel(fac.tipo_dte)}</TD>
                      <TD className="text-xs">{fac.fecha_emision}</TD>
                      <TD className="text-xs font-medium">
                        {fac.rut_receptor}
                        {fac.cliente_stub && (
                          <span className="ml-1.5 inline-flex items-center px-1 py-0 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            Stub
                          </span>
                        )}
                      </TD>
                      <TD className="text-xs text-center">{fac.lineas.length}</TD>
                      <TD className="text-xs text-right font-mono">{formatCLP(fac.total)}</TD>
                      <TD className="text-xs text-center">
                        {fac.cliente_stub ? (
                          <span className="text-amber-600 dark:text-amber-400">Sí</span>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">No</span>
                        )}
                      </TD>
                      <TD>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          fac.status === 'crear'
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          {fac.status === 'crear' ? 'Crear' : 'Omitir'}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}

          {preview.facturas.length === 0 && preview.a_crear === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              No hay documentos válidos a crear. Revisa los errores y vuelve a intentar.
            </p>
          )}
        </Card>
      )}

      {step === 'preview' && preview && preview.a_crear > 0 && (
        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={reset}>Cancelar</Button>
          <Button onClick={handleImport} disabled={busy}>
            {busy ? 'Importando...' : `Importar ${preview.a_crear} documento${preview.a_crear !== 1 ? 's' : ''}`}
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
            <Stat label="Facturas creadas" value={result.created_count} color="green" />
            <Stat label="Omitidas" value={result.omitted_count} color="gray" />
            <Stat label="Stubs creados" value={result.stubs_created} color={result.stubs_created > 0 ? 'yellow' : 'gray'} />
            <Stat label="Errores" value={result.error_count} color={result.error_count > 0 ? 'red' : 'gray'} />
          </div>
          <div className="overflow-x-auto">
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Folio</TH>
                  <TH>Tipo DTE</TH>
                  <TH>Fecha</TH>
                  <TH>RUT Receptor</TH>
                  <TH>Total</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {result.facturas.map((fac, idx) => (
                  <TR key={`${fac.folio}-${idx}`}>
                    <TD className="font-mono text-xs">{fac.folio}</TD>
                    <TD className="text-xs">{tipoDteLabel(fac.tipo_dte)}</TD>
                    <TD className="text-xs">{fac.fecha_emision}</TD>
                    <TD className="text-xs font-medium">{fac.rut_receptor}</TD>
                    <TD className="text-xs text-right font-mono">{formatCLP(fac.total)}</TD>
                    <TD>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${
                        fac.import_status === 'crear'
                          ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                          : fac.import_status === 'error'
                          ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                          : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
                      }`}>
                        {fac.import_status === 'crear' ? 'Creada' : fac.import_status === 'error' ? 'Error' : 'Omitida'}
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
