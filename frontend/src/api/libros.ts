import { api } from '../lib/api'

export interface LibroVentasRead {
  id: number
  periodo: string
  empresa_id: number
  folio_inicio: number | null
  folio_fin: number | null
  total_registros: number
  monto_total: number
  estado: 'borrador' | 'enviado'
  created_at: string
}

export interface LibroComprasRead {
  id: number
  periodo: string
  empresa_id: number
  rut_proveedor: string | null
  total_registros: number
  monto_total: number
  estado: 'borrador' | 'enviado'
  created_at: string
}

export interface LibroVentasFilters {
  periodo?: string
  periodo_from?: string
  periodo_to?: string
  estado?: 'borrador' | 'enviado'
  sort_by?: 'periodo' | 'monto_total' | 'created_at'
  sort_order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface LibroComprasFilters {
  periodo?: string
  periodo_from?: string
  periodo_to?: string
  estado?: 'borrador' | 'enviado'
  sort_by?: 'periodo' | 'monto_total' | 'created_at'
  sort_order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

export async function listarLibrosVentas(
  filters: LibroVentasFilters,
): Promise<PaginatedResponse<LibroVentasRead>> {
  const params = new URLSearchParams()
  if (filters.periodo) params.append('periodo', filters.periodo)
  if (filters.periodo_from) params.append('periodo_from', filters.periodo_from)
  if (filters.periodo_to) params.append('periodo_to', filters.periodo_to)
  if (filters.estado) params.append('estado', filters.estado)
  if (filters.sort_by) params.append('sort_by', filters.sort_by)
  if (filters.sort_order) params.append('sort_order', filters.sort_order)
  params.append('limit', String(filters.limit ?? 50))
  params.append('offset', String(filters.offset ?? 0))

  const response = await api.get(`/libros/ventas?${params}`)
  return response.data
}

export async function listarLibrosCompras(
  filters: LibroComprasFilters,
): Promise<PaginatedResponse<LibroComprasRead>> {
  const params = new URLSearchParams()
  if (filters.periodo) params.append('periodo', filters.periodo)
  if (filters.periodo_from) params.append('periodo_from', filters.periodo_from)
  if (filters.periodo_to) params.append('periodo_to', filters.periodo_to)
  if (filters.estado) params.append('estado', filters.estado)
  if (filters.sort_by) params.append('sort_by', filters.sort_by)
  if (filters.sort_order) params.append('sort_order', filters.sort_order)
  params.append('limit', String(filters.limit ?? 50))
  params.append('offset', String(filters.offset ?? 0))

  const response = await api.get(`/libros/compras?${params}`)
  return response.data
}

export async function obtenerLibroVentas(id: number): Promise<LibroVentasRead> {
  const response = await api.get(`/libros/ventas/${id}`)
  return response.data
}

export async function obtenerLibroCompras(id: number): Promise<LibroComprasRead> {
  const response = await api.get(`/libros/compras/${id}`)
  return response.data
}

export async function exportLibrosVentasCSV(filters: LibroVentasFilters): Promise<Blob> {
  const params = new URLSearchParams()
  if (filters.periodo) params.append('periodo', filters.periodo)
  if (filters.periodo_from) params.append('periodo_from', filters.periodo_from)
  if (filters.periodo_to) params.append('periodo_to', filters.periodo_to)
  if (filters.estado) params.append('estado', filters.estado)
  if (filters.sort_by) params.append('sort_by', filters.sort_by)
  if (filters.sort_order) params.append('sort_order', filters.sort_order)

  const response = await api.get(`/libros/ventas/export/csv?${params}`, {
    responseType: 'blob',
  })
  return response.data
}

export async function exportLibrosComprasCSV(filters: LibroComprasFilters): Promise<Blob> {
  const params = new URLSearchParams()
  if (filters.periodo) params.append('periodo', filters.periodo)
  if (filters.periodo_from) params.append('periodo_from', filters.periodo_from)
  if (filters.periodo_to) params.append('periodo_to', filters.periodo_to)
  if (filters.estado) params.append('estado', filters.estado)
  if (filters.sort_by) params.append('sort_by', filters.sort_by)
  if (filters.sort_order) params.append('sort_order', filters.sort_order)

  const response = await api.get(`/libros/compras/export/csv?${params}`, {
    responseType: 'blob',
  })
  return response.data
}

export async function exportLibrosVentasExcel(filters: LibroVentasFilters): Promise<Blob> {
  const params = new URLSearchParams()
  if (filters.periodo) params.append('periodo', filters.periodo)
  if (filters.periodo_from) params.append('periodo_from', filters.periodo_from)
  if (filters.periodo_to) params.append('periodo_to', filters.periodo_to)
  if (filters.estado) params.append('estado', filters.estado)
  if (filters.sort_by) params.append('sort_by', filters.sort_by)
  if (filters.sort_order) params.append('sort_order', filters.sort_order)

  const response = await api.get(`/libros/ventas/export/excel?${params}`, {
    responseType: 'blob',
  })
  return response.data
}

export async function exportLibrosComprasExcel(filters: LibroComprasFilters): Promise<Blob> {
  const params = new URLSearchParams()
  if (filters.periodo) params.append('periodo', filters.periodo)
  if (filters.periodo_from) params.append('periodo_from', filters.periodo_from)
  if (filters.periodo_to) params.append('periodo_to', filters.periodo_to)
  if (filters.estado) params.append('estado', filters.estado)
  if (filters.sort_by) params.append('sort_by', filters.sort_by)
  if (filters.sort_order) params.append('sort_order', filters.sort_order)

  const response = await api.get(`/libros/compras/export/excel?${params}`, {
    responseType: 'blob',
  })
  return response.data
}
