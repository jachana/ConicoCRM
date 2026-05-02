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
  estado?: 'borrador' | 'enviado'
  limit?: number
  offset?: number
}

export interface LibroComprasFilters {
  periodo?: string
  estado?: 'borrador' | 'enviado'
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
  if (filters.estado) params.append('estado', filters.estado)
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
  if (filters.estado) params.append('estado', filters.estado)
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
