import { api } from '../lib/api'

export interface SearchProducto { id: number; nombre: string; sku: string | null }
export interface SearchCliente  { id: number; nombre: string; rut: string | null; empresa: string | null }
export interface SearchEmpresa  { id: number; nombre: string; rut: string | null }
export interface SearchDoc      { id: number; numero: number; estado: string; cliente_nombre?: string | null; proveedor_nombre?: string | null }
export interface SearchEmpleado { id: number; nombre: string; cargo: string }

export interface SearchResults {
  q: string
  productos?: SearchProducto[]
  clientes?: SearchCliente[]
  empresas?: SearchEmpresa[]
  cotizaciones?: SearchDoc[]
  notas_venta?: SearchDoc[]
  facturas?: SearchDoc[]
  ordenes_compra?: SearchDoc[]
  empleados?: SearchEmpleado[]
}

export async function search(q: string, signal?: AbortSignal): Promise<SearchResults> {
  const { data } = await api.get<SearchResults>('/api/search', { params: { q }, signal })
  return data
}
