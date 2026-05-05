// Mirrors backend/app/core/modulos.py — keep in sync when adding slugs.

export const CORE_SLUGS = [
  'catalogo',
  'clientes',
  'empresas',
  'usuarios',
  'dashboard',
] as const

export const OPTIONAL_SLUGS = [
  // ventas
  'cotizaciones',
  'notas_venta',
  'facturas',
  'boletas',
  'guias_despacho',
  'nota_credito',
  'nota_debito',
  // compras
  'proveedores',
  'ordenes_compra',
  'facturas_compra',
  // inventario_precios
  'inventario',
  'listas_precios',
  'precios_especiales',
  // finanzas
  'pagos',
  'cobranza',
  'bancos_receptores',
  'libros',
  // dte_sii
  'dte_recepcion',
  // crm
  'oportunidades',
  'tareas',
  'reglas_tareas',
  // rrhh
  'rrhh_empleados',
  'rrhh_vacaciones',
  'rrhh_documentos',
  // aprobaciones
  'aprobaciones_descuento',
  'aprobaciones_costo',
  'aprobaciones_margen',
] as const

export const MODULO_SLUGS = [...CORE_SLUGS, ...OPTIONAL_SLUGS] as const

export type Modulo = (typeof MODULO_SLUGS)[number]

export type ModuloCategoria =
  | 'core'
  | 'ventas'
  | 'compras'
  | 'inventario_precios'
  | 'finanzas'
  | 'dte_sii'
  | 'crm'
  | 'rrhh'
  | 'aprobaciones'

export interface ModuloMeta {
  label: string
  categoria: ModuloCategoria
  descripcion?: string
}

export const MODULO_META: Record<Modulo, ModuloMeta> = {
  // core (always enabled)
  catalogo:               { label: 'Catálogo',               categoria: 'core' },
  clientes:               { label: 'Clientes',               categoria: 'core' },
  empresas:               { label: 'Empresas',               categoria: 'core' },
  usuarios:               { label: 'Usuarios',               categoria: 'core' },
  dashboard:              { label: 'Dashboard',              categoria: 'core' },
  // ventas
  cotizaciones:           { label: 'Cotizaciones',           categoria: 'ventas' },
  notas_venta:            { label: 'Notas de Venta',         categoria: 'ventas' },
  facturas:               { label: 'Facturas',               categoria: 'ventas' },
  boletas:                { label: 'Boletas',                categoria: 'ventas' },
  guias_despacho:         { label: 'Guías de Despacho',      categoria: 'ventas' },
  nota_credito:           { label: 'Notas de Crédito',       categoria: 'ventas' },
  nota_debito:            { label: 'Notas de Débito',        categoria: 'ventas' },
  // compras
  proveedores:            { label: 'Proveedores',            categoria: 'compras' },
  ordenes_compra:         { label: 'Órdenes de Compra',      categoria: 'compras' },
  facturas_compra:        { label: 'Facturas de Compra',     categoria: 'compras' },
  // inventario_precios
  inventario:             { label: 'Inventario',             categoria: 'inventario_precios' },
  listas_precios:         { label: 'Listas de Precios',      categoria: 'inventario_precios' },
  precios_especiales:     { label: 'Precios Especiales',     categoria: 'inventario_precios' },
  // finanzas
  pagos:                  { label: 'Pagos',                  categoria: 'finanzas' },
  cobranza:               { label: 'Cobranza',               categoria: 'finanzas' },
  bancos_receptores:      { label: 'Bancos Receptores',      categoria: 'finanzas' },
  libros:                 { label: 'Libros Contables',       categoria: 'finanzas' },
  // dte_sii
  dte_recepcion:          { label: 'DTE Recepción',          categoria: 'dte_sii' },
  // crm
  oportunidades:          { label: 'Oportunidades',          categoria: 'crm' },
  tareas:                 { label: 'Tareas',                 categoria: 'crm' },
  reglas_tareas:          { label: 'Reglas de Tareas',       categoria: 'crm' },
  // rrhh
  rrhh_empleados:         { label: 'Empleados',              categoria: 'rrhh' },
  rrhh_vacaciones:        { label: 'Vacaciones',             categoria: 'rrhh' },
  rrhh_documentos:        { label: 'Documentos RRHH',        categoria: 'rrhh' },
  // aprobaciones
  aprobaciones_descuento: { label: 'Aprobaciones Descuento', categoria: 'aprobaciones' },
  aprobaciones_costo:     { label: 'Aprobaciones Costo',     categoria: 'aprobaciones' },
  aprobaciones_margen:    { label: 'Aprobaciones Margen',    categoria: 'aprobaciones' },
}

export type ModulosState = Record<Modulo, boolean>

export function isModuloEnabled(state: ModulosState | undefined, slug: Modulo): boolean {
  if (!state) return false
  return state[slug] ?? false
}
