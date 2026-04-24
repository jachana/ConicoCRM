import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listarReglas, patchRegla } from '../api/tareas';
import type { ReglaTarea, AsignadoRol } from '../types/tarea';
import { useAuth } from '../hooks/useAuth';

function extractErrorDetail(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

type ReglaPatch = Partial<Pick<ReglaTarea, 'activa' | 'offset_dias' | 'asignado_rol'>>;

const TIPO_LABELS: Record<string, string> = {
  cotizacion_vence: 'Cotización por vencer',
  factura_vencida: 'Factura vencida',
  aprobacion_pendiente: 'Aprobación pendiente',
  nv_despachada_sin_factura: 'NV despachada sin factura',
  cliente_inactivo: 'Cliente inactivo',
  stock_bajo: 'Stock bajo',
};

const ROL_OPTIONS: AsignadoRol[] = ['vendedor', 'admin', 'owner'];

function prettyTipo(tipo: string): string {
  return TIPO_LABELS[tipo] ?? tipo.replace(/_/g, ' ');
}

export default function TareasConfigPage() {
  const { user } = useAuth();

  const { data: reglas = [], refetch, isLoading } = useQuery<ReglaTarea[]>({
    queryKey: ['reglas-tarea'],
    queryFn: listarReglas,
    enabled: user?.role === 'admin',
  });

  const [dirty, setDirty] = useState<Record<string, ReglaPatch>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;

  function updateDirty(tipo: string, patch: ReglaPatch) {
    setDirty(prev => ({ ...prev, [tipo]: { ...prev[tipo], ...patch } }));
  }

  function getValue<K extends keyof ReglaTarea>(r: ReglaTarea, key: K): ReglaTarea[K] {
    const patch = dirty[r.tipo];
    if (patch && key in patch) return (patch as Record<string, unknown>)[key as string] as ReglaTarea[K];
    return r[key];
  }

  const hasDirty = Object.keys(dirty).length > 0;

  async function handleSave() {
    if (!hasDirty || saving) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      for (const [tipo, patch] of Object.entries(dirty)) {
        await patchRegla(tipo, patch);
      }
      await refetch();
      setDirty({});
      setSuccessMsg('Cambios guardados');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: unknown) {
      setError(extractErrorDetail(e, 'Error al guardar reglas'));
      await refetch();
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDirty({});
    setError(null);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-5 gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Reglas de tareas automáticas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configura qué reglas generan tareas automáticas, cuándo se disparan y a quién se asignan.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 px-3 py-2 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          {successMsg}
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400 py-12 text-center text-sm">Cargando...</div>
      ) : reglas.length === 0 ? (
        <div className="text-gray-400 py-12 text-center text-sm">Sin reglas configuradas</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Regla</th>
                <th className="text-left px-4 py-3 font-medium w-24">Activa</th>
                <th className="text-left px-4 py-3 font-medium w-40">Offset (días)</th>
                <th className="text-left px-4 py-3 font-medium w-48">Asignado a</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {reglas.map((r) => {
                const activa = getValue(r, 'activa');
                const offsetDias = getValue(r, 'offset_dias');
                const rol = getValue(r, 'asignado_rol');
                const isDirty = !!dirty[r.tipo];
                return (
                  <tr key={r.tipo} className={isDirty ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{prettyTipo(r.tipo)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{r.tipo}</div>
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activa}
                          onChange={(e) => updateDirty(r.tipo, { activa: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500"
                        />
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={offsetDias}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const parsed = raw === '' ? 0 : parseInt(raw, 10);
                          const clamped = Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(365, parsed));
                          updateDirty(r.tipo, { offset_dias: clamped });
                        }}
                        className="w-28 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={rol}
                        onChange={(e) => updateDirty(r.tipo, { asignado_rol: e.target.value as AsignadoRol })}
                        className="w-40 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {ROL_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        {hasDirty && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Descartar cambios
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasDirty || saving}
          className="bg-brand-500 hover:bg-brand-400 text-gray-900 font-semibold rounded-lg px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
