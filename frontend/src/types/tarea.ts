export type TareaEstado = 'pendiente' | 'hecha' | 'descartada';
export type TareaOrigen = 'manual' | 'auto';
export type PrioridadDerivada = 'vencida' | 'hoy' | 'futura';
export type AsignadoRol = 'vendedor' | 'admin' | 'owner';
export type EntidadTipo = 'cliente' | 'empresa' | 'cotizacion' | 'nota_venta' | 'factura' | 'producto';

export interface Tarea {
  id: number;
  titulo: string;
  descripcion: string | null;
  due_date: string;
  estado: TareaEstado;
  motivo_descarte: string | null;
  origen: TareaOrigen;
  tipo_regla: string | null;
  prioridad_derivada: PrioridadDerivada;
  asignado_id: number;
  asignado_nombre: string;
  creado_por_id: number | null;
  cliente_id: number | null;
  empresa_id: number | null;
  cotizacion_id: number | null;
  nota_venta_id: number | null;
  factura_id: number | null;
  producto_id: number | null;
  completada_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TareaPage {
  items: Tarea[];
  total: number;
  page: number;
  page_size: number;
}

export interface MisPendientes {
  vencidas: number;
  hoy: number;
  futuras: number;
  total: number;
  tareas: Tarea[];
}

export interface ReglaTarea {
  id: number;
  tipo: string;
  activa: boolean;
  offset_dias: number;
  asignado_rol: AsignadoRol;
}

export interface TareaCreateInput {
  titulo: string;
  descripcion?: string;
  due_date: string;
  asignado_id: number;
  cliente_id?: number;
  empresa_id?: number;
  cotizacion_id?: number;
  nota_venta_id?: number;
  factura_id?: number;
  producto_id?: number;
}

export interface TareaFiltros {
  asignado_id?: number;
  estado?: TareaEstado;
  prioridad_derivada?: PrioridadDerivada;
  cliente_id?: number;
  empresa_id?: number;
  cotizacion_id?: number;
  nota_venta_id?: number;
  factura_id?: number;
  producto_id?: number;
  origen?: TareaOrigen;
  page?: number;
  page_size?: number;
}
