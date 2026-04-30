import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, GripVertical, Pencil, Trash2, FileText, X } from 'lucide-react'

import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import {
  getPipeline,
  moveOportunidad,
  createOportunidad,
  updateOportunidad,
  deleteOportunidad,
  convertToCotizacion,
  reporteConversion,
  type Etapa,
  type Oportunidad,
  type OportunidadCreate,
  type Pipeline,
} from '../api/oportunidades'

interface FormState {
  id?: number
  titulo: string
  cliente_id: number | null
  empresa_id: number | null
  vendedor_id: number | null
  monto_estimado: string
  probabilidad: number
  fecha_cierre_estimada: string
  descripcion: string
  motivo_perdida: string
}

const EMPTY_FORM: FormState = {
  titulo: '',
  cliente_id: null,
  empresa_id: null,
  vendedor_id: null,
  monto_estimado: '0',
  probabilidad: 0,
  fecha_cierre_estimada: '',
  descripcion: '',
  motivo_perdida: '',
}

interface RefRow { id: number; nombre?: string; name?: string }

function formatMoney(v: string | number): string {
  const n = typeof v === 'string' ? Number(v) : v
  if (!isFinite(n)) return '$0'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

export default function PipelinePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const { role: effectiveRole } = useEffectivePermissions()
  const isAdmin = effectiveRole === 'admin' || effectiveRole === 'subadmin'

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Oportunidad | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [dragOverEtapa, setDragOverEtapa] = useState<number | null>(null)

  const { data: pipeline, isLoading } = useQuery<Pipeline>({
    queryKey: ['pipeline'],
    queryFn: () => getPipeline(),
  })

  const { data: clientes = [] } = useQuery<RefRow[]>({
    queryKey: ['clientes-light'],
    queryFn: () => api.get('/api/clientes/').then(r => r.data),
    staleTime: 60_000,
  })
  const { data: empresas = [] } = useQuery<RefRow[]>({
    queryKey: ['empresas-light'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
    staleTime: 60_000,
  })
  const { data: usuarios = [] } = useQuery<RefRow[]>({
    queryKey: ['users-light'],
    queryFn: () => api.get('/api/users').then(r => r.data),
    enabled: isAdmin,
    staleTime: 60_000,
  })

  const { data: reporte } = useQuery({
    queryKey: ['oportunidades-reporte'],
    queryFn: () => reporteConversion(),
  })

  const moveMut = useMutation({
    mutationFn: ({ id, etapa_id, motivo_perdida }: { id: number; etapa_id: number; motivo_perdida?: string }) =>
      moveOportunidad(id, { etapa_id, motivo_perdida }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      qc.invalidateQueries({ queryKey: ['oportunidades-reporte'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error al mover oportunidad'),
  })

  const createMut = useMutation({
    mutationFn: (body: OportunidadCreate) => createOportunidad(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      qc.invalidateQueries({ queryKey: ['oportunidades-reporte'] })
      toast.success('Oportunidad creada')
      closeModal()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error al crear'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => updateOportunidad(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      qc.invalidateQueries({ queryKey: ['oportunidades-reporte'] })
      toast.success('Oportunidad actualizada')
      closeModal()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error al actualizar'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteOportunidad(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      qc.invalidateQueries({ queryKey: ['oportunidades-reporte'] })
      toast.success('Oportunidad eliminada')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  const convertMut = useMutation({
    mutationFn: (id: number) => convertToCotizacion(id),
    onSuccess: (data) => {
      toast.success(`Cotización #${data.cotizacion_numero} creada`)
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      navigate(`/cotizaciones/${data.cotizacion_id}`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error al convertir'),
  })

  const totalPipeline = useMemo(() => {
    if (!pipeline) return 0
    return pipeline.etapas
      .filter(e => !e.etapa.is_terminal_won && !e.etapa.is_terminal_lost)
      .reduce((acc, e) => acc + Number(e.total_monto || 0), 0)
  }, [pipeline])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, vendedor_id: user?.id ?? null })
    setShowCreate(true)
  }

  function openEdit(op: Oportunidad) {
    setEditing(op)
    setForm({
      id: op.id,
      titulo: op.titulo,
      cliente_id: op.cliente_id,
      empresa_id: op.empresa_id,
      vendedor_id: op.vendedor_id,
      monto_estimado: String(op.monto_estimado ?? '0'),
      probabilidad: op.probabilidad,
      fecha_cierre_estimada: op.fecha_cierre_estimada ?? '',
      descripcion: op.descripcion ?? '',
      motivo_perdida: op.motivo_perdida ?? '',
    })
    setShowCreate(true)
  }

  function closeModal() {
    setShowCreate(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  function submitForm() {
    if (!form.titulo.trim()) {
      toast.error('Título requerido')
      return
    }
    const payload = {
      titulo: form.titulo.trim(),
      cliente_id: form.cliente_id || null,
      empresa_id: form.empresa_id || null,
      vendedor_id: form.vendedor_id || null,
      monto_estimado: form.monto_estimado || '0',
      probabilidad: Number(form.probabilidad) || 0,
      fecha_cierre_estimada: form.fecha_cierre_estimada || null,
      descripcion: form.descripcion || null,
    }
    if (editing) {
      updateMut.mutate({
        id: editing.id,
        body: { ...payload, motivo_perdida: form.motivo_perdida || null },
      })
    } else {
      createMut.mutate(payload)
    }
  }

  function handleDrop(etapaId: number) {
    setDragOverEtapa(null)
    if (draggedId == null) return
    const etapa = pipeline?.etapas.find(e => e.etapa.id === etapaId)?.etapa
    if (!etapa) return
    let motivo: string | undefined
    if (etapa.is_terminal_lost) {
      const r = window.prompt('Motivo de pérdida (opcional):') ?? ''
      motivo = r || undefined
    }
    moveMut.mutate({ id: draggedId, etapa_id: etapaId, motivo_perdida: motivo })
    setDraggedId(null)
  }

  if (isLoading) {
    return <div className="p-6 text-gray-500">Cargando pipeline…</div>
  }

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pipeline / Oportunidades</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Arrastra tarjetas entre etapas. {reporte && `Tasa de conversión: ${(reporte.tasa_conversion * 100).toFixed(1)}%`}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Nueva oportunidad
        </Button>
      </header>

      {reporte && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Pipeline abierto" value={formatMoney(totalPipeline)} tone="brand" />
          <Stat label="Abiertas" value={String(reporte.abiertas)} />
          <Stat label="Ganadas" value={String(reporte.ganadas)} tone="success" />
          <Stat label="Perdidas" value={String(reporte.perdidas)} tone="danger" />
          <Stat label="Monto ganado" value={formatMoney(reporte.monto_ganado)} tone="success" />
        </div>
      )}

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 min-h-full pb-2" style={{ minWidth: 'min-content' }}>
          {pipeline?.etapas.map(({ etapa, oportunidades, total_monto, count }) => (
            <div
              key={etapa.id}
              className={`flex flex-col w-72 flex-shrink-0 rounded-lg bg-gray-50 dark:bg-gray-800/50 border-2 transition-colors
                ${dragOverEtapa === etapa.id ? 'border-brand-400' : 'border-transparent'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverEtapa(etapa.id) }}
              onDragLeave={() => setDragOverEtapa(null)}
              onDrop={() => handleDrop(etapa.id)}
            >
              <div
                className="px-3 py-2 rounded-t-lg flex items-center justify-between text-sm"
                style={{ borderTop: `3px solid ${etapa.color}` }}
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{etapa.nombre}</span>
                <span className="text-xs text-gray-500 ml-2">
                  {count} · {formatMoney(total_monto)}
                </span>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {oportunidades.map(op => (
                  <OpCard
                    key={op.id}
                    op={op}
                    onDragStart={() => setDraggedId(op.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onEdit={() => openEdit(op)}
                    onDelete={() => {
                      if (window.confirm(`¿Eliminar oportunidad "${op.titulo}"?`)) deleteMut.mutate(op.id)
                    }}
                    onConvert={() => convertMut.mutate(op.id)}
                  />
                ))}
                {oportunidades.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-6">Sin oportunidades</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={showCreate} onOpenChange={(v) => { if (!v) closeModal() }}>
        <ModalContent size="lg">
          <ModalHeader>
            <ModalTitle>{editing ? 'Editar oportunidad' : 'Nueva oportunidad'}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Título *" className="md:col-span-2">
                <Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
              </Field>
              <Field label="Cliente">
                <select
                  className={SELECT_CLS}
                  value={form.cliente_id ?? ''}
                  onChange={e => setForm({ ...form, cliente_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— Sin cliente —</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre ?? c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Empresa">
                <select
                  className={SELECT_CLS}
                  value={form.empresa_id ?? ''}
                  onChange={e => setForm({ ...form, empresa_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— Sin empresa —</option>
                  {empresas.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre ?? c.name}</option>
                  ))}
                </select>
              </Field>
              {isAdmin && (
                <Field label="Vendedor">
                  <select
                    className={SELECT_CLS}
                    value={form.vendedor_id ?? ''}
                    onChange={e => setForm({ ...form, vendedor_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">— Sin asignar —</option>
                    {usuarios.map(u => (
                      <option key={u.id} value={u.id}>{u.name ?? u.nombre}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Monto estimado">
                <Input
                  type="number"
                  step="0.01"
                  value={form.monto_estimado}
                  onChange={e => setForm({ ...form, monto_estimado: e.target.value })}
                />
              </Field>
              <Field label="Probabilidad %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.probabilidad}
                  onChange={e => setForm({ ...form, probabilidad: Number(e.target.value) })}
                />
              </Field>
              <Field label="Cierre estimado">
                <Input
                  type="date"
                  value={form.fecha_cierre_estimada}
                  onChange={e => setForm({ ...form, fecha_cierre_estimada: e.target.value })}
                />
              </Field>
              <Field label="Descripción" className="md:col-span-2">
                <Textarea
                  rows={3}
                  value={form.descripcion}
                  onChange={e => setForm({ ...form, descripcion: e.target.value })}
                />
              </Field>
              {editing?.is_terminal_lost && (
                <Field label="Motivo de pérdida" className="md:col-span-2">
                  <Input
                    value={form.motivo_perdida}
                    onChange={e => setForm({ ...form, motivo_perdida: e.target.value })}
                  />
                </Field>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button
              onClick={submitForm}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}

const SELECT_CLS = 'w-full h-9 px-3 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </label>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'brand' | 'success' | 'danger' }) {
  const toneCls =
    tone === 'success' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'danger' ? 'text-rose-600 dark:text-rose-400'
    : tone === 'brand' ? 'text-brand-600 dark:text-brand-400'
    : 'text-gray-900 dark:text-gray-100'
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${toneCls}`}>{value}</div>
    </div>
  )
}

interface OpCardProps {
  op: Oportunidad
  onDragStart: () => void
  onDragEnd: () => void
  onEdit: () => void
  onDelete: () => void
  onConvert: () => void
}

function OpCard({ op, onDragStart, onDragEnd, onEdit, onDelete, onConvert }: OpCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-2.5 shadow-sm hover:shadow cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="size-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{op.titulo}</div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">
            {op.cliente_nombre || op.empresa_nombre || '—'}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {formatMoney(op.monto_estimado)}
            </span>
            {op.probabilidad > 0 && (
              <span className="text-[10px] text-gray-500">{op.probabilidad}%</span>
            )}
          </div>
          {op.cotizacion_numero && (
            <div className="mt-1 text-[10px] text-brand-600 dark:text-brand-400">
              ↳ COT #{op.cotizacion_numero}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {!op.cotizacion_id && op.cliente_id && (
          <button
            onClick={onConvert}
            title="Convertir a cotización"
            className="p-1 rounded hover:bg-brand-100 dark:hover:bg-brand-900/30 text-brand-600"
          >
            <FileText className="size-3.5" />
          </button>
        )}
        <button
          onClick={onEdit}
          title="Editar"
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={onDelete}
          title="Eliminar"
          className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-600"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
