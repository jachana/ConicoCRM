import { api } from '../lib/api'
import type { NotaVenta } from '../types'

export async function getNotaVenta(id: number): Promise<NotaVenta> {
  const { data } = await api.get<NotaVenta>(`/api/nota_ventas/${id}`)
  return data
}
