import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Check, X, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { listarTareas, completarTarea, descartarTarea } from '../api/tareas';
import type { Tarea, TareaEstado } from '../types/tarea';
import { useAuth } from '../hooks/useAuth';
import TareaModal from '../components/TareaModal';
import TareaDrawer from '../components/TareaDrawer';
import {
  Button, FormField, Textarea, EmptyState, Skeleton, Tooltip,
  Card, CardContent,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Tabs, TabsList, TabsTrigger,
} from '../components/ui';

function extractErrorDetail(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

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
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerTarea, setDrawerTarea] = useState<Tarea | null>(null);
  const [discardTarget, setDiscardTarget] = useState<Tarea | null>(null);
  const [discardMotivo, setDiscardMotivo] = useState('');
  const [discardSaving, setDiscardSaving] = useState(false);
  const requestIdRef = useRef(0);

  async function cargar() {
    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const { items, total } = await listarTareas({ estado: tab });
      if (id !== requestIdRef.current) return;
      setTareas(items);
      setTotal(total);
    } catch (e: unknown) {
      if (id !== requestIdRef.current) return;
      setError(extractErrorDetail(e, 'Error al cargar tareas'));
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleCompletar(t: Tarea, ev: React.MouseEvent) {
    ev.stopPropagation();
    try {
      await completarTarea(t.id);
      cargar();
    } catch (e: unknown) {
      toast.error(extractErrorDetail(e, 'Error al completar tarea'));
    }
  }

  function openDiscardModal(t: Tarea, ev: React.MouseEvent) {
    ev.stopPropagation();
    setDiscardTarget(t);
    setDiscardMotivo('');
  }

  function closeDiscardModal() {
    setDiscardTarget(null);
    setDiscardMotivo('');
    setDiscardSaving(false);
  }

  async function confirmDiscard() {
    if (!discardTarget) return;
    const motivo = discardMotivo.trim();
    if (!motivo) return;
    setDiscardSaving(true);
    try {
      await descartarTarea(discardTarget.id, motivo);
      closeDiscardModal();
      cargar();
    } catch (e: unknown) {
      toast.error(extractErrorDetail(e, 'Error al descartar tarea'));
      setDiscardSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Tareas</h1>
        <Button leftIcon={<Plus size={16} />} onClick={() => setModalOpen(true)}>
          <span className="hidden sm:inline">Nueva tarea</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TareaEstado)} className="mb-4">
        <TabsList variant="underline">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TAB_LABELS[t]}
              {tab === t && total > 0 && (
                <span className="ml-1 text-xs text-gray-400 font-num">({total})</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error && (
        <div className="mb-4 px-3 py-2 text-sm text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-500/10 border border-danger-500/30 rounded-lg">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : tareas.length === 0 ? (
        <EmptyState icon={<Inbox />} title="Sin tareas" />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {tareas.map((t) => {
              const link = entidadLink(t);
              const puedeDescartar = tab === 'pendiente' && (t.origen === 'auto' || isAdmin);
              return (
                <Card
                  key={t.id}
                  onClick={() => setDrawerTarea(t)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Tooltip label={t.prioridad_derivada}>
                            <span className="text-base">
                              {ICONO_PRIORIDAD[t.prioridad_derivada] ?? '⚪'}
                            </span>
                          </Tooltip>
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
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-num">
                            Vence {fmtDate(t.due_date)}
                          </span>
                        </div>
                      </div>
                      {tab === 'pendiente' && (
                        <div className="flex gap-1 flex-shrink-0">
                          <Tooltip label="Completar">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={(e) => handleCompletar(t, e)}
                            >
                              <Check size={16} />
                            </Button>
                          </Tooltip>
                          {puedeDescartar && (
                            <Tooltip label="Descartar">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-gray-500 hover:text-danger-600 hover:bg-danger-500/10"
                                onClick={(e) => openDiscardModal(t, e)}
                              >
                                <X size={16} />
                              </Button>
                            </Tooltip>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <Table density="compact">
                <THead>
                  <TR>
                    <TH className="w-10" />
                    <TH>Título</TH>
                    <TH>Vinculado</TH>
                    <TH>Asignado</TH>
                    <TH>Vence</TH>
                    <TH className="w-24">Acciones</TH>
                  </TR>
                </THead>
                <TBody>
                  {tareas.map((t) => {
                    const link = entidadLink(t);
                    const puedeDescartar = tab === 'pendiente' && (t.origen === 'auto' || isAdmin);
                    return (
                      <TR key={t.id} interactive onClick={() => setDrawerTarea(t)}>
                        <TD>
                          <Tooltip label={t.prioridad_derivada}>
                            <span className="text-base">
                              {ICONO_PRIORIDAD[t.prioridad_derivada] ?? '⚪'}
                            </span>
                          </Tooltip>
                        </TD>
                        <TD className="font-medium text-gray-900 dark:text-white">
                          {t.titulo}
                        </TD>
                        <TD>
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
                        </TD>
                        <TD className="text-gray-500 dark:text-gray-400">
                          {t.asignado_nombre}
                        </TD>
                        <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">
                          {fmtDate(t.due_date)}
                        </TD>
                        <TD>
                          {tab === 'pendiente' ? (
                            <div className="flex items-center gap-1">
                              <Tooltip label="Completar">
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={(e) => handleCompletar(t, e)}
                                >
                                  <Check size={15} />
                                </Button>
                              </Tooltip>
                              {puedeDescartar && (
                                <Tooltip label="Descartar">
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    className="text-gray-500 hover:text-danger-600 hover:bg-danger-500/10"
                                    onClick={(e) => openDiscardModal(t, e)}
                                  >
                                    <X size={15} />
                                  </Button>
                                </Tooltip>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
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

      {/* Discard modal — replaces prompt() */}
      <Modal
        open={!!discardTarget}
        onOpenChange={(o) => { if (!o && !discardSaving) closeDiscardModal() }}
      >
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Descartar tarea</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {discardTarget?.titulo}
            </p>
            <FormField label="Motivo del descarte" required>
              <Textarea
                value={discardMotivo}
                onChange={(e) => setDiscardMotivo(e.target.value)}
                placeholder="Explica por qué se descarta esta tarea..."
                rows={3}
                autoFocus
              />
            </FormField>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={closeDiscardModal} disabled={discardSaving}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={!discardMotivo.trim() || discardSaving}
              onClick={confirmDiscard}
            >
              {discardSaving ? 'Descartando…' : 'Descartar'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
