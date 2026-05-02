import { useRef, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, Info } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Button, Card, Tabs, TabsList, TabsTrigger, TabsContent, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Skeleton } from '../components/ui'
import { PaymentImportSection } from '../components/onboarding/PaymentImportSection'
import { CAFUploadSection } from '../components/onboarding/CAFUploadSection'
import { ProductosImportSection } from '../components/onboarding/ProductosImportSection'
import { ImportBodegasSedesSection } from '../components/onboarding/ImportBodegasSedesSection'
import { ImportVendedoresSection } from '../components/onboarding/ImportVendedoresSection'
import { ImportStockSection } from '../components/onboarding/ImportStockSection'
import { Stat } from '../components/onboarding/StatCard'
import type { Empresa } from '../types'

type Estado = 'creada' | 'actualizada' | 'sin_cambio' | 'error'

interface PreviewError { fila: number; rut: string | null; razon_social: string | null; motivo: string }
interface PreviewFila { fila: number; rut: string; razon_social: string; accion: 'crear' | 'actualizar' }
interface PreviewResp {
  total_filas: number
  filas_validas: number
  filas_invalidas: number
  a_crear: number
  a_actualizar: number
  filas: PreviewFila[]
  errores: PreviewError[]
}

interface ImportDetalle { fila: number; rut: string | null; razon_social: string | null; estado: Estado; motivo: string | null }
interface ImportResp {
  creadas: number
  actualizadas: number
  sin_cambio: number
  errores: number
  detalles: ImportDetalle[]
}

// Clientes + Empresas types
interface ClientesEmpresasPreviewError { row_num: number; rut_empresa: string | null; nombre_empresa: string | null; rut_cliente: string | null; nombre_cliente: string | null; status: string; errors: string[] }
interface ClientesEmpresasPreviewFila { row_num: number; rut_empresa: string; nombre_empresa: string; rut_cliente: string; nombre_cliente: string; status: string; errors: string[] }
interface ClientesEmpresasPreviewResp {
  total_filas: number
  filas_validas: number
  filas_invalidas: number
  a_crear: { empresas: number; clientes: number }
  a_actualizar: { empresas: number; clientes: number }
  rows: ClientesEmpresasPreviewFila[]
}

interface ClientesEmpresasImportDetalle { row_num: number; rut_empresa: string | null; nombre_empresa: string | null; rut_cliente: string | null; nombre_cliente: string | null; status: string; errors: string[] }
interface ClientesEmpresasImportResp {
  status: 'success' | 'partial' | 'error'
  import_id: string
  timestamp: string
  report: {
    created_count: number
    updated_count: number
    error_count: number
    rows: ClientesEmpresasImportDetalle[]
  }
}

