import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Pencil, Trash2, Upload, Download, Users } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { Empleado, EmpleadoDocumento, EmpleadoVacacion } from '../types'
import {
  Button, Input, FormField, EmptyState, Skeleton, Tooltip, Badge,
  Card,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'

function extractErrorDetail(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

type EmpleadoForm = { nombre: string; cargo: string; sueldo_base: string; fecha_ingreso: string; is_active: boolean }
const EMPTY_FORM: EmpleadoForm = { nombre: '', cargo: '', sueldo_base: '', fecha_ingreso: '', is_active: true }

type VacForm = { fecha_inicio: string; fecha_fin: string; dias: string; descripcion: string }
const EMPTY_VAC: VacForm = { fecha_inicio: '', fecha_fin: '', dias: '', descripcion: '' }

function calcDias(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0
  const diff = (new Date(fin).getTime() - new Date(inicio).getTime()) / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.round(diff) + 1)
}

const TIPO_LABELS = { contrato: 'Contrato', liquidacion: 'Liquidación', otro: 'Otro' }

export default function RRHH() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [form, setForm] = useState<EmpleadoForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Empleado | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [detalle, setDetalle] = useState<Empleado | null>(null)
  const [vacModalOpen, setVacModalOpen] = useState(false)
  const [vacForm, setVacForm] = useState<VacForm>(EMPTY_VAC)
  const [vacError, setVacError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTipo, setUploadTipo] = useState<'contrato' | 'liquidacion' | 'otro'>('contrato')

  const { data: empleados = [], isLoading } = useQuery<Empleado[]>({
    queryKey: ['empleados', busqueda],
    queryFn: () => api.get(`/api/empleados/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const detalleId = searchParams.get('detalle')
    if (!detalleId || detalle) return
    const found = empleados.find(e => e.id === Number(detalleId))
    if (found) {
      setDetalle(found)
      const next = new URLSearchParams(searchParams)
      next.delete('detalle')
      setSearchParams(next, { replace: true })
      return
    }
    api.get(`/api/empleados/${detalleId}`).then(r => {
      setDetalle(r.data)
      const next = new URLSearchParams(searchParams)
      next.delete('detalle')
      setSearchParams(next, { replace: true })
    }).catch(() => {})
  }, [searchParams, empleados, detalle, setSearchParams])

  const { data: docs = [] } = useQuery<EmpleadoDocumento[]>({
    queryKey: ['empleado-docs', detalle?.id],
    queryFn: () => api.get(`/api/empleados/${detalle!.id}/documentos/`).then(r => r.data),
    enabled: !!detalle,
  })

  const { data: vacaciones = [] } = useQuery<EmpleadoVacacion[]>({
    queryKey: ['empleado-vacs', detalle?.id],
    queryFn: () => api.get(`/api/empleados/${detalle!.id}/vacaciones/`).then(r => r.data),
    enabled: !!detalle,
  })

  function abrirCrear() {
    setEditando(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true)
  }

  function abrirEditar(e: Empleado) {
    setEditando(e)
    setForm({
      nombre: e.nombre, cargo: e.cargo,
      sueldo_base: e.sueldo_base != null ? String(e.sueldo_base) : '',
      fecha_ingreso: e.fecha_ingreso ?? '',
      is_active: e.is_active,
    })
    setFormError(null); setModalOpen(true)
  }

  function abrirDetalle(e: Empleado) {
    setDetalle(e)
  }

  function cerrarModal() {
    setModalOpen(false)
    setEditando(null)
    setFormError(null)
  }

  const guardarEmpleado = useMutation({
    mutationFn: (data: EmpleadoForm) => {
      const payload = {
        nombre: data.nombre, cargo: data.cargo, is_active: data.is_active,
        sueldo_base: data.sueldo_base ? parseFloat(data.sueldo_base) : null,
        fecha_ingreso: data.fecha_ingreso || null,
      }
      if (editando) return api.patch(`/api/empleados/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/empleados/', payload).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      cerrarModal()
      toast.success(editando ? 'Empleado actualizado' : 'Empleado creado')
    },
    onError: (e: unknown) => setFormError(extractErrorDetail(e, 'Error al guardar')),
  })

  const eliminarEmpleado = useMutation({
    mutationFn: (id: number) => api.delete(`/api/empleados/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      if (detalle) setDetalle(null)
      setConfirmDelete(null)
      setDeleteError(null)
      toast.success('Empleado eliminado')
    },
    onError: (e: unknown) => setDeleteError(extractErrorDetail(e, 'Error al eliminar')),
  })

  const subirDoc = useMutation({
    mutationFn: async ({ file, tipo }: { file: File; tipo: string }) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tipo', tipo)
      return api.post(`/api/empleados/${detalle!.id}/documentos/`, fd).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empleado-docs', detalle?.id] }),
    onError: (e: unknown) => toast.error(extractErrorDetail(e, 'Error al subir')),
  })

  const eliminarDoc = useMutation({
    mutationFn: (docId: number) => api.delete(`/api/empleados/${detalle!.id}/documentos/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empleado-docs', detalle?.id] }),
    onError: (e: unknown) => toast.error(extractErrorDetail(e, 'Error al eliminar documento')),
  })

  async function descargarDoc(doc: EmpleadoDocumento) {
    const resp = await api.get(`/api/empleados/${detalle!.id}/documentos/${doc.id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a'); a.href = url; a.download = doc.nombre; a.click()
    URL.revokeObjectURL(url)
  }

  const guardarVac = useMutation({
    mutationFn: (data: VacForm) => api.post(`/api/empleados/${detalle!.id}/vacaciones/`, {
      fecha_inicio: data.fecha_inicio, fecha_fin: data.fecha_fin,
      dias: parseInt(data.dias) || 0, descripcion: data.descripcion || null,
    }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleado-vacs', detalle?.id] }); setVacModalOpen(false); setVacForm(EMPTY_VAC) },
    onError: (e: unknown) => {
      const msg = extractErrorDetail(e, 'Error al guardar')
      setVacError(msg)
      toast.error(msg)
    },
  })

  const eliminarVac = useMutation({
    mutationFn: (vacId: number) => api.delete(`/api/empleados/${detalle!.id}/vacaciones/${vacId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empleado-vacs', detalle?.id] }),
    onError: (e: unknown) => toast.error(extractErrorDetail(e, 'Error al eliminar período')),
  })

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">RRHH</h1>
        <Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>
          Agregar empleado
        </Button>
      </div>

      <div className="mb-4 max-w-sm">
        <FormField>
          <Input
            type="text"
            placeholder="Buscar por nombre o cargo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            leftAddon={<Search size={16} />}
          />
        </FormField>
      </div>

      {isLoading ? (
        <Card padded>
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        </Card>
      ) : empleados.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={<Users />}
            title="Sin empleados registrados"
            description="Agrega tu primer empleado para empezar"
            action={<Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>Agregar empleado</Button>}
          />
        </Card>
      ) : (
        <Card>
          <Table density="compact">
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Cargo</TH>
                <TH className="text-right">Sueldo Base</TH>
                <TH>Fecha Ingreso</TH>
                <TH>Estado</TH>
                <TH className="w-24" />
              </TR>
            </THead>
            <TBody>
              {empleados.map(e => (
                <TR key={e.id} interactive onClick={() => abrirDetalle(e)}>
                  <TD className="font-medium text-gray-900 dark:text-white">{e.nombre}</TD>
                  <TD className="text-gray-500 dark:text-gray-400">{e.cargo}</TD>
                  <TD className="text-right font-num text-gray-900 dark:text-white">
                    {e.sueldo_base != null ? `$${e.sueldo_base.toLocaleString('es-CL')}` : <span className="text-gray-400">—</span>}
                  </TD>
                  <TD className="text-gray-500 dark:text-gray-400 font-num">{e.fecha_ingreso ?? '—'}</TD>
                  <TD>
                    {e.is_active
                      ? <Badge variant="success">Activo</Badge>
                      : <Badge variant="neutral">Inactivo</Badge>}
                  </TD>
                  <TD onClick={ev => ev.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Tooltip label="Editar">
                        <Button size="icon-sm" variant="ghost" onClick={() => abrirEditar(e)}>
                          <Pencil size={14} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Eliminar">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-danger-500 hover:text-danger-600 hover:bg-danger-500/10"
                          onClick={() => { setConfirmDelete(e); setDeleteError(null) }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </Tooltip>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {/* Modal crear/editar empleado */}
      <Modal open={modalOpen} onOpenChange={open => { if (!open) cerrarModal() }}>
        <ModalContent size="md">
          <ModalHeader>
            <ModalTitle>{editando ? 'Editar empleado' : 'Nuevo empleado'}</ModalTitle>
          </ModalHeader>
          <form onSubmit={ev => { ev.preventDefault(); guardarEmpleado.mutate(form) }} className="flex flex-col flex-1 min-h-0">
            <ModalBody>
              <div className="space-y-4">
                <FormField label="Nombre" required>
                  <Input
                    type="text" required
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  />
                </FormField>
                <FormField label="Cargo" required>
                  <Input
                    type="text" required
                    value={form.cargo}
                    onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                  />
                </FormField>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Sueldo Base">
                    <Input
                      type="number" min="0" step="1000"
                      value={form.sueldo_base}
                      onChange={e => setForm(f => ({ ...f, sueldo_base: e.target.value }))}
                    />
                  </FormField>
                  <FormField label="Fecha Ingreso">
                    <Input
                      type="date"
                      value={form.fecha_ingreso}
                      onChange={e => setForm(f => ({ ...f, fecha_ingreso: e.target.value }))}
                    />
                  </FormField>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="size-4 rounded border-gray-300 dark:border-gray-600 text-brand-600 focus:ring-brand-500/20"
                  />
                  Activo
                </label>
                {formError && <p className="text-xs text-danger-600 dark:text-danger-400">{formError}</p>}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={cerrarModal}>Cancelar</Button>
              <Button type="submit" disabled={guardarEmpleado.isPending}>
                {guardarEmpleado.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      {/* Confirm delete empleado */}
      <Modal open={!!confirmDelete} onOpenChange={open => { if (!open) { setConfirmDelete(null); setDeleteError(null) } }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Eliminar empleado</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ¿Eliminar empleado <span className="font-medium text-gray-900 dark:text-white">{confirmDelete?.nombre}</span>? Esta acción no se puede deshacer.
            </p>
            {deleteError && (
              <p className="mt-3 text-xs text-danger-600 dark:text-danger-400">{deleteError}</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => { setConfirmDelete(null); setDeleteError(null) }}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={eliminarEmpleado.isPending}
              onClick={() => confirmDelete && eliminarEmpleado.mutate(confirmDelete.id)}
            >
              {eliminarEmpleado.isPending ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Panel de detalle */}
      <Modal open={!!detalle} onOpenChange={open => { if (!open) setDetalle(null) }}>
        <ModalContent size="xl">
          <ModalHeader>
            <ModalTitle>{detalle?.nombre}</ModalTitle>
            <p className="text-xs text-gray-500 dark:text-gray-400">{detalle?.cargo}</p>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-6">
              {/* Documentos */}
              <section>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Documentos</h3>
                  <div className="flex items-center gap-2">
                    <Select value={uploadTipo} onValueChange={v => setUploadTipo(v as typeof uploadTipo)}>
                      <SelectTrigger size="sm" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contrato">Contrato</SelectItem>
                        <SelectItem value="liquidacion">Liquidación</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" leftIcon={<Upload size={14} />} onClick={() => fileInputRef.current?.click()}>
                      Subir archivo
                    </Button>
                    <input
                      ref={fileInputRef} type="file" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) subirDoc.mutate({ file: f, tipo: uploadTipo })
                        e.target.value = ''
                      }}
                    />
                  </div>
                </div>
                {docs.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sin archivos subidos</p>
                ) : (
                  <Card>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                      {docs.map(d => (
                        <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                          <span className="text-gray-700 dark:text-gray-300 font-medium truncate flex-1">{d.nombre}</span>
                          <Badge variant="neutral">{TIPO_LABELS[d.tipo]}</Badge>
                          <span className="text-gray-400 font-num whitespace-nowrap">{new Date(d.subido_en).toLocaleDateString('es-CL')}</span>
                          <div className="flex items-center gap-1">
                            <Tooltip label="Descargar">
                              <Button size="icon-sm" variant="ghost" onClick={() => descargarDoc(d)}>
                                <Download size={14} />
                              </Button>
                            </Tooltip>
                            <Tooltip label="Eliminar">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-danger-500 hover:text-danger-600 hover:bg-danger-500/10"
                                onClick={() => eliminarDoc.mutate(d.id)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </Tooltip>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </section>

              {/* Vacaciones */}
              <section>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Vacaciones</h3>
                  <Button
                    size="sm"
                    leftIcon={<Plus size={14} />}
                    onClick={() => { setVacModalOpen(true); setVacForm(EMPTY_VAC); setVacError(null) }}
                  >
                    Agregar período
                  </Button>
                </div>
                {vacaciones.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sin períodos registrados</p>
                ) : (
                  <Card>
                    <Table density="compact">
                      <THead>
                        <TR>
                          <TH>Inicio</TH>
                          <TH>Fin</TH>
                          <TH className="text-right">Días</TH>
                          <TH>Descripción</TH>
                          <TH className="w-12" />
                        </TR>
                      </THead>
                      <TBody>
                        {vacaciones.map(v => (
                          <TR key={v.id}>
                            <TD className="font-num">{v.fecha_inicio}</TD>
                            <TD className="font-num">{v.fecha_fin}</TD>
                            <TD className="text-right font-num">{v.dias}</TD>
                            <TD className="text-gray-500 dark:text-gray-400">{v.descripcion ?? '—'}</TD>
                            <TD>
                              <Tooltip label="Eliminar">
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-danger-500 hover:text-danger-600 hover:bg-danger-500/10"
                                  onClick={() => eliminarVac.mutate(v.id)}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </Tooltip>
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </Card>
                )}
              </section>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Modal vacación */}
      <Modal open={vacModalOpen} onOpenChange={open => { if (!open) { setVacModalOpen(false); setVacError(null) } }}>
        <ModalContent size="md">
          <ModalHeader>
            <ModalTitle>Agregar período de vacaciones</ModalTitle>
          </ModalHeader>
          <form onSubmit={ev => { ev.preventDefault(); guardarVac.mutate(vacForm) }} className="flex flex-col flex-1 min-h-0">
            <ModalBody>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Fecha inicio" required>
                    <Input
                      type="date" required
                      value={vacForm.fecha_inicio}
                      onChange={e => {
                        const inicio = e.target.value
                        const dias = calcDias(inicio, vacForm.fecha_fin)
                        setVacForm(f => ({ ...f, fecha_inicio: inicio, dias: dias > 0 ? String(dias) : f.dias }))
                      }}
                    />
                  </FormField>
                  <FormField label="Fecha fin" required>
                    <Input
                      type="date" required
                      value={vacForm.fecha_fin}
                      onChange={e => {
                        const fin = e.target.value
                        const dias = calcDias(vacForm.fecha_inicio, fin)
                        setVacForm(f => ({ ...f, fecha_fin: fin, dias: dias > 0 ? String(dias) : f.dias }))
                      }}
                    />
                  </FormField>
                </div>
                <FormField label="Días" required>
                  <Input
                    type="number" required min="1"
                    value={vacForm.dias}
                    onChange={e => setVacForm(f => ({ ...f, dias: e.target.value }))}
                  />
                </FormField>
                <FormField label="Descripción">
                  <Input
                    type="text" placeholder="Vacaciones de verano..."
                    value={vacForm.descripcion}
                    onChange={e => setVacForm(f => ({ ...f, descripcion: e.target.value }))}
                  />
                </FormField>
                {vacError && <p className="text-xs text-danger-600 dark:text-danger-400">{vacError}</p>}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={() => { setVacModalOpen(false); setVacError(null) }}>Cancelar</Button>
              <Button type="submit" disabled={guardarVac.isPending}>
                {guardarVac.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  )
}
