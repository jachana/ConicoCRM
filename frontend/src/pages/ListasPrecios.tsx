import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Download, Trash2, Inbox, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { ListaPrecios, ListaPreciosUploadResult } from '../types'
import {
  Button, Input, FormField, EmptyState, Skeleton, Tooltip, Badge,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Card,
} from '../components/ui'

type ListPage = { items: ListaPrecios[]; total: number; page: number; page_size: number }

export default function ListasPrecios() {
  const qc = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadResult, setUploadResult] = useState<ListaPreciosUploadResult | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ListaPrecios | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data, isLoading } = useQuery<ListPage>({
    queryKey: ['listas-precios'],
    queryFn: () => api.get('/api/listas-precios/').then(r => r.data),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/listas-precios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listas-precios'] })
      setConfirmDelete(null)
      setDeleteError(null)
      toast.success('Lista eliminada')
    },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Listas de precios</h1>
        <Button leftIcon={<Upload size={16} />} onClick={() => setUploadOpen(true)}>
          Subir nueva lista
        </Button>
      </div>

      {uploadResult && (
        <Card className="bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/30" padded>
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm space-y-1 flex-1">
              <div className="text-success-800 dark:text-success-300">
                Lista {uploadResult.lista_id} subida — {uploadResult.productos_actualizados} productos actualizados.
              </div>
              {uploadResult.skus_sin_producto.length > 0 && (
                <div className="text-warning-700 dark:text-warning-300">
                  SKUs sin producto en sistema: {uploadResult.skus_sin_producto.join(', ')}
                </div>
              )}
              <div className="text-gray-600 dark:text-gray-400">
                Productos no incluidos: {uploadResult.productos_no_incluidos_count}. Filas inválidas: {uploadResult.filas_invalidas}.
              </div>
            </div>
            <Button variant="ghost" size="icon-xs" onClick={() => setUploadResult(null)} aria-label="Cerrar">
              <X size={14} />
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card padded>
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        </Card>
      ) : data?.items.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={<Inbox />}
            title="Sin listas de precios"
            description="Sube una lista para actualizar precios masivamente"
            action={<Button leftIcon={<Upload size={16} />} onClick={() => setUploadOpen(true)}>Subir nueva lista</Button>}
          />
        </Card>
      ) : (
        <Card>
          <Table density="compact">
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Archivo</TH>
                <TH className="text-right">Items</TH>
                <TH>Subida por</TH>
                <TH>Estado</TH>
                <TH className="w-24" />
              </TR>
            </THead>
            <TBody>
              {data?.items.map(lp => (
                <TR key={lp.id}>
                  <TD className="text-gray-600 dark:text-gray-400">{new Date(lp.fecha_subida).toLocaleString('es-CL')}</TD>
                  <TD className="text-gray-900 dark:text-white">{lp.nombre_archivo}</TD>
                  <TD className="text-right font-num text-gray-900 dark:text-white">{lp.total_items}</TD>
                  <TD className="text-gray-600 dark:text-gray-400">{lp.subida_por?.nombre ?? '—'}</TD>
                  <TD>
                    {lp.activa
                      ? <Badge variant="success">Activa</Badge>
                      : <Badge variant="neutral">Archivada</Badge>}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1 justify-end">
                      <Tooltip label="Descargar">
                        <a
                          href={`/api/listas-precios/${lp.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 transition-colors"
                          aria-label="Descargar"
                        >
                          <Download size={14} />
                        </a>
                      </Tooltip>
                      {!lp.activa && (
                        <Tooltip label="Eliminar">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-danger-500 hover:text-danger-600 hover:bg-danger-500/10"
                            onClick={() => { setConfirmDelete(lp); setDeleteError(null) }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSuccess={(res) => {
            setUploadResult(res)
            setUploadOpen(false)
            qc.invalidateQueries({ queryKey: ['listas-precios'] })
          }}
        />
      )}

      <Modal open={!!confirmDelete} onOpenChange={open => { if (!open) { setConfirmDelete(null); setDeleteError(null) } }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Eliminar lista de precios</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ¿Eliminar <span className="font-medium text-gray-900 dark:text-white">{confirmDelete?.nombre_archivo}</span>? Esta acción no se puede deshacer.
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

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (res: ListaPreciosUploadResult) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [columnaSku, setColumnaSku] = useState('sku')
  const [columnaCosto, setColumnaCosto] = useState('costo')
  const [error, setError] = useState<string | null>(null)

  const subir = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Seleccione un archivo')
      const fd = new FormData()
      fd.append('archivo', file)
      fd.append('columna_sku', columnaSku)
      fd.append('columna_costo', columnaCosto)
      const r = await api.post('/api/listas-precios/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      return r.data as ListaPreciosUploadResult
    },
    onSuccess,
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail ?? String(e))
    },
  })

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Subir lista de precios</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <FormField label="Archivo (.xlsx o .csv)">
              <input
                type="file"
                accept=".xlsx,.csv"
                className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 dark:file:bg-gray-800 dark:file:text-gray-200 hover:file:bg-gray-200 dark:hover:file:bg-gray-700"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Columna SKU">
                <Input value={columnaSku} onChange={e => setColumnaSku(e.target.value)} />
              </FormField>
              <FormField label="Columna Costo">
                <Input value={columnaCosto} onChange={e => setColumnaCosto(e.target.value)} />
              </FormField>
            </div>
            {error && (
              <p className="text-xs text-danger-600 dark:text-danger-400">{error}</p>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!file || subir.isPending}
            onClick={() => subir.mutate()}
          >
            {subir.isPending ? 'Subiendo…' : 'Subir'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
