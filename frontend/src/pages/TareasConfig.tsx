import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { listarReglas, patchRegla } from '../api/tareas';
import type { ReglaTarea, AsignadoRol } from '../types/tarea';
import { useAuth } from '../hooks/useAuth';
import { useEffectivePermissions } from '../hooks/useEffectivePermissions';
import {
  Button, Input, EmptyState, Skeleton,
  Card,
  Table, THead, TBody, TR, TH, TD,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui';

function extractErrorDetail(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

type ReglaPatch = Partial<Pick<ReglaTarea, 'activa' | 'offset_dias' | 'asignado_rol'>>;

const TIPO_LABELS: Record<string, string> = {
  cotizacion_vence: 'Cotización por vencer',
  factura_vencida: 'Factura vencida',
  aprobacion_pendiente: 'Aprobación pendiente',
  nv_despachada_sin_avanzar: 'NV despachada sin avanzar',
  cliente_sin_actividad: 'Cliente sin actividad',
  stock_bajo_minimo: 'Stock bajo mínimo',
};

const ROL_OPTIONS: AsignadoRol[] = ['vendedor', 'admin', 'owner'];

function prettyTipo(tipo: string): string {
  return TIPO_LABELS[tipo] ?? tipo.replace(/_/g, ' ');
}

export default function TareasConfigPage() {
  const { user } = useAuth();
  const { role: effectiveRole } = useEffectivePermissions();
  const role = effectiveRole ?? user?.role;

  const { data: reglas = [], refetch, isLoading } = useQuery<ReglaTarea[]>({
    queryKey: ['reglas-tarea'],
    queryFn: listarReglas,
    enabled: role === 'admin',
  });

  const [dirty, setDirty] = useState<Record<string, ReglaPatch>>({});
  const [saving, setSaving] = useState(false);

  if (!user || role !== 'admin') return <Navigate to="/" replace />;

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
    try {
      for (const [tipo, patch] of Object.entries(dirty)) {
        await patchRegla(tipo, patch);
      }
      await refetch();
      setDirty({});
      toast.success('Cambios guardados');
    } catch (e: unknown) {
      toast.error(extractErrorDetail(e, 'Error al guardar reglas'));
      await refetch();
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDirty({});
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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : reglas.length === 0 ? (
        <EmptyState icon={<Inbox />} title="Sin reglas configuradas" />
      ) : (
        <Card>
          <Table density="compact">
            <THead>
              <TR>
                <TH>Regla</TH>
                <TH className="w-24">Activa</TH>
                <TH className="w-40">Offset (días)</TH>
                <TH className="w-48">Asignado a</TH>
              </TR>
            </THead>
            <TBody>
              {reglas.map((r) => {
                const activa = getValue(r, 'activa');
                const offsetDias = getValue(r, 'offset_dias');
                const rol = getValue(r, 'asignado_rol');
                const isDirty = !!dirty[r.tipo];
                return (
                  <TR key={r.tipo} className={isDirty ? 'bg-warning-50/50 dark:bg-warning-500/10' : ''}>
                    <TD>
                      <div className="font-medium text-gray-900 dark:text-white">{prettyTipo(r.tipo)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{r.tipo}</div>
                    </TD>
                    <TD>
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activa}
                          onChange={(e) => updateDirty(r.tipo, { activa: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500"
                        />
                      </label>
                    </TD>
                    <TD>
                      <Input
                        type="number"
                        size="sm"
                        min={0}
                        max={365}
                        value={offsetDias}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const parsed = raw === '' ? 0 : parseInt(raw, 10);
                          const clamped = Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(365, parsed));
                          updateDirty(r.tipo, { offset_dias: clamped });
                        }}
                        className="w-28 font-num"
                      />
                    </TD>
                    <TD>
                      <Select
                        value={rol}
                        onValueChange={(v) => updateDirty(r.tipo, { asignado_rol: v as AsignadoRol })}
                      >
                        <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROL_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt === 'owner' ? 'responsable' : opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <div className="mt-5 flex justify-end gap-2">
        {hasDirty && (
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Descartar cambios
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={!hasDirty || saving}
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  );
}
