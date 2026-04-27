import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, FileSpreadsheet, Inbox, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { Producto } from '../types'
import ProductoModal from '../components/ProductoModal'
import { useAuthStore } from '../stores/auth'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'
import {
  Button, Input, FormField, EmptyState, Skeleton, Tooltip,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Card,
} from '../components/ui'

function formatPrecio(n: number) {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

export default function Productos() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const { role: effectiveRole } = useEffectivePermissions()
  const [busqueda, setBusqueda] = useState('')

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos', busqueda],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Producto | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function abrirCrear() { setEditando(null); setModalOpen(true) }
  function abrirEditar(p: Producto) { setEditando(p); setModalOpen(true) }
  function cerrarModal() { setModalOpen(false); setEditando(null) }

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/productos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      setConfirmDelete(null)
      setDeleteError(null)
      toast.success('Producto eliminado')
    },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  async function exportarExcel() {
    const r = await api.get('/api/productos/export/excel', { responseType: 'blob' })
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'catalogo.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Catálogo de productos</h1>
        <div className="flex gap-2">
          <Button variant="outline" leftIcon={<FileSpreadsheet size={16} />} onClick={exportarExcel}>
            Exportar Excel
          </Button>
          <Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>
            Agregar producto
          </Button>
        </div>
      </div>

      <div className="mb-4 max-w-sm">
        <FormField>
          <Input
            type="text"
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            leftAddon={<Search />}
          />
        </FormField>
      </div>

      {isLoading ? (
        <Card padded>
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        </Card>
      ) : productos.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={<Inbox />}
            title="Sin productos registrados"
            description="Agrega tu primer producto para empezar"
            action={<Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>Agregar producto</Button>}
          />
        </Card>
      ) : (
        <Card>
          <Table density="compact">
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Marca</TH>
                <TH className="text-right">Precio costo</TH>
                <TH className="text-right">Precio venta</TH>
                <TH className="text-right">Stock</TH>
                <TH className="text-right">Mín.</TH>
                <TH className="w-24" />
              </TR>
            </THead>
            <TBody>
              {productos.map(p => {
                const stockBajo = p.stock_actual < p.stock_minimo
                return (
                  <TR key={p.id}>
                    <TD>
                      <div className="font-medium text-gray-900 dark:text-white">{p.nombre}</div>
                      {p.descripcion && <div className="text-xs text-gray-400 truncate max-w-xs">{p.descripcion}</div>}
                    </TD>
                    <TD className="text-gray-500 dark:text-gray-400 text-xs">
                      {p.marca ? p.marca.nombre : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </TD>
                    <TD className="text-right text-gray-500 dark:text-gray-400 font-num">{formatPrecio(Number(p.precio_costo ?? 0))}</TD>
                    <TD className="text-right font-medium text-gray-900 dark:text-white font-num">{formatPrecio(Number(p.precio_venta))}</TD>
                    <TD className={`text-right font-num ${stockBajo ? 'text-danger-600 dark:text-danger-400 font-semibold' : 'text-gray-900 dark:text-white font-medium'}`}>
                      {stockBajo ? (
                        <Tooltip label="Stock bajo mínimo">
                          <span className="inline-flex items-center gap-1">
                            {p.stock_actual}
                            <span className="text-danger-500 text-xs">⚠</span>
                          </span>
                        </Tooltip>
                      ) : (
                        p.stock_actual
                      )}
                    </TD>
                    <TD className="text-right text-gray-400 font-num">{p.stock_minimo}</TD>
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
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      {modalOpen && (
        <ProductoModal
          editando={editando}
          onClose={cerrarModal}
          userRole={effectiveRole ?? user?.role ?? 'vendedor'}
        />
      )}

      <Modal open={!!confirmDelete} onOpenChange={open => { if (!open) { setConfirmDelete(null); setDeleteError(null) } }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Eliminar producto</ModalTitle>
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
