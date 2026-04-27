import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { crearTarea } from '../api/tareas';
import type { EntidadTipo, TareaCreateInput } from '../types/tarea';
import { useAuth } from '../hooks/useAuth';

function extractErrorDetail(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const ENTIDAD_LABEL: Record<EntidadTipo, string> = {
  cliente: 'Cliente',
  empresa: 'Empresa',
  cotizacion: 'Cotización',
  nota_venta: 'Nota de venta',
  factura: 'Factura',
  producto: 'Producto',
};

interface Props {
  onClose: () => void;
  onSaved: () => void;
  vincularA?: { tipo: EntidadTipo; id: number };
}

export default function TareaModal({ onClose, onSaved, vincularA }: Props) {
  const { user } = useAuth();
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [dueDate, setDueDate] = useState<string>(tomorrowISO());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!user) return null;

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!titulo.trim() || !dueDate) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: TareaCreateInput = {
        titulo: titulo.trim(),
        due_date: dueDate,
        asignado_id: user!.id,
        ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        ...(vincularA
          ? ({ [`${vincularA.tipo}_id`]: vincularA.id } as Partial<TareaCreateInput>)
          : {}),
      };
      await crearTarea(payload);
      onSaved();
    } catch (e: unknown) {
      setError(extractErrorDetail(e, 'Error al crear tarea'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tarea-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2
            id="tarea-modal-title"
            className="font-semibold text-gray-900 dark:text-white"
          >
            Nueva tarea
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {vincularA && (
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
              Vinculada a {ENTIDAD_LABEL[vincularA.tipo]} #{vincularA.id}
            </div>
          )}

          <div>
            <label
              htmlFor="tarea-titulo"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Título <span className="text-danger-500">*</span>
            </label>
            <input
              id="tarea-titulo"
              type="text"
              required
              maxLength={255}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label
              htmlFor="tarea-descripcion"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Descripción
            </label>
            <textarea
              id="tarea-descripcion"
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div>
            <label
              htmlFor="tarea-due"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Fecha de vencimiento <span className="text-danger-500">*</span>
            </label>
            <input
              id="tarea-due"
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && (
            <div role="alert" className="px-3 py-2 text-sm text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-900 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !titulo.trim() || !dueDate}
              className="bg-brand-500 hover:bg-brand-400 text-gray-900 font-semibold rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
