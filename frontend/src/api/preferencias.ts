import { api } from '../lib/api'

export type AtajoBusqueda = 'ctrl_k' | 'ctrl_p' | 'ctrl_shift_f' | 'alt_s'

export interface Preferencias {
  busqueda_boton_visible: boolean
  busqueda_atajo: AtajoBusqueda
  sidebar_hidden: string[]
}

export async function getPreferencias(): Promise<Preferencias> {
  const { data } = await api.get<Preferencias>('/api/users/me/preferencias')
  return data
}

export async function patchPreferencias(patch: Partial<Preferencias>): Promise<Preferencias> {
  const { data } = await api.patch<Preferencias>('/api/users/me/preferencias', patch)
  return data
}
