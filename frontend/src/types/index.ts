export interface User {
  id: number
  email: string
  name: string
  role: 'admin' | 'subadmin' | 'vendedor'
  is_active: boolean
  created_at: string
}

export type Module =
  | 'catalogo' | 'clientes' | 'empresas' | 'proveedores' | 'cotizaciones'
  | 'nota_venta' | 'facturas' | 'ordenes_compra' | 'inventario'
  | 'rrhh' | 'dashboard' | 'usuarios'

export type Action = 'view' | 'create' | 'edit' | 'delete'

export type Permissions = Record<Module, Record<Action, boolean>>

export interface Proveedor {
  id: number
  nombre: string
  rut: string | null
  contacto: string | null
  email: string | null
  telefono: string | null
  notas: string | null
  created_at: string
}

export interface EmpresaRef {
  id: number
  nombre: string
  razon_social: string | null
  rut: string | null
}

export interface Empresa {
  id: number
  nombre: string
  razon_social: string | null
  rut: string | null
  forma_pago: string | null
  prioridad: string | null
  sector: string | null
  email: string | null
  nota_cobranza: string | null
  ubicacion: string | null
  created_at: string
}

export interface Producto {
  id: number
  nombre: string
  descripcion: string | null
  sku: string | null
  formato: string | null
  precio_costo: number
  precio_venta: number
  stock_minimo: number
  stock_actual: number
  proveedor_id: number | null
  created_at: string
}

export interface Cliente {
  id: number
  nombre: string
  rut: string | null
  email: string | null
  telefono: string | null
  direccion_despacho: string | null
  notas: string | null
  empresa_id: number | null
  empresa: EmpresaRef | null
  recibe_correo: boolean
  forma_pago: string | null
  despacho_o_retiro: string | null
  comuna: string | null
  ultimo_contacto: string | null
  forma_captacion: string | null
  compromiso: string | null
  es_nuevo: boolean
  created_at: string
}

export interface SystemConfig {
  key: string
  value: string
}

export interface CotizacionLinea {
  id?: number
  orden: number
  producto_id: number | null
  sku: string | null
  descripcion: string
  formato: string | null
  cantidad: number
  valor_neto: number
  total_neto: number
  iva: number
  total: number
  margen: number | null
}

export interface Cotizacion {
  id: number
  numero: number
  cliente_id: number
  vendedor_id: number
  empresa_id: number | null
  empresa?: EmpresaRef | null
  contacto: string | null
  fecha: string
  estado: 'no_definido' | 'abierta' | 'cerrada_fv' | 'rechazada'
  nota: string | null
  correo: string | null
  total_neto: number
  total_iva: number
  total: number
  created_at: string
  updated_at: string
  cliente?: { id: number; nombre: string; rut: string | null; email: string | null; telefono: string | null }
  vendedor?: { id: number; name: string; email: string }
  lineas?: CotizacionLinea[]
}
