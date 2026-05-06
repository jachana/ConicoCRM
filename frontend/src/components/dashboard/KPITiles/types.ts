export interface SparklinePoint {
  fecha: string
  monto: number
}

export interface VentasKpi {
  total: number
  total_anterior: number
  delta_pct: number | null
  count: number
  sparkline: SparklinePoint[]
}

export interface TopCliente {
  nombre: string
  total: number
  count: number
}

export interface DteRejection {
  rate: number
  rechazadas: number
  emitidas: number
}

export interface AgingBucket {
  count: number
  monto: number
}

export interface ArAging {
  d_0_30: AgingBucket
  d_31_60: AgingBucket
  d_61_90: AgingBucket
  d_90_plus: AgingBucket
}

export interface KpisOut {
  periodo: string
  ventas: VentasKpi
  top_clientes: TopCliente[]
  dte_rejection: DteRejection
  ar_aging: ArAging
}
