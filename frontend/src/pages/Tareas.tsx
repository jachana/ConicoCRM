import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Check, X } from 'lucide-react';
import { listarTareas, completarTarea, descartarTarea } from '../api/tareas';
import type { Tarea, TareaEstado, TareaFiltros } from '../types/tarea';
import { useAuth } from '../hooks/useAuth';
import TareaModal from '../components/TareaModal';
import TareaDrawer from '../components/TareaDrawer';

const ICONO_PRIORIDAD: Record<string, string> = {
  vencida: '🔴',
  hoy: '🟡',
  futura: '⚪',
};

const TAB_LABELS: Record<TareaEstado, string> = {
  pendiente: 'Pendientes',
  hecha: 'Hechas',
  descartada: 'Descartadas',
};

const TABS: TareaEstado[] = ['pendiente', 'hecha', 'descartada'];

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function entidadLink(t: Tarea): { label: string; href: string } | null {
  if (t.cotizacion_id) return { label: `Cotización #${t.cotizacion_id}`, href: `/cotizaciones/${t.cotizacion_id}` };
  if (t.nota_venta_id) return { label: `NV #${t.nota_venta_id}`, href: `/notas-venta/${t.nota_venta_id}` };
  if (t.factura_id) return { label: `Factura #${t.factura_id}`, href: `/facturas/${t.factura_id}` };
  if (t.cliente_id) return { label: `Cliente #${t.cliente_id}`, href: `/clientes/${t.cliente_id}` };
  if (t.empresa_id) return { label: `Empresa #${t.empresa_id}`, href: `/empresas/${t.empresa_id}` };
  if (t.producto_id) return { label: `Producto #${t.producto_id}`, href: `/catalogo/${t.producto_id}` };
  return null;
}

export default function TareasPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<TareaEstado>('pendiente');
  const [filtros] = useState<TareaFiltros>({ estado: 'pendiente' });
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerTarea, setDrawerTarea] = useState<Tarea | null>(null);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const { items, total } = await listarTareas({ ...filtros, estado: tab });
      setTareas(items);
      setTotal(total);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al cargar tareas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, JSON.stringify(filtros)]);

  async function handleCompletar(t: Tarea, ev: React.MouseEvent) {
    ev.stopPropagation();
    try {
      await completarTarea(t.id);
      cargar();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al completar tarea');
    }
  }

  async function handleDescartar(t: Tarea, ev: React.MouseEvent) {
    ev.stopPropagation();
    const motivo = prompt('Motivo del descarte:');
    if (!motivo) return;
    try {
      await descartarTarea(t.id, motivo);
      cargar();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al descartar tarea');
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Tareas</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-500 hover:bg-brand-400 text-gray-900 text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nueva tarea</span>
          <span className="sm:hidden">Nueva</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b border-gray-200 dark:border-gray-800 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {TAB_LABELS[t]}
            {tab === t && total > 0 && (
              <span className="ml-2 text-xs text-gray-400">({total})</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-gray-400 py-12 text-center text-sm">Cargando...</div>
      ) : tareas.length === 0 ? (
        <div className="text-gray-400 py-12 text-center text-sm">Sin tareas</div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {tareas.map((t) => {
              const link = entidadLink(t);
              const puedeDescarter = tab === 'pendiente' && (t.origen === 'auto' || isAdmin);
              return (
                <div
                  key={t.id}
                  onClick={() => setDrawerTarea(t)}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base" title={t.prioridad_derivada}>
                          {ICONO_PRIORIDAD[t.prioridad_derivada] ?? '⚪'}
                        </span>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">
                          {t.titulo}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 pl-7">
                        {link && (
                          <Link
                            to={link.href}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            {link.label}
                          </Link>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t.asignado_nombre}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Vence {fmtDate(t.due_date)}
                        </span>
                      </div>
                    </div>
                    {tab === 'pendiente' && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => handleCompletar(t, e)}
                          title="Completar"
                          className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                        >
                          <Check size={16} />
                        </button>
                        {puedeDescarter && (
                          <button
                            onClick={(e) => handleDescartar(t, e)}
                            title="Descartar"
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium w-10"></th>
                  <th className="text-left px-4 py-3 font-medium">Título</th>
                  <th className="text-left px-4 py-3 font-medium">Vinculado</th>
                  <th className="text-left px-4 py-3 font-medium">Asignado</th>
                  <th className="text-left px-4 py-3 font-medium">Vence</th>
                  <th className="text-left px-4 py-3 font-medium w-24">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {tareas.map((t) => {
                  const link = entidadLink(t);
                  const puedeDescarter = tab === 'pendiente' && (t.origen === 'auto' || isAdmin);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setDrawerTarea(t)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-base" title={t.prioridad_derivada}>
                        {ICONO_PRIORIDAD[t.prioridad_derivada] ?? '⚪'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {t.titulo}
                      </td>
                      <td className="px-4 py-3">
                        {link ? (
                          <Link
                            to={link.href}
                            onClick={(e) => e.stopPropagation()}
                            className="text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            {link.label}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {t.asignado_nombre}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {fmtDate(t.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        {tab === 'pendiente' ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => handleCompletar(t, e)}
                              title="Completar"
                              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                            >
                              <Check size={15} />
                            </button>
                            {puedeDescarter && (
                              <button
                                onClick={(e) => handleDescartar(t, e)}
                                title="Descartar"
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              >
                                <X size={15} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalOpen && (
        <TareaModal
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            cargar();
          }}
        />
      )}

      {drawerTarea && (
        <TareaDrawer
          tarea={drawerTarea}
          onClose={() => setDrawerTarea(null)}
          onChanged={cargar}
        />
      )}
    </div>
  );
}
