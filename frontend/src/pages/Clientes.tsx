import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '../hooks/useDebounce'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Plus, Search, FileSpreadsheet, Inbox, Eye } from 'lucide-react'
import { api } from '../lib/api'
import { validateRut } from '../utils/rut'
import type { Cliente, Empresa } from '../types'
import ClienteDetailModal from '../components/ClienteDetailModal'
import {
  Button, Input, Textarea, FormField, Badge, EmptyState, Skeleton,
  Table, THead, TBody, TR, TH, TD,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Card,
} from '../components/ui'

type FormData = {
  nombre: string; rut: string; email: string; telefono: string
  direccion_despacho: string; notas: string; empresa_id: number | null
  recibe_correo: boolean; despacho_o_retiro: string
  comuna: string; ultimo_contacto: string; forma_captacion: string
  compromiso: string; es_nuevo: boolean
}

const EMPTY_FORM: FormData = {
  nombre: '', rut: '', email: '', telefono: '', direccion_despacho: '', notas: '',
  empresa_id: null, recibe_correo: true, despacho_o_retiro: '',
  comuna: '', ultimo_contacto: '', forma_captacion: '', compromiso: '', es_nuevo: false,
}

export default function Clientes() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const debouncedBusqueda = useDebounce(busqueda, 300)

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [rutError, setRutError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [verCliente, setVerCliente] = useState<Cliente | null>(null)

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ['clientes', debouncedBusqueda],
    queryFn: () => api.get(`/api/clientes/?q=${encodeURIComponent(debouncedBusqueda)}`).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const detalleId = searchParams.get('detalle')
    if (!detalleId || verCliente) return
    const found = clientes.find(c => c.id === Number(detalleId))
    if (found) {
      setVerCliente(found)
      const next = new URLSearchParams(searchParams)
      next.delete('detalle')
      setSearchParams(next, { replace: true })
      return
    }
    api.get(`/api/clientes/${detalleId}`).then(r => {
      setVerCliente(r.data)
      const next = new URLSearchParams(searchParams)
      next.delete('detalle')
      setSearchParams(next, { replace: true })
    }).catch(() => {})
  }, [searchParams, clientes, verCliente, setSearchParams])

  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ['empresas'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
  })

  const empresaSeleccionada = empresas.find(e => e.id === form.empresa_id) ?? null

  function abrirCrear() { setEditando(null); setForm(EMPTY_FORM); setError(null); setModalOpen(true) }
  function abrirEditar(c: Cliente) {
    setEditando(c)
    setForm({
      nombre: c.nombre, rut: c.rut ?? '', email: c.email ?? '', telefono: c.telefono ?? '',
      direccion_despacho: c.direccion_despacho ?? '', notas: c.notas ?? '',
      empresa_id: c.empresa_id, recibe_correo: c.recibe_correo,
      despacho_o_retiro: c.despacho_o_retiro ?? '',
      comuna: c.comuna ?? '', ultimo_contacto: c.ultimo_contacto ?? '',
      forma_captacion: c.forma_captacion ?? '', compromiso: c.compromiso ?? '',
      es_nuevo: c.es_nuevo,
    })
    setError(null); setModalOpen(true)
  }
  function cerrarModal() { setModalOpen(false); setEditando(null); setError(null); setRutError(null) }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])),
        recibe_correo: data.recibe_correo, es_nuevo: data.es_nuevo, empresa_id: data.empresa_id,
      }
      if (editando) return api.patch(`/api/clientes/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/clientes/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); cerrarModal() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/clientes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); setEliminandoId(null); setDeleteError(null) },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  function exportExcel() {
    api.get('/api/clientes/export/excel', { responseType: 'blob' }).then(r => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a'); a.href = url; a.download = 'clientes.xlsx'; a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Clientes</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" leftIcon={<FileSpreadsheet />} onClick={exportExcel} className="hidden sm:inline-flex">
            Exportar Excel
          </Button>
          <Button leftIcon={<Plus />} onClick={abrirCrear}>Agregar</Button>
        </div>
      </div>

      <Input
        type="text"
        placeholder="Buscar por nombre, RUT o empresa..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        leftAddon={<Search />}
        className="mb-4 max-w-sm"
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : clientes.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<Inbox />}
            title={busqueda ? 'Sin resultados' : 'Sin clientes registrados'}
            description={busqueda ? 'No hay clientes que coincidan con la búsqueda.' : 'Comienza agregando tu primer cliente.'}
            action={!busqueda ? <Button leftIcon={<Plus />} onClick={abrirCrear}>Agregar cliente</Button> : null}
          />
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {clientes.map(c => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{c.nombre}</p>
                      {c.es_nuevo && <Badge variant="brand" size="sm">Nuevo</Badge>}
                    </div>
                    {c.empresa?.nombre && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{c.empresa.nombre}</p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                      {c.rut && <span className="text-xs text-gray-500 dark:text-gray-400 font-num">{c.rut}</span>}
                      {c.telefono && <span className="text-xs text-gray-500 dark:text-gray-400">{c.telefono}</span>}
                      {c.email && <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.email}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="xs" variant="link" onClick={() => setVerCliente(c)}>Ver</Button>
                    <Button size="xs" variant="link" onClick={() => abrirEditar(c)}>Editar</Button>
                    <Button
                      size="xs"
                      variant="link"
                      className="text-danger-600 dark:text-danger-400 hover:text-danger-700"
                      onClick={() => { setEliminandoId(c.id); setDeleteError(null) }}
                    >
                      Borrar
                    </Button>
                  </div>
                </div>
                {eliminandoId === c.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
                    {deleteError
                      ? <span className="text-danger-600 dark:text-danger-400">{deleteError}</span>
                      : <span className="text-gray-500 dark:text-gray-400">¿Confirmar eliminación?</span>}
                    <div className="flex gap-2">
                      <Button size="xs" variant="danger" loading={eliminar.isPending} onClick={() => eliminar.mutate(c.id)}>Sí</Button>
                      <Button size="xs" variant="ghost" onClick={() => { setEliminandoId(null); setDeleteError(null) }}>No</Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-elev-1">
            <Table>
              <THead>
                <TR>
                  <TH>Nombre</TH>
                  <TH>Empresa</TH>
                  <TH>RUT</TH>
                  <TH>Email</TH>
                  <TH>Teléfono</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {clientes.map(c => (
                  <TR key={c.id}>
                    <TD className="font-medium text-gray-900 dark:text-gray-100">
                      <div className="flex items-center gap-2">
                        {c.nombre}
                        {c.es_nuevo && <Badge variant="brand" size="sm">Nuevo</Badge>}
                      </div>
                    </TD>
                    <TD className="text-gray-500 dark:text-gray-400">{c.empresa?.nombre ?? '—'}</TD>
                    <TD className="text-gray-500 dark:text-gray-400 font-num">{c.rut ?? '—'}</TD>
                    <TD className="text-gray-500 dark:text-gray-400">{c.email ?? '—'}</TD>
                    <TD className="text-gray-500 dark:text-gray-400">{c.telefono ?? '—'}</TD>
                    <TD>
                      {eliminandoId === c.id ? (
                        <div className="flex items-center justify-end gap-2 text-xs">
                          {deleteError
                            ? <span className="text-danger-600 dark:text-danger-400">{deleteError}</span>
                            : <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>}
                          <Button size="xs" variant="danger" loading={eliminar.isPending} onClick={() => eliminar.mutate(c.id)}>Sí</Button>
                          <Button size="xs" variant="ghost" onClick={() => { setEliminandoId(null); setDeleteError(null) }}>No</Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="xs" variant="link" leftIcon={<Eye size={12} />} onClick={() => setVerCliente(c)}>Ver</Button>
                          <Button size="xs" variant="link" onClick={() => abrirEditar(c)}>Editar</Button>
                          <Button
                            size="xs"
                            variant="link"
                            className="text-danger-600 dark:text-danger-400 hover:text-danger-700"
                            onClick={() => { setEliminandoId(c.id); setDeleteError(null) }}
                          >
                            Eliminar
                          </Button>
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}

      {/* Detail modal */}
      <ClienteDetailModal
        cliente={verCliente}
        onClose={() => setVerCliente(null)}
        onEdit={(c) => { setVerCliente(null); abrirEditar(c) }}
      />

      {/* Create/Edit modal */}
      <Modal open={modalOpen} onOpenChange={(o) => { if (!o) cerrarModal() }}>
        <ModalContent size="xl">
          <ModalHeader>
            <ModalTitle>{editando ? 'Editar cliente' : 'Nuevo cliente'}</ModalTitle>
          </ModalHeader>
          <form onSubmit={ev => {
              ev.preventDefault()
              if (form.rut && !validateRut(form.rut)) { setRutError('RUT inválido'); return }
              setRutError(null)
              guardar.mutate(form)
            }} className="flex flex-col flex-1 min-h-0">
            <ModalBody>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Empresa" className="col-span-2">
                  <Select
                    value={form.empresa_id ? String(form.empresa_id) : 'none'}
                    onValueChange={(v) => setForm(f => ({ ...f, empresa_id: v === 'none' ? null : Number(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sin empresa —</SelectItem>
                      {empresas.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>

                {empresaSeleccionada?.rut && (
                  <FormField label="RUT Empresa">
                    <Input value={empresaSeleccionada.rut} readOnly />
                  </FormField>
                )}
                {empresaSeleccionada?.razon_social && (
                  <FormField label="Razón Social">
                    <Input value={empresaSeleccionada.razon_social} readOnly />
                  </FormField>
                )}

                <FormField label="Nombre" required className="col-span-2">
                  <Input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                </FormField>

                <FormField label="RUT" required>
                  <Input
                    placeholder="76.123.456-7"
                    required
                    value={form.rut}
                    onChange={e => { setForm(f => ({ ...f, rut: e.target.value })); setRutError(null) }}
                    onBlur={() => { if (form.rut) setRutError(validateRut(form.rut) ? null : 'RUT inválido') }}
                  />
                  {rutError && <p className="text-xs text-danger-500 mt-1">{rutError}</p>}
                </FormField>
                <FormField label="Email">
                  <Input type="email" placeholder="contacto@empresa.cl" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </FormField>
                <FormField label="Teléfono">
                  <Input placeholder="+56 9 1234 5678" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </FormField>
                <FormField label="Comuna">
                  <Input value={form.comuna} onChange={e => setForm(f => ({ ...f, comuna: e.target.value }))} />
                </FormField>

                <FormField label="Despacho o Retiro">
                  <Select
                    value={form.despacho_o_retiro || 'none'}
                    onValueChange={(v) => setForm(f => ({ ...f, despacho_o_retiro: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sin definir —</SelectItem>
                      <SelectItem value="despacho">Despacho</SelectItem>
                      <SelectItem value="retiro">Retiro</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label="Último Contacto">
                  <Input type="date" value={form.ultimo_contacto} onChange={e => setForm(f => ({ ...f, ultimo_contacto: e.target.value }))} />
                </FormField>

                <FormField label="Forma Captación" className="col-span-2">
                  <Input value={form.forma_captacion} onChange={e => setForm(f => ({ ...f, forma_captacion: e.target.value }))} />
                </FormField>

                <FormField label="Dirección de Despacho" className="col-span-2">
                  <Input value={form.direccion_despacho} onChange={e => setForm(f => ({ ...f, direccion_despacho: e.target.value }))} />
                </FormField>

                <FormField label="Compromiso" className="col-span-2">
                  <Textarea rows={2} value={form.compromiso} onChange={e => setForm(f => ({ ...f, compromiso: e.target.value }))} />
                </FormField>

                <FormField label="Notas" className="col-span-2">
                  <Textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
                </FormField>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.recibe_correo} onChange={e => setForm(f => ({ ...f, recibe_correo: e.target.checked }))} className="size-4 accent-brand-500 rounded" />
                  Recibe correo
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.es_nuevo} onChange={e => setForm(f => ({ ...f, es_nuevo: e.target.checked }))} className="size-4 accent-brand-500 rounded" />
                  Es nuevo
                </label>

                {error && <p className="col-span-2 text-xs text-danger-600 dark:text-danger-400">{error}</p>}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={cerrarModal}>Cancelar</Button>
              <Button type="submit" loading={guardar.isPending}>Guardar</Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  )
}
