import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Upload, FileSpreadsheet, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../lib/api'
import { Button, Card, Table, THead, TBody, TR, TH, TD } from '../ui'
import { Stat } from './StatCard'

interface OCLinea {
  sku: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  total_neto_linea: number
}

interface OCGroup {
  numero_oc: number
  rut_proveedor: string
  fecha: string
  estado: string
  nota: string | null
  total_neto: number
  iva: number
  total: number
  status: 'crear' | 'omitir'
  row_num: number
  lineas: OCLinea[]
}

interface InvalidRow {
  row_num: number
  numero_oc: string | null
  sheet: string
  motivo: string
}

interface PreviewResp {
  total_ocs: number
  ocs_validas: number
  ocs_invalidas: number
  a_crear: number
  a_omitir: number
  ocs: OCGroup[]
  invalid_rows: InvalidRow[]
}

interface OCGroupResult extends OCGroup {
  import_status: 'crear' | 'omitir' | 'error'
  oc_id?: number
}

interface ImportReport {
  created_count: number
  omitted_count: number
  error_count: number
  total_ocs: number
  ocs: OCGroupResult[]
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

export function ImportOCSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle')
  const [preview, setPreview] = useState<PreviewResp | null>(null)
  const [result, setResult] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [expandedOCs, setExpandedOCs] = useState<Set<number>>(new Set())
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
      const resp = await api.post<PreviewResp>('/api/onboarding/oc-historicas/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(resp.data)
      setStep('preview')
      setExpandedOCs(new Set())
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
      const resp = await api.post<ImportResp>('/api/onboarding/oc-historicas/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(resp.data.report)
      setStep('done')
      const { created_count, omitted_count, error_count } = resp.data.report
      toast.success(
        `OCs importadas — ${created_count} creada${created_count !== 1 ? 's' : ''}${omitted_count ? `, ${omitted_count} omitida${omitted_count !== 1 ? 's' : ''}` : ''}${error_count ? `, ${error_count} con error` : ''}`
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
      const resp = await api.get('/api/onboarding/oc-historicas/template', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_oc_historicas.xlsx'
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
    setExpandedOCs(new Set())
    setExpandedErrors(new Set())
  }

  function toggleOC(rowNum: number) {
    const s = new Set(expandedOCs)
    s.has(rowNum) ? s.delete(rowNum) : s.add(rowNum)
    setExpandedOCs(s)
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
          Descarga la plantilla, completa las OC históricas y vuelve a subir. Dos hojas:{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">Cabecera OC</code> y{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">Detalle OC</code> vinculadas por{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">numero_oc</code>.
          Requiere proveedores y productos precargados.
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
            <Stat label="Total OCs" value={preview.total_ocs} />
            <Stat label="Válidas" value={preview.ocs_validas} color="green" />
            <Stat label="A crear" value={preview.a_crear} color="green" />
            <Stat label="A omitir (ya existen)" value={preview.a_omitir} color="gray" />
            <Stat label="Filas con error" value={preview.ocs_invalidas} color={preview.ocs_invalidas > 0 ? 'red' : 'gray'} />
          </div>

          {preview.invalid_rows.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Filas con errores ({preview.invalid_rows.length}):</p>
              {preview.invalid_rows.map((r) => (
                <div key={`${r.sheet}-${r.row_num}`} className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleError(r.row_num)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3.5 h-3.5 text-red-700 dark:text-red-400 shrink-0" />
                      <span className="text-xs text-red-700 dark:text-red-400 font-medium">
                        Hoja "{r.sheet}" · Fila {r.row_num}
                        {r.numero_oc && <span className="ml-2">(OC {r.numero_oc})</span>}
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

          {preview.ocs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">OCs válidas ({preview.ocs.length}):</p>
              {preview.ocs.map((oc) => (
                <div key={oc.row_num} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleOC(oc.row_num)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3 text-xs text-gray-700 dark:text-gray-300 min-w-0">
                      <span className="font-mono font-medium shrink-0">OC {oc.numero_oc}</span>
                      <span className="text-gray-500 shrink-0">{oc.fecha}</span>
                      <span className="text-gray-500 shrink-0">{oc.rut_proveedor}</span>
                      <span className="capitalize text-gray-500 shrink-0">{oc.estado}</span>
                      <span className="font-mono shrink-0">{formatCLP(oc.total)}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${
                        oc.status === 'crear'
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {oc.status === 'crear' ? 'Crear' : 'Omitir'}
                      </span>
                      <span className="text-gray-400 shrink-0">{oc.lineas.length} línea{oc.lineas.length !== 1 ? 's' : ''}</span>
                    </div>
                    {expandedOCs.has(oc.row_num) ? (
                      <ChevronUp className="w-3.5 h-3.5 text-gray-500 shrink-0 ml-2" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0 ml-2" />
                    )}
                  </button>
                  {expandedOCs.has(oc.row_num) && (
                    <div className="border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
                      <Table density="compact">
                        <THead>
                          <TR>
                            <TH>SKU</TH>
                            <TH>Descripción</TH>
                            <TH>Cant.</TH>
                            <TH>P.Unitario</TH>
                            <TH>Desc.%</TH>
                            <TH>Total Neto</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {oc.lineas.map((linea, idx) => (
                            <TR key={idx}>
                              <TD className="font-mono text-xs">{linea.sku ?? '—'}</TD>
                              <TD className="text-xs">{linea.descripcion}</TD>
                              <TD className="text-xs text-right">{linea.cantidad}</TD>
                              <TD className="text-xs text-right font-mono">{formatCLP(linea.precio_unitario)}</TD>
                              <TD className="text-xs text-right">{linea.descuento}%</TD>
                              <TD className="text-xs text-right font-mono">{formatCLP(linea.total_neto_linea)}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {preview.ocs.length === 0 && preview.a_crear === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              No hay OCs válidas a crear. Revisa los errores y vuelve a intentar.
            </p>
          )}
        </Card>
      )}

      {step === 'preview' && preview && preview.a_crear > 0 && (
        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={reset}>Cancelar</Button>
          <Button onClick={handleImport} disabled={busy}>
            {busy ? 'Importando...' : `Importar ${preview.a_crear} OC históricas`}
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
            <Stat label="OCs creadas" value={result.created_count} color="green" />
            <Stat label="OCs omitidas" value={result.omitted_count} color="gray" />
            <Stat label="Errores" value={result.error_count} color={result.error_count > 0 ? 'red' : 'gray'} />
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table density="compact">
              <THead>
                <TR>
                  <TH>N° OC</TH>
                  <TH>Fecha</TH>
                  <TH>RUT Proveedor</TH>
                  <TH>Total</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {result.ocs.map((oc, idx) => (
                  <TR key={`${oc.numero_oc}-${idx}`}>
                    <TD className="font-mono text-xs">{oc.numero_oc}</TD>
                    <TD className="text-xs">{oc.fecha}</TD>
                    <TD className="text-xs font-medium">{oc.rut_proveedor}</TD>
                    <TD className="text-xs text-right font-mono">{formatCLP(oc.total)}</TD>
                    <TD>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${
                        oc.import_status === 'crear'
                          ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                          : oc.import_status === 'error'
                          ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                          : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
                      }`}>
                        {oc.import_status === 'crear' ? 'Creada' : oc.import_status === 'error' ? 'Error' : 'Omitida'}
                      </span>
                    </TD>
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
