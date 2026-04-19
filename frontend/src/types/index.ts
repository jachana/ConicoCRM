export interface User {
  id: number
  email: string
  name: string
  role: 'admin' | 'subadmin' | 'vendedor'
  is_active: boolean
  created_at: string
}

export type Module =
  | 'catalogo' | 'clientes' | 'proveedores' | 'cotizaciones'
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
  direccion: string | null
  notas: string | null
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
