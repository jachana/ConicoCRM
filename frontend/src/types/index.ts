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
  linea_credito: number | null
  limite_credito: number | null
  plazo_credito: string | null
  prioridad: string | null
  sector: string | null
  email: string | null
  nota_cobranza: string | null
  ubicacion: string | null
  created_at: string
}

export interface DeudaBulkItem {
  empresa_id: number
  nombre: string
  plazo_credito: string | null
  limite_credito: number | null
  deuda_total: number
  deuda_vencida: number
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
  despacho_o_retiro: string | null
  comuna: string | null
  ultimo_contacto: string | null
  forma_captacion: string | null
  compromiso: string | null
  es_nuevo: boolean
  created_at: string
}

export interface FacturaResumen {
  id: number
  numero: number
  fecha: string
  contacto: string | null
  total: number
  monto_pagado: number
  estado: string
}

export interface EmpresaDeuda {
  total_facturado: number
  total_pagado: number
  deuda: number
  facturas: FacturaResumen[]
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
  descuento: number
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
  estado: 'no_definido' | 'abierta' | 'aprobada' | 'cerrada_fv' | 'rechazada'
  nota: string | null
  terminos_pago: string | null
  terminos_pago_estado: string
  validez_dias: number
  fecha_expiracion: string
  correo: string | null
  total_neto: number
  total_iva: number
  total: number
  margen_total?: number | null
  created_at: string
  updated_at: string
  cliente?: { id: number; nombre: string; rut: string | null; email: string | null; telefono: string | null }
  vendedor?: { id: number; name: string; email: string }
  lineas?: CotizacionLinea[]
  is_locked?: boolean
}

export interface Empleado {
  id: number
  nombre: string
  cargo: string
  sueldo_base: number | null
  fecha_ingreso: string | null
  is_active: boolean
  created_at: string
}

export interface EmpleadoDocumento {
  id: number
  empleado_id: number
  nombre: string
  tipo: 'contrato' | 'liquidacion' | 'otro'
  subido_en: string
  subido_por_id: number | null
}

export interface EmpleadoVacacion {
  id: number
  empleado_id: number
  fecha_inicio: string
  fecha_fin: string
  dias: number
  descripcion: string | null
  registrado_en: string
}

