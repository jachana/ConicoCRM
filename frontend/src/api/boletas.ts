import { api } from '../lib/api';

export type BoletaTipoDte = '39' | '41';
export type BoletaEstado = 'emitida' | 'anulada';
export type BoletaDteEstado =
  | 'no_emitida'
  | 'pendiente'
  | 'procesando'
  | 'aceptada'
  | 'rechazada';
export type BoletaMetodoPago =
  | 'efectivo'
  | 'debito'
  | 'credito'
  | 'transferencia'
  | 'otro';

export interface ClienteMin {
  id: number;
  nombre: string;
  rut?: string | null;
}

export interface VendedorMin {
  id: number;
  name: string;
}

export interface BoletaLineaInput {
  orden?: number;
  producto_id?: number | null;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct?: string;
  exenta?: boolean;
}

export interface BoletaLinea {
  id: number;
  orden: number;
  producto_id?: number | null;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct: string;
  exenta: boolean;
  total_neto: string;
  iva: string;
  total_linea: string;
}

export interface Boleta {
  id: number;
  numero: number;
  fecha: string;
  tipo_dte: BoletaTipoDte;
  cliente_id?: number | null;
  empresa_id?: number | null;
  patente_vehiculo?: string | null;
  email_envio?: string | null;
  nombre_receptor?: string | null;
  rut_receptor?: string | null;
  vendedor_id?: number | null;
  metodo_pago: BoletaMetodoPago;
  total_neto: string;
  total_iva: string;
  total: string;
  monto_pagado: string;
  estado: BoletaEstado;
  dte_estado: BoletaDteEstado;
  folio_sii?: number | null;
  track_id?: string | null;
  email_enviado_at?: string | null;
  created_at: string;
  updated_at: string;
  cliente?: ClienteMin | null;
  vendedor?: VendedorMin | null;
  lineas: BoletaLinea[];
  is_locked: boolean;
}

export interface BoletaListItem {
  id: number;
  numero: number;
  fecha: string;
  tipo_dte: BoletaTipoDte;
  cliente_id?: number | null;
  nombre_receptor?: string | null;
  patente_vehiculo?: string | null;
  metodo_pago: BoletaMetodoPago;
  total: string;
  estado: BoletaEstado;
  dte_estado: BoletaDteEstado;
  cliente?: ClienteMin | null;
  vendedor?: VendedorMin | null;
}

export interface BoletaCreatePayload {
  fecha?: string;
  tipo_dte: BoletaTipoDte;
  cliente_id?: number | null;
  empresa_id?: number | null;
  patente_vehiculo?: string;
  email_envio?: string;
  nombre_receptor?: string;
  rut_receptor?: string;
  metodo_pago: BoletaMetodoPago;
  monto_pagado?: string;
  lineas: BoletaLineaInput[];
}

export interface BoletaPatchPayload {
  patente_vehiculo?: string | null;
  email_envio?: string | null;
  nombre_receptor?: string | null;
}

export interface BoletaListFilters {
  fecha_desde?: string;
  fecha_hasta?: string;
  cliente_id?: number;
  patente?: string;
  estado?: BoletaEstado[];
  dte_estado?: BoletaDteEstado[];
  metodo_pago?: BoletaMetodoPago;
  vendedor_id?: number;
  ids?: number[];
  page?: number;
  page_size?: number;
}

function cleanParams(filtros: BoletaListFilters): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => {
      if (v == null) return false;
      if (typeof v === 'string' && v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }),
  );
}

export async function listarBoletas(
  filtros: BoletaListFilters = {},
): Promise<BoletaListItem[]> {
  const params = cleanParams(filtros);
  const { data } = await api.get<BoletaListItem[]>('/api/boletas/', { params });
  return data;
}

export async function getBoleta(id: number): Promise<Boleta> {
  const { data } = await api.get<Boleta>(`/api/boletas/${id}`);
  return data;
}

export async function crearBoleta(payload: BoletaCreatePayload): Promise<Boleta> {
  const { data } = await api.post<Boleta>('/api/boletas/', payload);
  return data;
}

export async function patchBoleta(
  id: number,
  payload: BoletaPatchPayload,
): Promise<Boleta> {
  const { data } = await api.patch<Boleta>(`/api/boletas/${id}`, payload);
  return data;
}

export async function anularBoleta(id: number, razon: string): Promise<Boleta> {
  const { data } = await api.post<Boleta>(`/api/boletas/${id}/anular`, { razon });
  return data;
}

export async function enviarEmailBoleta(
  id: number,
  email?: string,
): Promise<Boleta> {
  const { data } = await api.post<Boleta>(`/api/boletas/${id}/email`, { email });
  return data;
}

export async function descargarPdfBoleta(id: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/api/boletas/${id}/pdf`, {
    responseType: 'blob',
  });
  return data;
}

export async function exportarBoletasExcel(
  filtros: BoletaListFilters = {},
): Promise<Blob> {
  const params = cleanParams(filtros);
  const { data } = await api.get<Blob>('/api/boletas/export/excel', {
    params,
    responseType: 'blob',
  });
  return data;
}

export async function exportarBoletasSeleccion(ids: number[]): Promise<Blob> {
  const { data } = await api.get<Blob>('/api/boletas/export/excel', {
    params: { ids },
    responseType: 'blob',
  });
  return data;
}

export function pdfBoletaUrl(id: number): string {
  return `/api/boletas/${id}/pdf`;
}
