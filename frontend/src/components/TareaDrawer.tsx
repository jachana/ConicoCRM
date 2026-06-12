import { useEffect, useState } from 'react';
import { X, Check, Trash2, XCircle } from 'lucide-react';
import { completarTarea, descartarTarea, deleteTarea } from '../api/tareas';
import type { Tarea } from '../types/tarea';
import { useAuth } from '../hooks/useAuth';
import { useEffectivePermissions } from '../hooks/useEffectivePermissions';
import ConfirmModal from './ui/ConfirmModal';
import EntityLink, { type EntityKind } from './EntityLink';

function extractErrorDetail(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const ESTADO_LABEL: Record<Tarea['estado'], string> = {
  pendiente: 'Pendiente',
  hecha: 'Hecha',
  descartada: 'Descartada',
};

const ESTADO_CLASS: Record<Tarea['estado'], string> = {
  pendiente: 'bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-300',
  hecha: 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300',
  descartada: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

const ORIGEN_LABEL: Record<Tarea['origen'], string> = {
  manual: 'Manual',
  auto: 'Automática',
};

function entidadVinculada(t: Tarea): { kind: EntityKind; id: number; label: string } | null {
  if (t.cliente_id != null) return { kind: 'cliente', id: t.cliente_id, label: `Cliente #${t.cliente_id}` };
  if (t.empresa_id != null) return { kind: 'empresa', id: t.empresa_id, label: `Empresa #${t.empresa_id}` };
  if (t.cotizacion_id != null) return { kind: 'cotizacion', id: t.cotizacion_id, label: `Cotización N° ${t.cotizacion_id}` };
  if (t.nota_venta_id != null) return { kind: 'nv', id: t.nota_venta_id, label: `Nota de venta N° ${t.nota_venta_id}` };
  if (t.factura_id != null) return { kind: 'factura', id: t.factura_id, label: `Factura N° ${t.factura_id}` };
  if (t.producto_id != null) return { kind: 'producto', id: t.producto_id, label: `Producto #${t.producto_id}` };
  return null;
}

interface Props {
  tarea: Tarea;
  onClose: () => void;
  onChanged: () => void;
}

export default function TareaDrawer({ tarea, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const { role: effectiveRole } = useEffectivePermissions();
  const isAdmin = (effectiveRole ?? user?.role) === 'admin';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEliminar, setConfirmEliminar] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const vinculo = entidadVinculada(tarea);
  const esPendiente = tarea.estado === 'pendiente';
  const puedeDescartar = esPendiente && (tarea.origen === 'auto' || isAdmin);
  const puedeEliminar = esPendiente && tarea.origen === 'manual' && isAdmin;

  async function handleCompletar() {
    setBusy(true);
    setError(null);
    try {
      await completarTarea(tarea.id);
      onChanged();
      onClose();
    } catch (e: unknown) {
      setError(extractErrorDetail(e, 'Error al completar tarea'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDescartar() {
    if (busy) return;
    const motivo = prompt('Motivo del descarte:');
    if (!motivo) return;
    setBusy(true);
    setError(null);
    try {
      await descartarTarea(tarea.id, motivo);
      onChanged();
      onClose();
    } catch (e: unknown) {
      setError(extractErrorDetail(e, 'Error al descartar tarea'));
    } finally {
      setBusy(false);
    }
  }

  async function handleEliminar() {
    if (busy) return;
    setConfirmEliminar(false);
    setBusy(true);
    setError(null);
    try {
      await deleteTarea(tarea.id);
      onChanged();
      onClose();
    } catch (e: unknown) {
      setError(extractErrorDetail(e, 'Error al eliminar tarea'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tarea-drawer-title"
      className="fixed inset-0 z-50"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside className="absolute top-0 right-0 h-full w-[420px] max-w-full bg-white dark:bg-gray-900 shadow-xl flex flex-col border-l border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="min-w-0">
            <h2
              id="tarea-drawer-title"
              className="font-semibold text-gray-900 dark:text-white text-base leading-tight break-words"
            >
              {tarea.titulo}
            </h2>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_CLASS[tarea.estado]}`}
              >
                {ESTADO_LABEL[tarea.estado]}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {ORIGEN_LABEL[tarea.origen]}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Vence
              </dt>
              <dd className="mt-0.5 text-gray-900 dark:text-white">
                {fmtDate(tarea.due_date)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Asignado a
              </dt>
              <dd className="mt-0.5 text-gray-900 dark:text-white">
                {tarea.asignado_nombre}
              </dd>
            </div>

            {vinculo && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Vinculado a
                </dt>
                <dd className="mt-0.5 text-gray-900 dark:text-white">
                  <EntityLink kind={vinculo.kind} id={vinculo.id}>
                    {vinculo.label}
                  </EntityLink>
                </dd>
              </div>
            )}

            {tarea.descripcion && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Descripción
                </dt>
                <dd className="mt-0.5 text-gray-900 dark:text-white whitespace-pre-wrap break-words">
                  {tarea.descripcion}
                </dd>
              </div>
            )}

            {tarea.motivo_descarte && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Motivo de descarte
                </dt>
                <dd className="mt-0.5 text-gray-900 dark:text-white whitespace-pre-wrap break-words">
                  {tarea.motivo_descarte}
                </dd>
              </div>
            )}
          </dl>

          {error && (
            <div role="alert" className="px-3 py-2 text-sm text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-900 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {esPendiente && (
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex flex-wrap gap-2 justify-end">
            {puedeEliminar && (
              <button
                type="button"
                onClick={() => setConfirmEliminar(true)}
                disabled={busy}
                aria-label="Eliminar tarea"
                className="inline-flex items-center gap-1.5 bg-danger-600 hover:bg-danger-700 text-white rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
              >
                <Trash2 size={15} />
                Eliminar
              </button>
            )}
            {puedeDescartar && (
              <button
                type="button"
                onClick={handleDescartar}
                disabled={busy}
                aria-label="Descartar tarea"
                className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
              >
                <XCircle size={15} />
                Descartar
              </button>
            )}
            <button
              type="button"
              onClick={handleCompletar}
              disabled={busy}
              aria-label="Completar tarea"
              className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-400 text-gray-900 font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
            >
              <Check size={15} />
              Completar
            </button>
          </div>
        )}
      </aside>
    </div>
    <ConfirmModal
      open={confirmEliminar}
      onOpenChange={setConfirmEliminar}
      title="¿Eliminar esta tarea?"
      description="Esta acción no se puede deshacer."
      confirmLabel="Eliminar"
      onConfirm={handleEliminar}
      isPending={busy}
    />
    </>
  );
}
