import { openPdf } from '../lib/pdf'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Eye, Trash2, FileSpreadsheet, Inbox, Search } from 'lucide-react'
import { api } from '../lib/api'
import type { NotaVenta } from '../types'
import {
  Button, Input, Badge, EmptyState, Skeleton,
  Table, THead, TBody, TR, TH, TD,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription,
  Tooltip,
} from '../components/ui'

const ESTADO_LABELS: Record<string, string> = {
  pendiente:  'Pendiente',
  despachada: 'Despachada',
  entregada:  'Entregada',
  pagada:     'Pagada',
  cancelada:  'Cancelada',
  facturada:  'Facturada',
}

const ESTADO_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  pendiente:  'neutral',
  despachada: 'info',
  entregada:  'warning',
  pagada:     'success',
  cancelada:  'danger',
  facturada:  'success',
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

export default function NotaVentas() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [estado, setEstado] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBusqueda(busqueda), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)
  if (debouncedBusqueda) params.set('q', debouncedBusqueda)

  const { data: nvs = [], isLoading } = useQuery<NotaVenta[]>({
    queryKey: ['nota_ventas', estado, fechaDesde, fechaHasta, debouncedBusqueda],
    queryFn: () => api.get(`/api/nota_ventas/?${params.toString()}`).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/nota_ventas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nota_ventas'] }); setDeleteId(null); setDeleteError('') },
    onError: (err: any) => setDeleteError(err?.response?.data?.detail || 'Error al eliminar'),
  })

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Notas de Venta</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<FileSpreadsheet />}
            onClick={() => window.open('/api/nota_ventas/export/excel', '_blank')}
          >
            Excel
          </Button>
          <Button leftIcon={<Plus />} onClick={() => navigate('/notas-venta/nueva')}>
            Nueva NV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          type="text"
          size="sm"
          placeholder="Buscar Nº, cliente, producto, marca, tipo, tag..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          leftAddon={<Search />}
          className="w-72"
        />
        <Select value={estado || 'all'} onValueChange={(v) => setEstado(v === 'all' ? '' : v)}>
          <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(ESTADO_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" size="sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-40" />
        <Input type="date" size="sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-40" />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-elev-1">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : nvs.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Sin notas de venta"
            description="No hay notas de venta que coincidan con los filtros seleccionados."
            action={<Button leftIcon={<Plus />} onClick={() => navigate('/notas-venta/nueva')}>Crear primera NV</Button>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nº</TH>
                <TH>Fecha</TH>
                <TH>Cliente</TH>
                <TH>Contacto</TH>
                <TH className="text-right">Total</TH>
                <TH>Estado</TH>
                <TH>Encargado</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {nvs.map(nv => (
                <TR key={nv.id} interactive onClick={() => navigate(`/notas-venta/${nv.id}`)}>
                  <TD className="font-num font-medium text-gray-900 dark:text-gray-100">
                    NV-{String(nv.numero).padStart(5, '0')}
                  </TD>
                  <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">
                    {new Date(nv.fecha + 'T00:00:00').toLocaleDateString('es-CL')}
                  </TD>
                  <TD className="text-gray-900 dark:text-gray-100">{nv.cliente?.nombre ?? '-'}</TD>
                  <TD className="text-gray-500 dark:text-gray-400">{nv.contacto ?? '-'}</TD>
                  <TD className="font-num font-medium text-gray-900 dark:text-gray-100 text-right whitespace-nowrap">
                    {fmtMoney(nv.total)}
                  </TD>
                  <TD>
                    <Badge variant={ESTADO_VARIANT[nv.estado] ?? 'neutral'} showDot>
                      {ESTADO_LABELS[nv.estado] ?? nv.estado}
                    </Badge>
                  </TD>
                  <TD className="text-gray-500 dark:text-gray-400">{nv.vendedor?.name ?? '-'}</TD>
                  <TD onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      <Tooltip label="Ver / Editar">
                        <Button size="icon-xs" variant="ghost" onClick={() => navigate(`/notas-venta/${nv.id}`)}>
                          <Eye />
                        </Button>
                      </Tooltip>
                      <Tooltip label="PDF">
                        <Button size="icon-xs" variant="ghost" onClick={() => openPdf(`/api/nota_ventas/${nv.id}/pdf`)}>
                          <FileText />
                        </Button>
                      </Tooltip>
                      {nv.estado === 'pendiente' && (
                        <Tooltip label="Eliminar">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                            onClick={() => { setDeleteId(nv.id); setDeleteError('') }}
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
        )}
      </div>

      <Modal open={deleteId !== null} onOpenChange={(o) => { if (!o) { setDeleteId(null); setDeleteError('') } }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>¿Eliminar nota de venta?</ModalTitle>
            <ModalDescription>Esta acción no se puede deshacer.</ModalDescription>
          </ModalHeader>
          <ModalBody>
            {deleteError && <p className="text-sm text-danger-600 dark:text-danger-400">{deleteError}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => { setDeleteId(null); setDeleteError('') }}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() => deleteId !== null && deleteMut.mutate(deleteId)}
            >
              Eliminar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
