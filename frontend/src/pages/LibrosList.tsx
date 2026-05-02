import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Eye, Inbox, Plus, ArrowUp, ArrowDown, Download, Printer } from 'lucide-react'
import { toast } from 'sonner'
import {
  listarLibrosVentas,
  listarLibrosCompras,
  exportLibrosVentasCSV,
  exportLibrosComprasCSV,
  exportLibrosVentasExcel,
  exportLibrosComprasExcel,
  type LibroVentasRead,
  type LibroComprasRead,
  type LibroVentasFilters,
  type LibroComprasFilters,
  type PaginatedResponse,
} from '../api/libros'
import {
  Button,
  Input,
  FormField,
  Badge,
  EmptyState,
  Skeleton,
  Tooltip,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui'

const PAGE_SIZE = 50

function fmtMoney(n: number | string) {
  const num = typeof n === 'string' ? Number(n) : n
  return `$ ${Math.round(num).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

const ESTADO_VARIANT: Record<string, 'info' | 'neutral'> = {
  borrador: 'neutral',
  enviado: 'info',
}

export default function LibrosList() {
  const navigate = useNavigate()

  const [tipo, setTipo] = useState<'ventas' | 'compras'>('ventas')
  const [periodoFrom, setPeriodoFrom] = useState('')
  const [periodoTo, setPeriodoTo] = useState('')
  const [estado, setEstado] = useState<'borrador' | 'enviado' | ''>('')
  const [sortBy, setSortBy] = useState<'periodo' | 'monto_total' | 'created_at' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [isExporting, setIsExporting] = useState(false)

  const ventasFilters: LibroVentasFilters = useMemo(
    () => ({
      periodo_from: periodoFrom || undefined,
      periodo_to: periodoTo || undefined,
      estado: (estado as 'borrador' | 'enviado') || undefined,
      sort_by: (sortBy as 'periodo' | 'monto_total' | 'created_at') || undefined,
      sort_order: sortBy ? sortOrder : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [periodoFrom, periodoTo, estado, sortBy, sortOrder, page],
  )

  const comprasFilters: LibroComprasFilters = useMemo(
    () => ({
      periodo_from: periodoFrom || undefined,
      periodo_to: periodoTo || undefined,
      estado: (estado as 'borrador' | 'enviado') || undefined,
      sort_by: (sortBy as 'periodo' | 'monto_total' | 'created_at') || undefined,
      sort_order: sortBy ? sortOrder : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [periodoFrom, periodoTo, estado, sortBy, sortOrder, page],
  )

  const { data: ventasData, isLoading: ventasLoading } = useQuery<
    PaginatedResponse<LibroVentasRead>
  >({
    queryKey: ['libros-ventas', ventasFilters],
    queryFn: () => listarLibrosVentas(ventasFilters),
    enabled: tipo === 'ventas',
  })

  const { data: comprasData, isLoading: comprasLoading } = useQuery<
    PaginatedResponse<LibroComprasRead>
  >({
    queryKey: ['libros-compras', comprasFilters],
    queryFn: () => listarLibrosCompras(comprasFilters),
    enabled: tipo === 'compras',
  })

  const isLoading = tipo === 'ventas' ? ventasLoading : comprasLoading
  const data = tipo === 'ventas' ? ventasData : comprasData
  const libros = data?.data ?? []
  const pagination = data?.pagination

  const hasFilters = !!(periodoFrom || periodoTo || estado || sortBy)
  const hasNextPage = libros.length === PAGE_SIZE

  function clearFilters() {
    setPeriodoFrom('')
    setPeriodoTo('')
    setEstado('')
    setSortBy('')
    setSortOrder('asc')
    setPage(1)
  }

  function handleTipoChange(newTipo: 'ventas' | 'compras') {
    setTipo(newTipo)
    setPeriodoFrom('')
    setPeriodoTo('')
    setEstado('')
    setSortBy('')
    setSortOrder('asc')
    setPage(1)
  }

  function handleSortByChange(column: 'periodo' | 'monto_total' | 'created_at') {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
    setPage(1)
  }

  function getSortIcon(column: 'periodo' | 'monto_total' | 'created_at') {
    if (sortBy !== column) return null
    return sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
  }

  function navigateToDetail(libroId: number) {
    if (tipo === 'ventas') {
      navigate(`/libros/ventas/${libroId}`)
    } else {
      navigate(`/libros/compras/${libroId}`)
    }
  }

  function getExportFilters() {
    return {
      periodo_from: periodoFrom || undefined,
      periodo_to: periodoTo || undefined,
      estado: (estado as 'borrador' | 'enviado') || undefined,
      sort_by: (sortBy as 'periodo' | 'monto_total' | 'created_at') || undefined,
      sort_order: sortBy ? sortOrder : undefined,
    }
  }

  function formatDateForFilename(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  async function handleExportCSV() {
    try {
      setIsExporting(true)
      const filters = getExportFilters()
      const date = formatDateForFilename(new Date())
      let blob: Blob

      if (tipo === 'ventas') {
        blob = await exportLibrosVentasCSV(filters)
      } else {
        blob = await exportLibrosComprasCSV(filters)
      }

      downloadBlob(blob, `libros-${tipo}-${date}.csv`)
      toast.success('Archivo descargado')
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Error al descargar el archivo')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleExportExcel() {
    try {
      setIsExporting(true)
      const filters = getExportFilters()
      const date = formatDateForFilename(new Date())
      let blob: Blob

      if (tipo === 'ventas') {
        blob = await exportLibrosVentasExcel(filters)
      } else {
        blob = await exportLibrosComprasExcel(filters)
      }

      downloadBlob(blob, `libros-${tipo}-${date}.xlsx`)
      toast.success('Archivo descargado')
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Error al descargar el archivo')
    } finally {
      setIsExporting(false)
    }
  }

  function getFilterSummary() {
    const parts: string[] = []

    if (periodoFrom || periodoTo) {
      const from = periodoFrom || '—'
      const to = periodoTo || '—'
      parts.push(`Período: ${from} a ${to}`)
    }

    if (estado) {
      parts.push(`Estado: ${estado}`)
    }

    if (sortBy) {
      const sortLabel =
        sortBy === 'periodo'
          ? 'Período'
          : sortBy === 'monto_total'
            ? 'Monto Total'
            : 'Fecha Creación'
      parts.push(`Ordenar por: ${sortLabel} ${sortOrder}`)
    }

    return parts.length > 0 ? parts.join(', ') : 'Sin filtros'
  }

  function handlePrint() {
    window.print()
  }

  return (
    <>
      <style>{`
        /* Hide print header by default */
        .print-header {
          display: none;
        }

        @media print {
          /* Show print header when printing */
          .print-header {
            display: block !important;
            page-break-after: avoid;
            margin-bottom: 20px;
            border-bottom: 2px solid #000;
            padding-bottom: 12px;
          }

          .print-header h2 {
            font-size: 18pt;
            font-weight: bold;
            margin: 0 0 8px 0;
          }

          .print-header .print-filters {
            font-size: 9pt;
            color: #333;
            margin: 6px 0;
            line-height: 1.4;
          }

          .print-header .print-date {
            font-size: 8pt;
            color: #666;
            margin-top: 6px;
          }

          /* Hide navigation and UI elements */
          button, [role="button"], .no-print { display: none !important; }

          /* Hide pagination */
          [class*="pagination"] { display: none !important; }

          /* Simplify borders and shadows */
          box-shadow, .shadow-elev-1, [class*="shadow"] { display: none !important; }

          /* Table optimization */
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
          }

          th, td {
            border: 1px solid #000;
            padding: 6px;
            text-align: left;
          }

          th {
            background-color: #f0f0f0;
            font-weight: bold;
            font-size: 9pt;
          }

          td {
            font-size: 9pt;
            word-break: break-word;
          }

          /* Page break control */
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }

          /* Remove action column on print */
          td:last-child, th:last-child { display: none !important; }

          /* Adjust colors for print */
          color: #000;
          background-color: white;

          /* Margins for standard paper */
          body { margin: 0.5in; }

          /* Preserve text alignment */
          .text-right { text-align: right; }
          .font-num { font-family: 'Courier New', monospace; }

          /* Remove dark mode for printing */
          .dark { background: white; color: black; }
          .dark * { background: inherit; color: inherit; }
        }
      `}</style>
      <div className="p-4 md:p-6 max-w-7xl">
        {/* Print header - only visible in print preview */}
        <div className="print-header">
          <h2>Libros {tipo === 'ventas' ? 'de Ventas' : 'de Compras'}</h2>
          <div className="print-filters">{getFilterSummary()}</div>
          <div className="print-date">
            Imprimido el {new Date().toLocaleDateString('es-CL', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>

        {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Libros</h1>
        <div className="flex gap-2">
          <Button
            leftIcon={<Printer />}
            variant="outline"
            onClick={handlePrint}
          >
            Imprimir
          </Button>
          <Button
            leftIcon={<Download />}
            variant="outline"
            disabled={isExporting}
            onClick={handleExportCSV}
          >
            {isExporting ? '...' : 'CSV'}
          </Button>
          <Button
            leftIcon={<Download />}
            variant="outline"
            disabled={isExporting}
            onClick={handleExportExcel}
          >
            {isExporting ? '...' : 'Excel'}
          </Button>
          <Button leftIcon={<Plus />} onClick={() => navigate(`/libros/${tipo}/nueva`)}>
            Nuevo
          </Button>
        </div>
      </div>

      {/* Tipo tabs */}
      <div className="mb-4 flex gap-2 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => handleTipoChange('ventas')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition ${
            tipo === 'ventas'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Ventas
        </button>
        <button
          onClick={() => handleTipoChange('compras')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition ${
            tipo === 'compras'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Compras
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3 items-end bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-800 shadow-elev-1">
        <FormField label="Desde">
          <Input
            type="month"
            size="sm"
            value={periodoFrom}
            onChange={(e) => {
              setPeriodoFrom(e.target.value)
              setPage(1)
            }}
            className="w-40"
          />
        </FormField>
        <FormField label="Hasta">
          <Input
            type="month"
            size="sm"
            value={periodoTo}
            onChange={(e) => {
              setPeriodoTo(e.target.value)
              setPage(1)
            }}
            className="w-40"
          />
        </FormField>
        <FormField label="Estado">
          <Select
            value={estado || 'all'}
            onValueChange={(v) => {
              setEstado(v === 'all' ? '' : (v as 'borrador' | 'enviado'))
              setPage(1)
            }}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="borrador">Borrador</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Ordenar por">
          <Select
            value={sortBy || 'none'}
            onValueChange={(v) => {
              if (v === 'none') {
                setSortBy('')
                setSortOrder('asc')
              } else {
                setSortBy(v as 'periodo' | 'monto_total' | 'created_at')
                setSortOrder('asc')
              }
              setPage(1)
            }}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin ordenar</SelectItem>
              <SelectItem value="periodo">Período</SelectItem>
              <SelectItem value="monto_total">Monto Total</SelectItem>
              <SelectItem value="created_at">Fecha Creación</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        {sortBy && (
          <FormField label="Orden">
            <Select
              value={sortOrder}
              onValueChange={(v) => {
                setSortOrder(v as 'asc' | 'desc')
                setPage(1)
              }}
            >
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascendente</SelectItem>
                <SelectItem value="desc">Descendente</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        )}
        {hasFilters && (
          <Button size="xs" variant="ghost" onClick={clearFilters}>
            Limpiar
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-elev-1">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : libros.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={`Sin libros de ${tipo}`}
            description={`No hay libros de ${tipo} que coincidan con los filtros.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>
                    <button
                      onClick={() => handleSortByChange('periodo')}
                      className="flex items-center gap-2 hover:text-brand-600 dark:hover:text-brand-400 transition"
                    >
                      Período
                      {getSortIcon('periodo')}
                    </button>
                  </TH>
                  <TH>Total Registros</TH>
                  <TH className="text-right">
                    <button
                      onClick={() => handleSortByChange('monto_total')}
                      className="flex items-center justify-end gap-2 hover:text-brand-600 dark:hover:text-brand-400 transition"
                    >
                      Monto Total
                      {getSortIcon('monto_total')}
                    </button>
                  </TH>
                  {tipo === 'ventas' && <TH>Folio Inicio - Fin</TH>}
                  {tipo === 'compras' && <TH>RUT Proveedor</TH>}
                  <TH>Estado</TH>
                  <TH>
                    <button
                      onClick={() => handleSortByChange('created_at')}
                      className="flex items-center gap-2 hover:text-brand-600 dark:hover:text-brand-400 transition"
                    >
                      Fecha Creación
                      {getSortIcon('created_at')}
                    </button>
                  </TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {libros.map((libro) => (
                  <TR
                    key={libro.id}
                    interactive
                    onClick={() => navigateToDetail(libro.id)}
                  >
                    <TD className="font-medium text-gray-900 dark:text-gray-100">
                      {libro.periodo}
                    </TD>
                    <TD className="text-gray-700 dark:text-gray-300 font-num">
                      {libro.total_registros}
                    </TD>
                    <TD className="font-num font-medium text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {fmtMoney(libro.monto_total)}
                    </TD>
                    {tipo === 'ventas' ? (
                      <TD className="text-gray-700 dark:text-gray-300 font-num">
                        {(libro as LibroVentasRead).folio_inicio}-
                        {(libro as LibroVentasRead).folio_fin ?? '?'}
                      </TD>
                    ) : (
                      <TD className="text-gray-700 dark:text-gray-300">
                        {(libro as LibroComprasRead).rut_proveedor ?? '—'}
                      </TD>
                    )}
                    <TD>
                      <Badge
                        variant={ESTADO_VARIANT[libro.estado] ?? 'neutral'}
                        showDot
                        className="capitalize"
                      >
                        {libro.estado}
                      </Badge>
                    </TD>
                    <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">
                      {fmtDate(libro.created_at)}
                    </TD>
                    <TD onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip label="Ver">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => navigateToDetail(libro.id)}
                          >
                            <Eye />
                          </Button>
                        </Tooltip>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {(page > 1 || hasNextPage) && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-num">
            Página {page}
            {pagination && ` de ~${Math.ceil(pagination.total / PAGE_SIZE)}`}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasNextPage || isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}
      </div>
    </>
  )
}
