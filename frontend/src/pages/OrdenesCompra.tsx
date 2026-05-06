import { openPdf } from '../lib/pdf'
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Trash2, Eye, Download, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import type { OrdenCompra, Proveedor } from '../types'
import {
  Button, Input, FormField, Badge, EmptyState, Skeleton, Card, Tooltip,
  Table, THead, TBody, TR, TH, TD,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter,
} from '../components/ui'

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  recibida_parcial: 'Recibida parcial',
  recibida_completa: 'Recibida completa',
  cancelada: 'Cancelada',
}

const ESTADO_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  borrador: 'neutral',
  enviada: 'info',
  recibida_parcial: 'warning',
  recibida_completa: 'success',
  cancelada: 'danger',
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

export default function OrdenesCompra() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [proveedorId, setProveedorId] = useState('')
  const [estado, setEstado] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [proveedorId, estado, fechaDesde, fechaHasta])

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (proveedorId) p.set('proveedor_id', proveedorId)
    if (estado) p.set('estado', estado)
    if (fechaDesde) p.set('fecha_desde', fechaDesde)
    if (fechaHasta) p.set('fecha_hasta', fechaHasta)
    p.set('limit', '50')
    p.set('offset', String((page - 1) * 50))
    return p
  }, [proveedorId, estado, fechaDesde, fechaHasta, page])

  const { data: listResponse, isLoading, isFetching } = useQuery<{ data: OrdenCompra[], pagination: { limit: number, offset: number, total: number } }>({
    queryKey: ['ordenes_compra', proveedorId, estado, fechaDesde, fechaHasta, page],
    queryFn: () => api.get(`/api/ordenes-compra/?${params.toString()}`).then(r => r.data),
  })

  const ordenes = listResponse?.data ?? []
  const hasNextPage = ordenes.length === 50

  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/api/proveedores/').then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/ordenes-compra/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ordenes_compra'] })
      setConfirmId(null)
      setDeleteError('')
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.detail || 'Error al eliminar')
    },
  })

  function abrirPdf(id: number) {
    openPdf(`/api/ordenes-compra/${id}/pdf`)
  }

  async function exportarExcel() {
    const r = await api.get('/api/ordenes-compra/export/excel', { responseType: 'blob' })
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ordenes_compra.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  function closeConfirm() {
    setConfirmId(null)
    setDeleteError('')
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Órdenes de Compra</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" leftIcon={<Download />} onClick={exportarExcel}>
            Excel
          </Button>
          <Button size="sm" leftIcon={<Plus />} onClick={() => navigate('/ordenes-compra/nueva')}>
            Nueva OC
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-3 items-end">
          <FormField label="Proveedor">
            <Select value={proveedorId || 'all'} onValueChange={v => setProveedorId(v === 'all' ? '' : v)}>
              <SelectTrigger size="sm" className="min-w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                {proveedores.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Estado">
            <Select value={estado || 'all'} onValueChange={v => setEstado(v === 'all' ? '' : v)}>
              <SelectTrigger size="sm" className="min-w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {Object.entries(ESTADO_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Desde">
            <Input type="date" size="sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-36" />
          </FormField>
          <FormField label="Hasta">
            <Input type="date" size="sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-36" />
          </FormField>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : ordenes.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="Sin órdenes de compra"
          description="No hay resultados para los filtros aplicados."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table density="compact" className="min-w-[800px]">
            <THead>
              <TR>
                <TH>Nº OC</TH>
                <TH>Proveedor</TH>
                <TH>Fecha</TH>
                <TH>Entrega esperada</TH>
                <TH>Estado</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {ordenes.map(o => (
                <TR key={o.id} interactive onClick={() => navigate(`/ordenes-compra/${o.id}`)}>
                  <TD className="font-mono text-info-600 dark:text-info-400">
                    OC-{String(o.numero).padStart(5, '0')}
                  </TD>
                  <TD className="text-gray-900 dark:text-white">{o.proveedor?.nombre ?? '—'}</TD>
                  <TD className="text-gray-600 dark:text-gray-400 font-num whitespace-nowrap">{o.fecha}</TD>
                  <TD className="text-gray-600 dark:text-gray-400 font-num whitespace-nowrap">{o.fecha_entrega_esperada ?? '—'}</TD>
                  <TD>
                    <Badge variant={ESTADO_VARIANT[o.estado] ?? 'neutral'} size="sm">
                      {ESTADO_LABELS[o.estado] ?? o.estado}
                    </Badge>
                  </TD>
                  <TD className="font-medium text-gray-900 dark:text-white text-right font-num whitespace-nowrap">
                    {fmtMoney(o.total)}
                  </TD>
                  <TD onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      <Tooltip label="Ver">
                        <Button size="icon-sm" variant="ghost" onClick={() => navigate(`/ordenes-compra/${o.id}`)} aria-label="Ver">
                          <Eye />
                        </Button>
                      </Tooltip>
                      <Tooltip label="PDF">
                        <Button size="icon-sm" variant="ghost" onClick={() => abrirPdf(o.id)} aria-label="PDF">
                          <FileText />
                        </Button>
                      </Tooltip>
                      {o.estado === 'borrador' && (
                        <Tooltip label="Eliminar">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => { setConfirmId(o.id); setDeleteError('') }}
                            aria-label="Eliminar"
                            className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                          >
                            <Trash2 />
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

      {(page > 1 || hasNextPage) && (
        <div className="flex items-center justify-center gap-3 py-3">
          <Button variant="ghost" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || isFetching}>
            Anterior
          </Button>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-num">Página {page}</span>
          <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasNextPage || isFetching}>
            Siguiente
          </Button>
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal open={confirmId !== null} onOpenChange={(open) => { if (!open) closeConfirm() }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Eliminar orden de compra</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              ¿Seguro que deseas eliminar esta orden de compra? Esta acción no se puede deshacer.
            </p>
            {deleteError && (
              <p className="mt-3 text-sm text-danger-600 dark:text-danger-400">{deleteError}</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={closeConfirm} disabled={deleteMut.isPending}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => confirmId !== null && deleteMut.mutate(confirmId)}
              loading={deleteMut.isPending}
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
