import { api } from '../lib/api'

export interface DteRecepcionRead {
  id: number
  empresa_id: number
  tipo: string
  folio: number
  rut_emisor: string
  monto: number
  xml_raw?: string | null
  estado: 'recibido' | 'aceptado' | 'rechazado'
  respuesta_sii?: Record<string, unknown> | null
  rechazo_motivo?: string | null
  created_at: string
  updated_at: string
}

export type DteRecepcionEstado = 'recibido' | 'aceptado' | 'rechazado'

export interface DteRecepcionFilters {
  estado?: DteRecepcionEstado
  rut_emisor?: string
  limit?: number
  offset?: number
}

export interface DteRecepcionListResponse {
  data: DteRecepcionRead[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

function cleanParams(filtros: DteRecepcionFilters): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => {
      if (v == null) return false
      if (typeof v === 'string' && v === '') return false
      if (Array.isArray(v) && v.length === 0) return false
      return true
    }),
  )
}

export async function listarDteRecepciones(
  filtros: DteRecepcionFilters = {},
): Promise<DteRecepcionListResponse> {
  const params = cleanParams(filtros)
  const { data } = await api.get<DteRecepcionListResponse>('/api/dte_recepcion', { params })
  return data
}

export async function aceptarDteRecepcion(id: number): Promise<DteRecepcionRead> {
  const { data } = await api.post<DteRecepcionRead>(`/api/dte_recepcion/${id}/aceptar`, {})
  return data
}

export async function rechazarDteRecepcion(id: number, motivo: string): Promise<DteRecepcionRead> {
  const { data } = await api.post<DteRecepcionRead>(`/api/dte_recepcion/${id}/rechazar`, { motivo })
  return data
}

export async function obtenerDteRecepcion(id: number): Promise<DteRecepcionRead> {
  const { data } = await api.get<DteRecepcionRead>(`/api/dte_recepcion/${id}`)
  return data
}
