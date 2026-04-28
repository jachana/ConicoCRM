export const METODOS_PAGO = [
  'efectivo', 'tarjeta_credito', 'tarjeta_debito',
  'transferencia', 'cheque', 'vale_vista',
  'credito_simple', 'otros',
] as const

export type MetodoPago = typeof METODOS_PAGO[number]

export const METODO_PAGO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_credito: 'T. Crédito',
  tarjeta_debito: 'T. Débito',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  vale_vista: 'Vale Vista',
  credito_simple: 'Crédito',
  otros: 'Otros',
}

export const PLAZO_FORZADO_CERO = new Set(['efectivo', 'tarjeta_debito', 'tarjeta_credito'])
export const PLAZO_OBLIGATORIO = new Set(['credito_simple'])

export const PLAZO_OPTIONS = [
  { value: 0, label: 'Al contado' },
  { value: 30, label: '30 días' },
  { value: 60, label: '60 días' },
  { value: 90, label: '90 días' },
]

export function formatMetodoPlazo(metodo: string | null | undefined, plazo: number): string {
  if (!metodo) return ''
  const label = METODO_PAGO_LABELS[metodo] ?? metodo
  if (plazo === 0) return `${label} al contado`
  return `${label} a ${plazo} días`
}

export function isPlazoForzadoCero(metodo: string): boolean {
  return PLAZO_FORZADO_CERO.has(metodo)
}
