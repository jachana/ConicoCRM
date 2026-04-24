import { api } from '../lib/api';
import type {
  Tarea,
  TareaPage,
  MisPendientes,
  ReglaTarea,
  TareaCreateInput,
  TareaFiltros,
  EntidadTipo,
} from '../types/tarea';

export async function listarTareas(filtros: TareaFiltros = {}): Promise<TareaPage> {
  const params = Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v != null),
  );
  const { data } = await api.get<TareaPage>('/api/tareas', { params });
  return data;
}

export async function misPendientes(): Promise<MisPendientes> {
  const { data } = await api.get<MisPendientes>('/api/tareas/mis-pendientes');
  return data;
}

export async function crearTarea(input: TareaCreateInput): Promise<Tarea> {
  const { data } = await api.post<Tarea>('/api/tareas', input);
  return data;
}

export async function getTarea(id: number): Promise<Tarea> {
  const { data } = await api.get<Tarea>(`/api/tareas/${id}`);
  return data;
}

export async function patchTarea(
  id: number,
  patch: Partial<TareaCreateInput>,
): Promise<Tarea> {
  const { data } = await api.patch<Tarea>(`/api/tareas/${id}`, patch);
  return data;
}

export async function deleteTarea(id: number): Promise<void> {
  await api.delete(`/api/tareas/${id}`);
}

export async function completarTarea(id: number): Promise<Tarea> {
  const { data } = await api.post<Tarea>(`/api/tareas/${id}/completar`);
  return data;
}

export async function descartarTarea(id: number, motivo: string): Promise<Tarea> {
  const { data } = await api.post<Tarea>(`/api/tareas/${id}/descartar`, { motivo });
  return data;
}

export async function reasignarTarea(id: number, asignado_id: number): Promise<Tarea> {
  const { data } = await api.post<Tarea>(`/api/tareas/${id}/reasignar`, { asignado_id });
  return data;
}

export async function timelineTareas(
  entidadTipo: EntidadTipo,
  entidadId: number,
): Promise<Tarea[]> {
  const { data } = await api.get<Tarea[]>(`/api/tareas/timeline/${entidadTipo}/${entidadId}`);
  return data;
}

export async function listarReglas(): Promise<ReglaTarea[]> {
  const { data } = await api.get<ReglaTarea[]>('/api/tareas/reglas');
  return data;
}

export async function patchRegla(
  tipo: string,
  patch: Partial<Pick<ReglaTarea, 'activa' | 'offset_dias' | 'asignado_rol'>>,
): Promise<ReglaTarea> {
  const { data } = await api.patch<ReglaTarea>(`/api/tareas/reglas/${tipo}`, patch);
  return data;
}
