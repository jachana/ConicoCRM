import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileSpreadsheet, Inbox, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { Proveedor } from '../types'
import {
  Button, Input, Textarea, FormField, EmptyState, Skeleton, Tooltip,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Card,
} from '../components/ui'

const CAMPOS = [
  { key: 'nombre' as const, label: 'Nombre', required: true, colSpan: 2 },
  { key: 'rut' as const, label: 'RUT', required: false, colSpan: 1 },
  { key: 'contacto' as const, label: 'Contacto', required: false, colSpan: 1 },
  { key: 'email' as const, label: 'Email', required: false, colSpan: 1 },
  { key: 'telefono' as const, label: 'Teléfono', required: false, colSpan: 1 },
  { key: 'notas' as const, label: 'Notas', required: false, colSpan: 2, textarea: true },
] as const

type CampoKey = typeof CAMPOS[number]['key']
type FormData = Record<CampoKey, string>

const EMPTY_FORM: FormData = { nombre: '', rut: '', contacto: '', email: '', telefono: '', notas: '' }

export default function Proveedores() {
  const qc = useQueryClient()
  const { data: proveedores = [], isLoading } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/api/proveedores/').then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Proveedor | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function abrirCrear() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setError(null)
    setModalOpen(true)
  }

  function abrirEditar(p: Proveedor) {
    setEditando(p)
    setForm({ nombre: p.nombre, rut: p.rut ?? '', contacto: p.contacto ?? '', email: p.email ?? '', telefono: p.telefono ?? '', notas: p.notas ?? '' })
    setError(null)
    setModalOpen(true)
  }

  function cerrarModal() {
    setModalOpen(false)
    setEditando(null)
    setError(null)
  }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || null]))
      if (editando) return api.patch(`/api/proveedores/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/proveedores/', payload).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      cerrarModal()
      toast.success(editando ? 'Proveedor actualizado' : 'Proveedor creado')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/proveedores/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      setConfirmDelete(null)
      setDeleteError(null)
      toast.success('Proveedor eliminado')
    },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  async function exportarExcel() {
    const r = await api.get('/api/proveedores/export/excel', { responseType: 'blob' })
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'proveedores.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Proveedores</h1>
        <div className="flex gap-2">
          <Button variant="outline" leftIcon={<FileSpreadsheet size={16} />} onClick={exportarExcel}>
            Exportar Excel
          </Button>
          <Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>
            Agregar proveedor
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card padded>
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        </Card>
      ) : proveedores.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={<Inbox />}
            title="Sin proveedores registrados"
            description="Agrega tu primer proveedor para empezar"
            action={<Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>Agregar proveedor</Button>}
          />
        </Card>
      ) : (
        <Card>
          <Table density="compact">
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>RUT</TH>
                <TH>Contacto</TH>
                <TH>Email</TH>
                <TH>Teléfono</TH>
                <TH className="w-24" />
              </TR>
            </THead>
            <TBody>
              {proveedores.map(p => (
                <TR key={p.id}>
                  <TD className="font-medium text-gray-900 dark:text-white">{p.nombre}</TD>
                  <TD className="text-gray-500 dark:text-gray-400">{p.rut ?? '—'}</TD>
                  <TD className="text-gray-500 dark:text-gray-400">{p.contacto ?? '—'}</TD>
                  <TD className="text-gray-500 dark:text-gray-400">{p.email ?? '—'}</TD>
                  <TD className="text-gray-500 dark:text-gray-400">{p.telefono ?? '—'}</TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Tooltip label="Editar">
                        <Button size="icon-sm" variant="ghost" onClick={() => abrirEditar(p)}>
                          <Pencil size={14} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Eliminar">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-danger-500 hover:text-danger-600 hover:bg-danger-500/10"
                          onClick={() => { setConfirmDelete(p); setDeleteError(null) }}
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

      <Modal open={modalOpen} onOpenChange={open => { if (!open) cerrarModal() }}>
        <ModalContent size="md">
          <ModalHeader>
            <ModalTitle>{editando ? 'Editar proveedor' : 'Nuevo proveedor'}</ModalTitle>
          </ModalHeader>
          <form onSubmit={e => { e.preventDefault(); guardar.mutate(form) }}>
            <ModalBody>
              <div className="grid grid-cols-2 gap-4">
                {CAMPOS.map(campo => (
                  <div key={campo.key} className={campo.colSpan === 2 ? 'col-span-2' : ''}>
                    <FormField label={`${campo.label}${campo.required ? ' *' : ''}`}>
                      {('textarea' in campo && campo.textarea) ? (
                        <Textarea
                          value={form[campo.key]}
                          onChange={e => setForm(f => ({ ...f, [campo.key]: e.target.value }))}
                          rows={3}
                        />
                      ) : (
                        <Input
                          type="text"
                          value={form[campo.key]}
                          onChange={e => setForm(f => ({ ...f, [campo.key]: e.target.value }))}
                          required={campo.required}
                        />
                      )}
                    </FormField>
                  </div>
                ))}
                {error && (
                  <p className="col-span-2 text-xs text-danger-600 dark:text-danger-400">{error}</p>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={cerrarModal}>Cancelar</Button>
              <Button type="submit" disabled={guardar.isPending}>
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <Modal open={!!confirmDelete} onOpenChange={open => { if (!open) { setConfirmDelete(null); setDeleteError(null) } }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Eliminar proveedor</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ¿Eliminar <span className="font-medium text-gray-900 dark:text-white">{confirmDelete?.nombre}</span>? Esta acción no se puede deshacer.
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
              disabled={eliminar.isPending}
              onClick={() => confirmDelete && eliminar.mutate(confirmDelete.id)}
            >
              {eliminar.isPending ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
