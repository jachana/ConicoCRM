import { api } from '../lib/api'

export type TimelineTipo =
  | 'cotizacion'
  | 'nota_venta'
  | 'factura'
  | 'nota_credito'
  | 'nota_debito'
  | 'pago'
  | 'tarea'
  | 'guia_despacho'
  | 'boleta'

export interface TimelineEvent {
  tipo: TimelineTipo
  id: number
  fecha: string
  titulo: string
  subtitulo?: string | null
  monto?: string | null
  estado?: string | null
  link: string
}

export interface TimelinePage {
  items: TimelineEvent[]
  total: number
  limit: number
  offset: number
}

export interface TimelineParams {
  tipos?: TimelineTipo[]
  limit?: number
  offset?: number
  fecha_desde?: string
}

function buildParams(params: TimelineParams): Record<string, string | number> {
  const result: Record<string, string | number> = {}
  if (params.tipos && params.tipos.length > 0) {
    result.tipos = params.tipos.join(',')
  }
  if (params.limit !== undefined) result.limit = params.limit
  if (params.offset !== undefined) result.offset = params.offset
  if (params.fecha_desde) result.fecha_desde = params.fecha_desde
  return result
}

export async function getClienteTimeline(
  clienteId: number,
  params: TimelineParams = {},
): Promise<TimelinePage> {
  const { data } = await api.get<TimelinePage>(`/api/clientes/${clienteId}/timeline`, {
    params: buildParams(params),
  })
  return data
}

export async function getEmpresaTimeline(
  empresaId: number,
  params: TimelineParams = {},
): Promise<TimelinePage> {
  const { data } = await api.get<TimelinePage>(`/api/empresas/${empresaId}/timeline`, {
    params: buildParams(params),
  })
  return data
}
