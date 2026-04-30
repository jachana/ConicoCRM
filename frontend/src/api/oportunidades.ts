import { api } from '../lib/api'

export interface Etapa {
  id: number
  nombre: string
  orden: number
  color: string
  is_terminal_won: boolean
  is_terminal_lost: boolean
  is_active: boolean
}

export interface Oportunidad {
  id: number
  titulo: string
  cliente_id: number | null
  cliente_nombre: string | null
  empresa_id: number | null
  empresa_nombre: string | null
  vendedor_id: number | null
  vendedor_nombre: string | null
  etapa_id: number
  etapa_nombre: string | null
  etapa_color: string | null
  is_terminal_won: boolean
  is_terminal_lost: boolean
  monto_estimado: string
  probabilidad: number
  fecha_cierre_estimada: string | null
  descripcion: string | null
  cotizacion_id: number | null
  cotizacion_numero: number | null
  won_at: string | null
  lost_at: string | null
  motivo_perdida: string | null
  created_at: string
  updated_at: string
}

export interface PipelineEtapaSummary {
  etapa: Etapa
  oportunidades: Oportunidad[]
  total_monto: string
  count: number
}

export interface Pipeline {
  etapas: PipelineEtapaSummary[]
}

export interface ReporteConversion {
  total: number
  ganadas: number
  perdidas: number
  abiertas: number
  monto_ganado: string
  monto_perdido: string
  monto_pipeline: string
  tasa_conversion: number
}

export interface OportunidadCreate {
  titulo: string
  cliente_id?: number | null
  empresa_id?: number | null
  vendedor_id?: number | null
  etapa_id?: number | null
  monto_estimado?: string | number
  probabilidad?: number
  fecha_cierre_estimada?: string | null
  descripcion?: string | null
}

export interface OportunidadUpdate extends Partial<OportunidadCreate> {
  motivo_perdida?: string | null
}

export async function listEtapas(includeInactive = false): Promise<Etapa[]> {
  const { data } = await api.get<Etapa[]>('/api/oportunidades/etapas', {
    params: { include_inactive: includeInactive },
  })
  return data
}

export async function createEtapa(body: Partial<Etapa> & { nombre: string }): Promise<Etapa> {
  const { data } = await api.post<Etapa>('/api/oportunidades/etapas', body)
  return data
}

export async function updateEtapa(id: number, body: Partial<Etapa>): Promise<Etapa> {
  const { data } = await api.patch<Etapa>(`/api/oportunidades/etapas/${id}`, body)
  return data
}

export async function deleteEtapa(id: number): Promise<void> {
  await api.delete(`/api/oportunidades/etapas/${id}`)
}

export async function getPipeline(params: { vendedor_id?: number } = {}): Promise<Pipeline> {
  const { data } = await api.get<Pipeline>('/api/oportunidades/pipeline', { params })
  return data
}

export async function listOportunidades(params: {
  etapa_id?: number
  vendedor_id?: number
  empresa_id?: number
} = {}): Promise<Oportunidad[]> {
  const { data } = await api.get<Oportunidad[]>('/api/oportunidades', { params })
  return data
}

export async function createOportunidad(body: OportunidadCreate): Promise<Oportunidad> {
  const { data } = await api.post<Oportunidad>('/api/oportunidades', body)
  return data
}

export async function updateOportunidad(id: number, body: OportunidadUpdate): Promise<Oportunidad> {
  const { data } = await api.patch<Oportunidad>(`/api/oportunidades/${id}`, body)
  return data
}

export async function moveOportunidad(
  id: number,
  body: { etapa_id: number; motivo_perdida?: string | null },
): Promise<Oportunidad> {
  const { data } = await api.post<Oportunidad>(`/api/oportunidades/${id}/move`, body)
  return data
}

export async function deleteOportunidad(id: number): Promise<void> {
  await api.delete(`/api/oportunidades/${id}`)
}

export async function convertToCotizacion(id: number): Promise<{ cotizacion_id: number; cotizacion_numero: number }> {
  const { data } = await api.post(`/api/oportunidades/${id}/convert`)
  return data
}

export async function reporteConversion(params: {
  vendedor_id?: number
  fecha_desde?: string
  fecha_hasta?: string
} = {}): Promise<ReporteConversion> {
  const { data } = await api.get<ReporteConversion>('/api/oportunidades/reportes/conversion', {
    params,
  })
  return data
}
