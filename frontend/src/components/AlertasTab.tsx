import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import {
  Button,
  Table, THead, TBody, TR, TH, TD,
  Badge,
  Card,
  Skeleton,
} from './ui'
import AlertaModal from './AlertaModal'

export interface NotaAlerta {
  id: number
  cotizacion_id: number
  contenido: string
  estado: 'pendiente' | 'completada' | 'cancelada'
  created_at: string
  updated_at: string
}

interface Props {
  cotizacionId: number
}

export default function AlertasTab({ cotizacionId }: Props) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAlerta, setEditingAlerta] = useState<NotaAlerta | null>(null)

  const { data: alertas = [], isLoading } = useQuery<NotaAlerta[]>({
    queryKey: ['alertas', cotizacionId],
    queryFn: () => api.get(`/api/cotizaciones/${cotizacionId}/alertas`).then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: (contenido: string) =>
      api.post<NotaAlerta>(`/api/cotizaciones/${cotizacionId}/alertas`, { contenido }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alertas', cotizacionId] })
      setModalOpen(false)
      toast.success('Alerta creada')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al crear alerta'),
  })

  const updateMut = useMutation({
    mutationFn: (data: { id: number; contenido?: string; estado?: string }) =>
      api.patch<NotaAlerta>(`/api/cotizaciones/${cotizacionId}/alertas/${data.id}`, {
        contenido: data.contenido,
        estado: data.estado,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alertas', cotizacionId] })
      setModalOpen(false)
      setEditingAlerta(null)
      toast.success('Alerta actualizada')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al actualizar alerta'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/api/cotizaciones/${cotizacionId}/alertas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alertas', cotizacionId] })
      toast.success('Alerta eliminada')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al eliminar alerta'),
  })

  const getEstadoBadge = (estado: string) => {
    if (estado === 'pendiente') return <Badge variant="warning">Pendiente</Badge>
    if (estado === 'completada') return <Badge variant="success">Completada</Badge>
    if (estado === 'cancelada') return <Badge variant="danger">Cancelada</Badge>
    return <Badge>{estado}</Badge>
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <Card key={i} className="p-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Button
        size="sm"
        variant="primary"
        leftIcon={<Plus />}
        onClick={() => {
          setEditingAlerta(null)
          setModalOpen(true)
        }}
      >
        Agregar alerta
      </Button>

      {alertas.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No hay alertas para esta cotización
          </p>
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <Table density="compact">
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Contenido</TH>
                <TH className="text-center">Estado</TH>
                <TH className="w-20" />
              </TR>
            </THead>
            <TBody>
              {alertas.map(alerta => (
                <TR key={alerta.id}>
                  <TD className="text-sm text-gray-600 dark:text-gray-400 font-num">
                    {formatDate(alerta.created_at)}
                  </TD>
                  <TD className="text-sm">{alerta.contenido}</TD>
                  <TD className="text-center">{getEstadoBadge(alerta.estado)}</TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => {
                          setEditingAlerta(alerta)
                          setModalOpen(true)
                        }}
                        disabled={updateMut.isPending}
                        aria-label="Editar"
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => deleteMut.mutate(alerta.id)}
                        disabled={deleteMut.isPending}
                        aria-label="Eliminar"
                        className="text-danger-600 hover:text-danger-700 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <AlertaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        alerta={editingAlerta}
        onSubmit={(contenido, estado) => {
          if (editingAlerta) {
            updateMut.mutate({
              id: editingAlerta.id,
              contenido,
              estado: estado || undefined,
            })
          } else {
            createMut.mutate(contenido)
          }
        }}
        isLoading={createMut.isPending || updateMut.isPending}
      />
    </div>
  )
}
