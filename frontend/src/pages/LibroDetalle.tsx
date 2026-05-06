import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, FileText, Printer, DownloadCloud } from 'lucide-react'
import {
  obtenerLibroVentas,
  obtenerLibroCompras,
  type LibroVentasRead,
  type LibroComprasRead,
} from '../api/libros'
import {
  Button,
  Badge,
  Skeleton,
  Card,
  CardContent,
} from '../components/ui'

const ESTADO_VARIANT: Record<string, 'info' | 'neutral'> = {
  borrador: 'neutral',
  enviado: 'info',
}

function fmtMoney(n: number | string | null | undefined) {
  return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function exportToCsv(data: LibroVentasRead | LibroComprasRead, tipo: string) {
  const isVentas = tipo === 'ventas'
  const headers = isVentas
    ? ['ID', 'Período', 'Folio Inicio', 'Folio Fin', 'Total Registros', 'Monto Total', 'Estado', 'Creado']
    : ['ID', 'Período', 'RUT Proveedor', 'Total Registros', 'Monto Total', 'Estado', 'Creado']

  const values = isVentas
    ? [(data as LibroVentasRead).id, data.periodo, (data as LibroVentasRead).folio_inicio || '', (data as LibroVentasRead).folio_fin || '', data.total_registros, data.monto_total, data.estado, data.created_at]
    : [data.id, data.periodo, (data as LibroComprasRead).rut_proveedor || '', data.total_registros, data.monto_total, data.estado, data.created_at]

  const csv = [headers, values].map(row => row.map(v => `"${v}"`).join(',')).join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `libro-${tipo}-${data.id}.csv`
  link.click()
}

function exportToPdf(data: LibroVentasRead | LibroComprasRead, tipo: string) {
  const isVentas = tipo === 'ventas'

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Libro ${tipo === 'ventas' ? 'de Ventas' : 'de Compras'}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; font-size: 20px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #f5f5f5; padding: 8px; text-align: left; border: 1px solid #ddd; font-weight: bold; }
          td { padding: 8px; border: 1px solid #ddd; }
          .section { margin-bottom: 30px; }
          .label { font-weight: bold; color: #666; min-width: 200px; }
          .value { color: #333; }
          dl { display: grid; grid-template-columns: 200px 1fr; gap: 12px; }
          dt { font-weight: bold; color: #666; }
          dd { color: #333; }
        </style>
      </head>
      <body>
        <h1>Libro ${isVentas ? 'de Ventas' : 'de Compras'}</h1>
        <div class="section">
          <h2>Información General</h2>
          <dl>
            <dt>Período</dt>
            <dd>${data.periodo}</dd>
            <dt>Estado</dt>
            <dd>${data.estado}</dd>
            <dt>Total Registros</dt>
            <dd>${data.total_registros}</dd>
            <dt>Monto Total</dt>
            <dd>${fmtMoney(data.monto_total)}</dd>
            ${isVentas ? `
              <dt>Folio Inicio</dt>
              <dd>${(data as LibroVentasRead).folio_inicio || '—'}</dd>
              <dt>Folio Fin</dt>
              <dd>${(data as LibroVentasRead).folio_fin || '—'}</dd>
            ` : `
              <dt>RUT Proveedor</dt>
              <dd>${(data as LibroComprasRead).rut_proveedor || '—'}</dd>
            `}
            <dt>Creado</dt>
            <dd>${fmtDateTime(data.created_at)}</dd>
          </dl>
        </div>
      </body>
    </html>
  `

  const printWindow = window.open('', '', 'width=800,height=600')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }
}

function handlePrint(data: LibroVentasRead | LibroComprasRead, tipo: string) {
  exportToPdf(data, tipo)
}

export default function LibroDetalle() {
  const { id, tipo } = useParams<{ id?: string; tipo?: string }>()
  const navigate = useNavigate()

  const libroId = id ? Number(id) : 0
  const libroTipo = (tipo === 'ventas' || tipo === 'compras' ? tipo : 'ventas') as 'ventas' | 'compras'

  const { data: libro, isLoading, isError } = useQuery<LibroVentasRead | LibroComprasRead>({
    queryKey: ['libro', libroTipo, libroId],
    queryFn: () =>
      libroTipo === 'ventas'
        ? obtenerLibroVentas(libroId)
        : obtenerLibroCompras(libroId),
    enabled: !!libroId,
  })

  const handleExportCsv = () => {
    if (!libro) return
    try {
      exportToCsv(libro, libroTipo)
      toast.success('Archivo CSV exportado')
    } catch (error) {
      toast.error('Error al exportar CSV')
    }
  }

  const handleExportPdf = () => {
    if (!libro) return
    try {
      exportToPdf(libro, libroTipo)
      toast.success('PDF generado')
    } catch (error) {
      toast.error('Error al generar PDF')
    }
  }

  const handlePrintClick = () => {
    if (!libro) return
    try {
      handlePrint(libro, libroTipo)
    } catch (error) {
      toast.error('Error al imprimir')
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (isError || !libro) {
    return (
      <div className="p-4 md:p-6">
        <Link to="/libros" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mb-4">
          <ArrowLeft size={16} /> Volver a libros
        </Link>
        <div className="text-gray-500 dark:text-gray-400 text-sm">No se encontró el libro</div>
      </div>
    )
  }

  const isVentas = libroTipo === 'ventas'

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="icon-sm" variant="ghost" onClick={() => navigate('/libros')} aria-label="Volver a libros">
            <ArrowLeft />
          </Button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Libro de {isVentas ? 'Ventas' : 'Compras'}
          </h1>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Período {libro.periodo}
          </span>
          <Badge variant={ESTADO_VARIANT[libro.estado] ?? 'neutral'} showDot>
            {libro.estado}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" leftIcon={<DownloadCloud />} onClick={handleExportCsv}>
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" leftIcon={<FileText />} onClick={handleExportPdf}>
            Generar PDF
          </Button>
          <Button variant="outline" size="sm" leftIcon={<Printer />} onClick={handlePrintClick}>
            Imprimir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Información General</h2>
              <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                <dt className="text-gray-500 dark:text-gray-400">Período</dt>
                <dd className="text-gray-900 dark:text-white font-num">{libro.periodo}</dd>

                <dt className="text-gray-500 dark:text-gray-400">Estado</dt>
                <dd className="text-gray-900 dark:text-white">
                  <Badge variant={ESTADO_VARIANT[libro.estado] ?? 'neutral'}>
                    {libro.estado}
                  </Badge>
                </dd>

                {isVentas && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400">Folio Inicio</dt>
                    <dd className="text-gray-900 dark:text-white font-num">
                      {(libro as LibroVentasRead).folio_inicio ?? '—'}
                    </dd>

                    <dt className="text-gray-500 dark:text-gray-400">Folio Fin</dt>
                    <dd className="text-gray-900 dark:text-white font-num">
                      {(libro as LibroVentasRead).folio_fin ?? '—'}
                    </dd>
                  </>
                )}

                {!isVentas && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400">RUT Proveedor</dt>
                    <dd className="text-gray-900 dark:text-white font-num">
                      {(libro as LibroComprasRead).rut_proveedor ?? '—'}
                    </dd>
                  </>
                )}

                <dt className="text-gray-500 dark:text-gray-400">Total Registros</dt>
                <dd className="text-gray-900 dark:text-white font-num">{libro.total_registros}</dd>

                <dt className="text-gray-500 dark:text-gray-400">Creado</dt>
                <dd className="text-gray-900 dark:text-white">{fmtDateTime(libro.created_at)}</dd>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Totales */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Totales</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Registros</dt>
                  <dd className="text-gray-900 dark:text-white font-num">{libro.total_registros}</dd>
                </div>
                <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                  <dt className="font-semibold text-gray-900 dark:text-white">Monto Total</dt>
                  <dd className="font-semibold text-gray-900 dark:text-white font-num">{fmtMoney(libro.monto_total)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
