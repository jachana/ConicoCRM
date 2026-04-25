import { api } from '../lib/api'

export interface AuditLog {
  id: number
  user_id: number | null
  user_name: string | null
  user_email: string | null
  action: string
  entity_type: string
  entity_id: string
  diff_json: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
  created_at: string
}

export interface AuditLogPage {
  items: AuditLog[]
  total: number
  limit: number
  offset: number
}

export interface AuditFiltros {
  user_id?: number
  entity_type?: string
  action?: string
  entity_id?: string
  from_date?: string
  to_date?: string
  limit?: number
  offset?: number
}

export async function listarAuditoria(filtros: AuditFiltros = {}): Promise<AuditLogPage> {
  const params = Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v != null && v !== ''),
  )
  const { data } = await api.get<AuditLogPage>('/api/auditoria', { params })
  return data
}

export function exportarAuditoriaCsvUrl(filtros: AuditFiltros = {}): string {
  const params = new URLSearchParams()
  Object.entries(filtros).forEach(([k, v]) => {
    if (v != null && v !== '') params.set(k, String(v))
  })
  const qs = params.toString()
  return '/api/auditoria/export.csv' + (qs ? '?' + qs : '')
}
