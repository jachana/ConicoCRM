import type { ColDef, FlatLine, GenericColDef, EmpresaFacturaItem, EmpresaProductoLine } from '../types'

function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return ''
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function fmtPct(n: number | null): string {
  if (n == null) return ''
  return `${(n * 100).toFixed(1)}%`
}

const BASE_COLUMNS: ColDef[] = [
  { key: 'numero',         label: 'Nº',           defaultVisible: true,  getValue: (r: FlatLine) => r.numero },
  { key: 'fecha',          label: 'Fecha',         defaultVisible: true,  getValue: (r: FlatLine) => fmtDate(r.fecha) },
  { key: 'estado',         label: 'Estado',        defaultVisible: false, getValue: (r: FlatLine) => r.estado },
  { key: 'cliente_nombre', label: 'Cliente',       defaultVisible: true,  getValue: (r: FlatLine) => r.cliente_nombre },
  { key: 'empresa_nombre', label: 'Empresa',       defaultVisible: true,  getValue: (r: FlatLine) => r.empresa_nombre },
  { key: 'encargado',      label: 'Encargado',     defaultVisible: false, getValue: (r: FlatLine) => r.encargado },
  { key: 'contacto',       label: 'Contacto',      defaultVisible: false, getValue: (r: FlatLine) => r.contacto },
  { key: 'sku',            label: 'SKU',           defaultVisible: true,  getValue: (r: FlatLine) => r.sku },
  { key: 'descripcion',    label: 'Descripción',   defaultVisible: true,  getValue: (r: FlatLine) => r.descripcion },
  { key: 'formato',        label: 'Formato',       defaultVisible: false, getValue: (r: FlatLine) => r.formato },
  { key: 'cantidad',       label: 'Cantidad',      defaultVisible: true,  getValue: (r: FlatLine) => r.cantidad },
  { key: 'precio_unit',    label: 'Precio Unit.',  defaultVisible: true,  getValue: (r: FlatLine) => fmtMoney(r.precio_unit) },
  { key: 'total_neto',     label: 'Total Neto',    defaultVisible: true,  getValue: (r: FlatLine) => fmtMoney(r.total_neto) },
  { key: 'margen',         label: 'Margen %',      defaultVisible: true,  getValue: (r: FlatLine) => fmtPct(r.margen) },
]

export const COTIZACION_COLUMN_DEFS: ColDef[] = [...BASE_COLUMNS]

export const FACTURA_COLUMN_DEFS: ColDef[] = [
  ...BASE_COLUMNS,
  { key: 'fecha_vencimiento', label: 'Vencimiento',  defaultVisible: false, getValue: (r: FlatLine) => fmtDate(r.fecha_vencimiento) },
  { key: 'monto_pagado',      label: 'Monto Pagado', defaultVisible: false, getValue: (r: FlatLine) => fmtMoney(r.monto_pagado) },
  { key: 'metodo_pago',       label: 'Método Pago',  defaultVisible: false, getValue: (r: FlatLine) => r.metodo_pago },
  { key: 'fecha_pago',        label: 'Fecha Pago',   defaultVisible: false, getValue: (r: FlatLine) => fmtDate(r.fecha_pago) },
]

export const EMPRESA_FACTURA_COLS: GenericColDef<EmpresaFacturaItem>[] = [
  { key: 'numero',       label: 'Nº',        defaultVisible: true,  getValue: r => r.numero },
  { key: 'fecha',        label: 'Fecha',      defaultVisible: true,  getValue: r => fmtDate(r.fecha) },
  { key: 'estado',       label: 'Estado',     defaultVisible: true,  getValue: r => r.estado },
  { key: 'contacto',     label: 'Contacto',   defaultVisible: false, getValue: r => r.contacto ?? '—' },
  { key: 'total',        label: 'Total',      defaultVisible: true,  getValue: r => fmtMoney(r.total) },
  { key: 'monto_pagado', label: 'Pagado',     defaultVisible: true,  getValue: r => fmtMoney(r.monto_pagado) },
  { key: 'pendiente',    label: 'Pendiente',  defaultVisible: true,  getValue: r => fmtMoney(r.pendiente) },
]

export const EMPRESA_PRODUCTO_COLS: GenericColDef<EmpresaProductoLine>[] = [
  { key: 'fecha',          label: 'Fecha',        defaultVisible: true,  getValue: r => fmtDate(r.fecha) },
  { key: 'factura_numero', label: 'Nº Factura',   defaultVisible: true,  getValue: r => r.factura_numero },
  { key: 'sku',            label: 'SKU',           defaultVisible: true,  getValue: r => r.sku ?? '—' },
  { key: 'descripcion',    label: 'Descripción',   defaultVisible: true,  getValue: r => r.descripcion },
  { key: 'cantidad',       label: 'Cantidad',      defaultVisible: true,  getValue: r => r.cantidad },
  { key: 'precio_unit',    label: 'Precio Unit.',  defaultVisible: true,  getValue: r => fmtMoney(r.precio_unit) },
  { key: 'total_neto',     label: 'Total',         defaultVisible: true,  getValue: r => fmtMoney(r.total_neto) },
]
