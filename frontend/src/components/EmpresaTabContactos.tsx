import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import {
  Button, Card, CardContent, EmptyState, Skeleton, Input,
  Modal, ModalContent, ModalHeader, ModalTitle, ModalFooter,
} from './ui'
import { Users, Plus, Pencil, Trash2 } from 'lucide-react'

interface Contacto {
  id: number
  empresa_id: number
  nombre: string
  cargo: string | null
  email: string | null
  telefono: string | null
}

interface ContactoForm {
  nombre: string
  cargo: string
  email: string
  telefono: string
}

const EMPTY_FORM: ContactoForm = { nombre: '', cargo: '', email: '', telefono: '' }

function toForm(c: Contacto): ContactoForm {
  return { nombre: c.nombre, cargo: c.cargo ?? '', email: c.email ?? '', telefono: c.telefono ?? '' }
}

interface Props {
  empresaId: number
}

export default function EmpresaTabContactos({ empresaId }: Props) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'subadmin'

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Contacto | null>(null)
  const [form, setForm] = useState<ContactoForm>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<Contacto | null>(null)

  const { data, isLoading } = useQuery<Contacto[]>({
    queryKey: ['empresa-contactos', empresaId],
    queryFn: () => api.get(`/api/empresas/${empresaId}/contactos`).then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['empresa-contactos', empresaId] })

  const createMut = useMutation({
    mutationFn: (body: object) => api.post(`/api/empresas/${empresaId}/contactos`, body),
    onSuccess: () => { invalidate(); closeDialog() },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      api.patch(`/api/empresas/${empresaId}/contactos/${id}`, body),
    onSuccess: () => { invalidate(); closeDialog() },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/empresas/${empresaId}/contactos/${id}`),
    onSuccess: () => { invalidate(); setDeleteTarget(null) },
  })

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(c: Contacto) {
    setEditing(c)
    setForm(toForm(c))
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      nombre: form.nombre.trim(),
      cargo: form.cargo.trim() || null,
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, body })
    } else {
      createMut.mutate(body)
    }
  }

  const isBusy = createMut.isPending || updateMut.isPending

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" />
            Agregar contacto
          </Button>
        </div>
      )}

      {!data?.length ? (
        <EmptyState
          icon={<Users />}
          title="Sin contactos"
          description="Esta empresa no tiene puntos de contacto registrados."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {data.map(c => (
            <Card key={c.id} variant="subtle">
              <CardContent className="py-3 flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{c.nombre}</span>
                    {c.cargo && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        {c.cargo}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {c.email && <span>{c.email}</span>}
                    {c.telefono && <span>{c.telefono}</span>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-danger-600 hover:text-danger-700"
                      onClick={() => setDeleteTarget(c)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog() }}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>{editing ? 'Editar contacto' : 'Nuevo contacto'}</ModalTitle>
          </ModalHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2 px-6 pb-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="cnt-nombre">Nombre *</label>
              <Input
                id="cnt-nombre"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="cnt-cargo">Cargo</label>
              <Input
                id="cnt-cargo"
                value={form.cargo}
                onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                placeholder="Ej: Gerente de compras"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="cnt-email">Email</label>
                <Input
                  id="cnt-email"
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="cnt-tel">Teléfono</label>
                <Input
                  id="cnt-tel"
                  value={form.telefono}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="+56 9 1234 5678"
                />
              </div>
            </div>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button type="submit" disabled={!form.nombre.trim() || isBusy}>
                {isBusy ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Eliminar contacto</ModalTitle>
          </ModalHeader>
          <div className="px-6 py-2 text-sm text-gray-600 dark:text-gray-400">
            ¿Confirmas la eliminación de <strong>{deleteTarget?.nombre}</strong>?
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
            >
              Eliminar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
