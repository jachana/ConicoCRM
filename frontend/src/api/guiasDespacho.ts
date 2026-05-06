// frontend/src/api/guiasDespacho.ts
import { api } from '../lib/api';

export type GuiaEstado = 'emitida' | 'anulada';
export type GuiaDteEstado =
  | 'no_emitida'
  | 'pendiente'
  | 'procesando'
  | 'aceptada'
  | 'rechazada';

export type MotivoTraslado = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const MOTIVOS_TRASLADO: { value: MotivoTraslado; label: string }[] = [
  { value: 1, label: '1 — Operación constituye venta' },
  { value: 2, label: '2 — Ventas por entregar' },
  { value: 3, label: '3 — Consignaciones' },
  { value: 4, label: '4 — Entrega gratuita' },
  { value: 5, label: '5 — Traslado interno' },
  { value: 6, label: '6 — Otros traslados no venta' },
  { value: 7, label: '7 — Guía de devolución' },
  { value: 8, label: '8 — Traslado para exportación' },
  { value: 9, label: '9 — Venta para exportación' },
];

export interface ClienteMin {
  id: number;
  nombre: string;
  rut?: string | null;
}

export interface VendedorMin {
  id: number;
  name: string;
}

export interface GuiaLineaInput {
  orden?: number;
  producto_id?: number | null;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct?: string;
  exenta?: boolean;
}

export interface GuiaLinea {
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

export interface GuiaDespacho {
  id: number;
  numero: number;
  fecha: string;
  cliente_id?: number | null;
  empresa_id?: number | null;
  nota_venta_id?: number | null;
  motivo_traslado: MotivoTraslado;
  direccion_destino: string;
  comuna_destino: string;
  email_envio?: string | null;
  vendedor_id?: number | null;
  total_neto: string;
  total_iva: string;
  total: string;
  estado: GuiaEstado;
  dte_estado: GuiaDteEstado;
  folio_sii?: number | null;
  track_id?: string | null;
  email_enviado_at?: string | null;
  created_at: string;
  updated_at: string;
  cliente?: ClienteMin | null;
  vendedor?: VendedorMin | null;
  nota_venta?: { id: number; numero: number } | null;
  lineas: GuiaLinea[];
}

export interface GuiaDespachoListItem {
  id: number;
  numero: number;
  fecha: string;
  cliente_id?: number | null;
  motivo_traslado: MotivoTraslado;
  nota_venta_id?: number | null;
  total: string;
  estado: GuiaEstado;
  dte_estado: GuiaDteEstado;
  cliente?: ClienteMin | null;
  vendedor?: VendedorMin | null;
}

export interface GuiaCreatePayload {
  fecha?: string;
  cliente_id: number;
  empresa_id?: number | null;
  nota_venta_id?: number | null;
  motivo_traslado: MotivoTraslado;
  direccion_destino: string;
  comuna_destino: string;
  email_envio?: string;
  lineas: GuiaLineaInput[];
}

export interface GuiaPatchPayload {
  direccion_destino?: string;
  comuna_destino?: string;
  email_envio?: string | null;
}

export interface GuiaListFilters {
  fecha_desde?: string;
  fecha_hasta?: string;
  cliente_id?: number;
  empresa_id?: number;
  motivo_traslado?: MotivoTraslado;
  estado?: GuiaEstado[];
  dte_estado?: GuiaDteEstado[];
  vendedor_id?: number;
  limit?: number;
  offset?: number;
}

export interface GuiaDespachoListResponse {
  data: GuiaDespachoListItem[];
  pagination: { limit: number; offset: number; total: number };
}

function cleanParams(filtros: GuiaListFilters): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => {
      if (v == null) return false;
      if (typeof v === 'string' && v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }),
  );
}

export async function listarGuiasDespacho(
  filtros: GuiaListFilters = {},
): Promise<GuiaDespachoListResponse> {
  const params = cleanParams(filtros);
  const { data } = await api.get<GuiaDespachoListResponse>('/api/guias-despacho/', { params });
  return data;
}

export async function getGuiaDespacho(id: number): Promise<GuiaDespacho> {
  const { data } = await api.get<GuiaDespacho>(`/api/guias-despacho/${id}`);
  return data;
}

export async function crearGuiaDespacho(payload: GuiaCreatePayload): Promise<GuiaDespacho> {
  const { data } = await api.post<GuiaDespacho>('/api/guias-despacho/', payload);
  return data;
}

export async function patchGuiaDespacho(
  id: number,
  payload: GuiaPatchPayload,
): Promise<GuiaDespacho> {
  const { data } = await api.patch<GuiaDespacho>(`/api/guias-despacho/${id}`, payload);
  return data;
}

export async function eliminarGuiaDespacho(id: number): Promise<void> {
  await api.delete(`/api/guias-despacho/${id}`);
}

export async function emitirGuiaDespachoDte(id: number): Promise<GuiaDespacho> {
  const { data } = await api.post<GuiaDespacho>(`/api/dte/guias-despacho/${id}/emitir`);
  return data;
}

export async function enviarEmailGuiaDespacho(
  id: number,
  email?: string,
): Promise<GuiaDespacho> {
  const { data } = await api.post<GuiaDespacho>(`/api/guias-despacho/${id}/email`, { email });
  return data;
}

export async function descargarPdfGuiaDespacho(id: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/api/guias-despacho/${id}/pdf`, {
    responseType: 'blob',
  });
  return data;
}

export async function exportarGuiasDespachoExcel(
  filtros: GuiaListFilters = {},
): Promise<Blob> {
  const params = cleanParams(filtros);
  const { data } = await api.get<Blob>('/api/guias-despacho/export/excel', {
    params,
    responseType: 'blob',
  });
  return data;
}

export function pdfGuiaDespachoUrl(id: number): string {
  return `/api/guias-despacho/${id}/pdf`;
}