const ESTADO_STYLE: Record<Estado, { icon: React.ReactNode; cls: string }> = {
  creada:      { icon: <CheckCircle2 className="w-3.5 h-3.5" />, cls: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20' },
  actualizada: { icon: <Info className="w-3.5 h-3.5" />,         cls: 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' },
  sin_cambio:  { icon: <Info className="w-3.5 h-3.5" />,         cls: 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/20' },
  error:       { icon: <XCircle className="w-3.5 h-3.5" />,      cls: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20' },
}

export default function MigracionInicial() {
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<number | null>(null)

  const { data: empresas = [], isLoading: loadingEmpresas } = useQuery<Empresa[]>({
    queryKey: ['empresas'],
    queryFn: () => api.get('/api/empresas/').then((r) => r.data),
  })

  // Auto-select first empresa if available
  useEffect(() => {
    if (empresas.length > 0 && !selectedEmpresaId) {
      setSelectedEmpresaId(empresas[0].id)
    }
  }, [empresas, selectedEmpresaId])

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Migración Inicial</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Importa datos desde archivos Excel. Re-correr el mismo archivo es seguro — no genera duplicados.
        </p>
      </div>

      {/* Empresa selector for CAF tab */}
      {loadingEmpresas ? (
        <Skeleton className="h-10" />
      ) : empresas.length > 0 ? (
        <Card padded className="p-3">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-2">
            Empresa para CAF
          </label>
          <Select value={selectedEmpresaId?.toString()} onValueChange={(v) => setSelectedEmpresaId(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((emp) => (
                <SelectItem key={emp.id} value={emp.id.toString()}>
                  {emp.razon_social || emp.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
      ) : null}

      <Tabs defaultValue="proveedores">
        <TabsList variant="underline">
          <TabsTrigger value="proveedores">Proveedores</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="pagos">Historial de Pagos</TabsTrigger>
          <TabsTrigger value="clientes_empresas">Clientes + Empresas</TabsTrigger>
          <TabsTrigger value="bodegas_sedes">Bodegas + Sedes</TabsTrigger>
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
          <TabsTrigger value="stock">Stock inicial</TabsTrigger>
          <TabsTrigger value="cafs">CAF</TabsTrigger>
        </TabsList>
        <TabsContent value="proveedores">
          <ProveedoresImport />
        </TabsContent>
        <TabsContent value="productos">
          <ProductosImportSection />
        </TabsContent>
        <TabsContent value="pagos">
          <PaymentImportSection />
        </TabsContent>
        <TabsContent value="clientes_empresas">
          <ClientesEmpresasImport />
        </TabsContent>
        <TabsContent value="bodegas_sedes">
          <ImportBodegasSedesSection />
        </TabsContent>
        <TabsContent value="vendedores">
          <ImportVendedoresSection />
        </TabsContent>
        <TabsContent value="stock">
          <ImportStockSection />
        </TabsContent>
        <TabsContent value="cafs">
          {selectedEmpresaId ? (
            <CAFUploadSection empresaId={selectedEmpresaId} />
          ) : (
            <Card padded>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Selecciona una empresa para cargar CAFs.
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ProveedoresImport() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle')
  const [preview, setPreview] = useState<PreviewResp | null>(null)
  const [result, setResult] = useState<ImportResp | null>(null)
  const [busy, setBusy] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(null)
    setResult(null)
    setStep('idle')
    e.target.value = ''
  }

  async function handlePreview() {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const resp = await api.post('/api/proveedores/import/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(resp.data)
      setStep('preview')
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
      const resp = await api.post<ImportResp>('/api/proveedores/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(resp.data)
      setStep('done')
      const { creadas, actualizadas, errores } = resp.data
      toast.success(`Import completado — ${creadas} creadas, ${actualizadas} actualizadas${errores ? `, ${errores} con error` : ''}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Error al importar')
      setStep('preview')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadTemplate() {
    try {
      const resp = await api.get('/api/proveedores/import/template', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_proveedores.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al descargar plantilla')
    }
  }

  async function handleDownloadReport() {
    if (!result) return
    try {
      const resp = await api.post('/api/proveedores/import/report', result, { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'reporte_import_proveedores.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al descargar reporte')
    }
  }

  function reset() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setStep('idle')
  }

  return (
    <div className="space-y-4">
      <Card padded>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">1. Plantilla y archivo</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Descarga la plantilla, completa los proveedores y vuelve a subir el archivo. Columnas requeridas:{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">rut</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">razon_social</code>. Opcionales:
          giro, direccion, comuna, contacto, email, telefono, condicion_pago. RUT se valida con módulo 11; el
          match con proveedores existentes es por RUT normalizado.
        </p>
        <div className="flex flex-wrap gap-2">
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
          <div className="flex gap-4 mb-4">
            <Stat label="Total filas" value={preview.total_filas} />
            <Stat label="Válidas" value={preview.filas_validas} color="green" />
            <Stat label="A crear" value={preview.a_crear} color="green" />
            <Stat label="A actualizar" value={preview.a_actualizar} color="yellow" />
            <Stat label="Con error" value={preview.filas_invalidas} color={preview.filas_invalidas > 0 ? 'red' : 'gray'} />
          </div>
          {preview.errores.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Errores encontrados:</p>
              {preview.errores.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                  <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Fila {e.fila}{e.rut ? ` (${e.rut})` : ''}: {e.motivo}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === 'preview' && preview && preview.filas_validas > 0 && (
        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={reset}>Cancelar</Button>
          <Button onClick={handleImport} disabled={busy}>
            {busy ? 'Importando...' : `Importar ${preview.filas_validas} proveedor${preview.filas_validas !== 1 ? 'es' : ''}`}
          </Button>
        </div>
      )}

      {step === 'preview' && preview && preview.filas_validas === 0 && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={reset}>Volver a subir</Button>
        </div>
      )}

      {result && step === 'done' && (
        <Card padded>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">3. Resultado</h2>
            <Button variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={handleDownloadReport}>
              Descargar reporte
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 mb-4">
            <Stat label="Creadas" value={result.creadas} color="green" />
            <Stat label="Actualizadas" value={result.actualizadas} color="yellow" />
            <Stat label="Sin cambio" value={result.sin_cambio} color="gray" />
            <Stat label="Errores" value={result.errores} color={result.errores > 0 ? 'red' : 'gray'} />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {result.detalles.map((d, i) => {
              const s = ESTADO_STYLE[d.estado] ?? ESTADO_STYLE.error
              return (
                <div key={i} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 ${s.cls}`}>
                  {s.icon}
                  <span className="shrink-0 font-medium">Fila {d.fila}</span>
                  {d.rut && <span className="font-mono shrink-0">{d.rut}</span>}
                  {d.razon_social && <span className="truncate text-gray-600 dark:text-gray-400">{d.razon_social}</span>}
                  {d.motivo && <span className="shrink-0 italic">{d.motivo}</span>}
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={reset}>Nueva importación</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function ClientesEmpresasImport() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle')
  const [preview, setPreview] = useState<ClientesEmpresasPreviewResp | null>(null)
  const [result, setResult] = useState<ClientesEmpresasImportResp | null>(null)
  const [busy, setBusy] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(null)
    setResult(null)
    setStep('idle')
    e.target.value = ''
  }

  async function handlePreview() {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const resp = await api.post('/api/onboarding/clientes_empresas/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(resp.data)
      setStep('preview')
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
      const resp = await api.post<ClientesEmpresasImportResp>('/api/onboarding/clientes_empresas/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(resp.data)
      setStep('done')
      const { report } = resp.data
      toast.success(`Import completado — ${report.created_count} creadas, ${report.updated_count} actualizadas${report.error_count ? `, ${report.error_count} con error` : ''}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Error al importar')
      setStep('preview')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadTemplate() {
    try {
      const resp = await api.get('/api/onboarding/clientes_empresas/template', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_clientes_empresas.xlsx'
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
  }

  return (
    <div className="space-y-4">
      <Card padded>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">1. Plantilla y archivo</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Descarga la plantilla, completa los clientes y empresas, y vuelve a subir el archivo. Columnas requeridas:{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">rut_empresa</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">nombre_empresa</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">rut_cliente</code>,{' '}
          <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">nombre_cliente</code>. RUT se valida con módulo 11.
        </p>
        <div className="flex flex-wrap gap-2">
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
            <Stat label="Empresas a crear" value={preview.a_crear.empresas} color="green" />
            <Stat label="Clientes a crear" value={preview.a_crear.clientes} color="green" />
            <Stat label="Empresas a actualizar" value={preview.a_actualizar.empresas} color="yellow" />
            <Stat label="Clientes a actualizar" value={preview.a_actualizar.clientes} color="yellow" />
            <Stat label="Con error" value={preview.filas_invalidas} color={preview.filas_invalidas > 0 ? 'red' : 'gray'} />
          </div>
          {preview.filas_invalidas > 0 && preview.rows.filter(r => r.errors.length > 0).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Errores encontrados:</p>
              {preview.rows
                .filter(r => r.errors.length > 0)
                .map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div>Fila {r.row_num}: {r.errors.join('; ')}</div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}

      {step === 'preview' && preview && preview.filas_validas > 0 && (
        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={reset}>Cancelar</Button>
          <Button onClick={handleImport} disabled={busy}>
            {busy ? 'Importando...' : `Importar ${preview.filas_validas} fila${preview.filas_validas !== 1 ? 's' : ''}`}
          </Button>
        </div>
      )}

      {step === 'preview' && preview && preview.filas_validas === 0 && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={reset}>Volver a subir</Button>
        </div>
      )}

      {result && step === 'done' && (
        <Card padded>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">3. Resultado</h2>
          </div>
          <div className="flex flex-wrap gap-4 mb-4">
            <Stat label="Creadas" value={result.report.created_count} color="green" />
            <Stat label="Actualizadas" value={result.report.updated_count} color="yellow" />
            <Stat label="Errores" value={result.report.error_count} color={result.report.error_count > 0 ? 'red' : 'gray'} />
          </div>
          {result.report.error_count > 0 && (
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {result.report.rows
                .filter(r => r.errors.length > 0)
                .map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="shrink-0 font-medium">Fila {r.row_num}</span>
                    {r.rut_empresa && <span className="font-mono shrink-0">{r.rut_empresa}</span>}
                    {r.nombre_empresa && <span className="truncate text-gray-600 dark:text-gray-400">{r.nombre_empresa}</span>}
                    {r.errors.length > 0 && <span className="shrink-0 italic">{r.errors.join('; ')}</span>}
                  </div>
                ))}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={reset}>Nueva importación</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