export interface NotaVentaLinea {
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

export interface NotaVenta {
  id: number
  numero: number
  cotizacion_id: number | null
  factura_id: number | null
  cliente_id: number
  vendedor_id: number | null
  empresa_id: number | null
  empresa?: EmpresaRef | null
  contacto: string | null
  fecha: string
  estado: 'pendiente' | 'despachada' | 'entregada' | 'pagada' | 'cancelada'
  nota: string | null
  correo: string | null
  direccion_despacho: string | null
  retiro_en_conico: boolean
  terminos_pago: string | null
  total_neto: number
  total_iva: number
  total: number
  created_at: string
  updated_at: string
  cliente?: { id: number; nombre: string; rut: string | null; email: string | null; telefono: string | null }
  vendedor?: { id: number; name: string; email: string }
  cotizacion?: { id: number; numero: number } | null
  lineas?: NotaVentaLinea[]
  is_locked?: boolean
}

export interface FacturaLinea {
  id: number;
  orden: number;
  producto_id: number | null;
  sku: string | null;
  descripcion: string;
  formato: string | null;
  cantidad: number;
  valor_neto: number;
  total_neto: number;
  iva: number;
  total: number;
  margen: number | null;
}

export interface BancoReceptor {
  id: number
  nombre: string
  activo: boolean
}

export interface Factura {
  id: number;
  numero: number;
  cotizacion_id: number | null;
  nv_id: number | null;
  cliente_id: number | null;
  vendedor_id: number | null;
  empresa_id: number | null;
  banco_receptor_id: number | null;
  banco_receptor: BancoReceptor | null;
  contacto: string | null;
  fecha: string;
  fecha_vencimiento: string | null;
  estado: string;
  dte_estado: string;
  origen: string;
  xml_raw: string | null;
  ultimo_recordatorio: string | null;
  nota: string | null;
  correo: string | null;
  total_neto: number;
  total_iva: number;
  total: number;
  fecha_pago: string | null;
  monto_pagado: number | null;
  metodo_pago: string | null;
  margen_total?: number | null;
  created_at: string;
  updated_at: string;
  cliente: { id: number; nombre: string; rut: string | null } | null;
  vendedor: { id: number; name: string; email: string } | null;
  empresa: { id: number; nombre: string } | null;
  nv: { id: number; numero: number } | null;
  cotizacion: { id: number; numero: number } | null;
  lineas: FacturaLinea[];
  is_locked?: boolean;
}

export interface FacturaList {
  id: number
  numero: number
  cotizacion_id: number | null
  nv_id: number | null
  cliente_id: number | null
  vendedor_id: number | null
  empresa_id: number | null
  contacto: string | null
  fecha: string
  fecha_vencimiento: string | null
  estado: string
  correo: string | null
  total_neto: number
  total_iva: number
  total: number
  fecha_pago: string | null
  monto_pagado: number | null
  metodo_pago: string | null
  created_at: string
  updated_at: string
  cliente: { id: number; nombre: string; rut: string | null } | null
  vendedor: { id: number; name: string; email: string } | null
  empresa: EmpresaRef | null
  lineas: FacturaLinea[]
  margen_total: number | null
  is_locked?: boolean
}

export interface FlatLine {
  numero: number
  fecha: string
  estado: string
  cliente_nombre: string
  empresa_nombre: string
  encargado: string
  contacto: string
  sku: string
  descripcion: string
  formato: string
  cantidad: number
  precio_unit: number
  total_neto: number
  margen: number | null
  // Facturas-only
  fecha_vencimiento: string
  monto_pagado: number | null
  metodo_pago: string
  fecha_pago: string
}

export interface ColDef {
  key: string
  label: string
  defaultVisible: boolean
  getValue: (row: FlatLine) => string | number
}

export type OrdenCompraEstado = 'borrador' | 'enviada' | 'recibida_parcial' | 'recibida_completa' | 'cancelada'

export interface OrdenCompraLinea {
  id?: number
  orden: number
  producto_id: number | null
  sku: string | null
  descripcion: string
  cantidad: number
  cantidad_recibida: number
  valor_neto: number
  total_neto: number
  iva: number
  total: number
}

export interface OrdenCompra {
  id: number
  numero: number
  proveedor_id: number
  fecha: string
  fecha_entrega_esperada: string | null
  estado: OrdenCompraEstado
  nota: string | null
  total_neto: number
  total_iva: number
  total: number
  created_at: string
  updated_at: string
  proveedor?: { id: number; nombre: string; rut: string | null; email: string | null; contacto: string | null; telefono: string | null } | null
  lineas?: OrdenCompraLinea[]
}

export interface Pago {
  id: number
  factura_id: number
  fecha: string
  monto: number
  metodo_pago: string
  nota: string | null
  registrado_por_id: number | null
  created_at: string
  registrado_por: { id: number; name: string } | null
  factura: { id: number; numero: number; total: number } | null
}

export interface MovimientoInventario {
  id: number
  producto_id: number
  tipo: 'entrada' | 'salida' | 'ajuste'
  cantidad: number
  signo: number
  referencia_tipo: 'orden_compra' | 'nota_venta' | 'ajuste_manual' | null
  referencia_id: number | null
  motivo: 'conteo_fisico' | 'merma' | 'correccion' | 'otro' | null
  nota: string | null
  usuario_id: number | null
  created_at: string
  producto?: { id: number; nombre: string; sku: string | null } | null
  usuario?: { id: number; name: string } | null
}

export interface MovimientoListOut {
  items: MovimientoInventario[]
  total: number
}

export interface StockBajoItem {
  id: number
  nombre: string
  sku: string | null
  stock_actual: number
  stock_minimo: number
}

export interface CobranzaConfig {
  id: number;
  empresa_id: number;
  dias_frecuencia: number;
}

export interface AgingBucket {
  count: number;
  monto: number;
}

export interface CobranzaDashboard {
  total_por_cobrar: number;
  total_vencido: number;
  proximas_a_vencer: number;
  aging: {
    d_0_30: AgingBucket;
    d_31_60: AgingBucket;
    d_61_90: AgingBucket;
    d_90_plus: AgingBucket;
  };
  por_empresa: Array<{
    empresa_id: number;
    empresa_nombre: string;
    total: number;
    vencido: number;
  }>;
}

export interface RecordatorioItem {
  id: number;
  numero: number;
  empresa_id: number | null;
  empresa_nombre: string | null;
  cliente_nombre: string | null;
  total: number;
  monto_pagado: number | null;
  saldo: number;
  fecha_vencimiento: string | null;
  dias_vencida: number;
  ultimo_recordatorio: string | null;
  correo_enviar: string | null;
}

export interface ImportXMLResult {
  creadas: number;
  actualizadas: number;
  errores: Array<{
    filename: string;
    message: string;
    empresa_data?: {
      rut: string;
      nombre: string;
      email: string;
    } | null;
  }>;
}

export interface NotaCreditoLinea {
  id: number
  orden: number
  descripcion: string
  cantidad: string
  precio_unitario: string
  subtotal: string
}

export interface NotaCredito {
  id: number
  numero: number
  fecha: string
  cliente_id: number
  razon: string
  monto_neto: string
  monto_iva: string
  monto_total: string
  dte_estado: string
  created_at: string
  lineas: NotaCreditoLinea[]
}

export interface NotaDebitoLinea {
  id: number
  orden: number
  descripcion: string
  cantidad: string
  precio_unitario: string
  subtotal: string
}

export interface NotaDebito {
  id: number
  numero: number
  fecha: string
  cliente_id: number
  razon: string
  monto_neto: string
  monto_iva: string
  monto_total: string
  dte_estado: string
  created_at: string
  lineas: NotaDebitoLinea[]
}

// ── Reportes ──────────────────────────────────────────────────────────────────
export interface ReportesVentasKpis {
  total_vendido: number
  num_facturas: number
  ticket_promedio: number
  total_por_cobrar: number
  variacion_vs_periodo_anterior: number
}

export interface ReportesVentas {
  kpis: ReportesVentasKpis
  ventas_diarias: { fecha: string; monto: number }[]
  top_clientes: { cliente_id: number; nombre: string; total: number; num_facturas: number }[]
  por_vendedor: { vendedor_id: number; nombre: string; total: number; num_facturas: number }[]
}

export interface ReportesCobranza {
  kpis: { total_por_cobrar: number; total_vencido: number; proximas_a_vencer_7d: number }
  aging: Record<'d_0_30' | 'd_31_60' | 'd_61_90' | 'd_90_plus', { count: number; monto: number }>
  por_empresa: { empresa_id: number; nombre: string; saldo: number; dias_vencida: number }[]
}

export interface ReportesInventario {
  kpis: { valor_total_stock: number; num_bajo_minimo: number; num_sin_stock: number }
  bajo_minimo: { producto_id: number; nombre: string; sku: string | null; stock_actual: number; stock_minimo: number }[]
  top_vendidos: { producto_id: number; nombre: string; cantidad_vendida: number; monto_total: number }[]
}

export interface ReportesCompras {
  kpis: { total_comprado: number; num_oc_emitidas: number; num_oc_pendientes: number }
  por_proveedor: { proveedor_id: number; nombre: string; total: number; num_oc: number }[]
  por_estado: { estado: string; count: number; total: number }[]
}

export interface ReportesMargenes {
  kpis: {
    margen_promedio_pct: number
    mejor_producto: { nombre: string; margen_pct: number } | null
    peor_producto: { nombre: string; margen_pct: number } | null
  }
  por_producto: { producto_id: number; nombre: string; cantidad_vendida: number; precio_costo_promedio: number; precio_venta_promedio: number; margen_pct: number }[]
  por_factura: { factura_id: number; numero: number; total: number; margen_total: number; margen_pct: number }[]
}

export interface ReportesDte {
  kpis: { total_emitidos: number; aceptadas: number; rechazadas: number; pendientes: number }
  por_tipo: { tipo: string; label: string; count: number; aceptadas: number }[]
  emisiones: { id: number; tipo: string; folio: number | null; estado: string; monto_total: number; created_at: string | null; detalle_rechazo: string | null }[]
}

export interface EmpresaListItem extends Empresa {
  ultima_compra: string | null
}

export interface EmpresaFacturaItem {
  id: number
  numero: number
  fecha: string
  estado: string
  contacto: string | null
  total: number
  monto_pagado: number
  pendiente: number
}

export interface EmpresaProductoLine {
  fecha: string
  factura_id: number
  factura_numero: number
  sku: string | null
  descripcion: string
  cantidad: number
  precio_unit: number
  total_neto: number
}

export interface GenericColDef<T = Record<string, unknown>> {
  key: string
  label: string
  defaultVisible: boolean
  getValue: (row: T) => string | number
}
