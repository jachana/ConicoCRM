import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { timelineTareas } from '../api/tareas';
import type { Tarea, EntidadTipo } from '../types/tarea';
import TareaModal from './TareaModal';

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function estadoPrefix(estado: Tarea['estado']): string {
  if (estado === 'hecha') return '✓ ';
  if (estado === 'descartada') return '✕ ';
  return '';
}

interface Props {
  tipo: EntidadTipo;
  id: number;
}

export default function TareasRelacionadas({ tipo, id }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: tareas = [], isError, refetch } = useQuery<Tarea[]>({
    queryKey: ['tareas-timeline', tipo, id],
    queryFn: () => timelineTareas(tipo, id),
    enabled: !!id,
  });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 mb-5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>Tareas relacionadas ({tareas.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-1.5 text-sm transition-colors"
        >
          <Plus size={14} />
          Crear tarea
        </button>
      </div>

      {expanded && (
        <div className="mt-4">
          {isError ? (
            <div role="alert" className="px-3 py-2 text-sm text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-900 rounded-lg">
              Error al cargar tareas
            </div>
          ) : tareas.length === 0 ? (
            <div className="text-sm text-gray-400 dark:text-gray-500 py-2">Sin tareas</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {tareas.map((t) => (
                <li
                  key={t.id}
                  className="py-2 flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-gray-900 dark:text-gray-100 truncate">
                    {estadoPrefix(t.estado)}
                    {t.titulo}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {fmtDate(t.due_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {modalOpen && (
        <TareaModal
          vincularA={{ tipo, id }}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
