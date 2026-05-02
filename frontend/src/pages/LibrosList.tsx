import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Eye, Inbox, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  listarLibrosVentas,
  listarLibrosCompras,
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
  const [periodo, setPeriodo] = useState('')
  const [estado, setEstado] = useState<'borrador' | 'enviado' | ''>('')
  const [page, setPage] = useState(1)

  const ventasFilters: LibroVentasFilters = useMemo(
    () => ({
      periodo: periodo || undefined,
      estado: (estado as 'borrador' | 'enviado') || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [periodo, estado, page],
  )

  const comprasFilters: LibroComprasFilters = useMemo(
    () => ({
      periodo: periodo || undefined,
      estado: (estado as 'borrador' | 'enviado') || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [periodo, estado, page],
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

  const hasFilters = !!(periodo || estado)
  const hasNextPage = libros.length === PAGE_SIZE

  function clearFilters() {
    setPeriodo('')
    setEstado('')
    setPage(1)
  }

  function handleTipoChange(newTipo: 'ventas' | 'compras') {
    setTipo(newTipo)
    setPeriodo('')
    setEstado('')
    setPage(1)
  }

  function navigateToDetail(libroId: number) {
    if (tipo === 'ventas') {
      navigate(`/libros/ventas/${libroId}`)
    } else {
      navigate(`/libros/compras/${libroId}`)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Libros</h1>
        <div className="flex gap-2">
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
        <FormField label="Período (YYYY-MM)">
          <Input
            type="month"
            size="sm"
            value={periodo}
            onChange={(e) => {
              setPeriodo(e.target.value)
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
                  <TH>Período</TH>
                  <TH>Total Registros</TH>
                  <TH className="text-right">Monto Total</TH>
                  {tipo === 'ventas' && <TH>Folio Inicio - Fin</TH>}
                  {tipo === 'compras' && <TH>RUT Proveedor</TH>}
                  <TH>Estado</TH>
                  <TH>Fecha Creación</TH>
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
  )
}
