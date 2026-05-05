import { api } from '../lib/api'
import type { Modulo, ModulosState } from '../lib/modulos'

export interface MyModulosResponse {
  effective: Record<string, boolean>
}

export async function fetchMyModulos(): Promise<ModulosState> {
  const res = await api.get<MyModulosResponse>('/api/me/modulos')
  return res.data.effective as ModulosState
}

export async function fetchEmpresaModulos(empresaId: number): Promise<ModulosState> {
  const res = await api.get<{ modulos: Record<string, boolean> }>(
    `/api/admin/empresas/${empresaId}/modulos`,
  )
  return res.data.modulos as ModulosState
}

export async function toggleEmpresaModulo(
  empresaId: number,
  slug: Modulo,
  enabled: boolean,
): Promise<void> {
  await api.patch(`/api/admin/empresas/${empresaId}/modulos/${slug}`, { enabled })
}
