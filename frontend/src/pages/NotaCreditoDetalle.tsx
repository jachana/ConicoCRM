import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { api } from '../lib/api'
import DteBadge from '../components/DteBadge'
import type { NotaCredito } from '../types'
import {
  Button, Card, CardContent, Skeleton,
  Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

export default function NotaCreditoDetalle() {
  const { id } = useParams<{ id: string }>()
  const [nc, setNc] = useState<NotaCredito | null>(null)
  const [emitiendo, setEmitiendo] = useState(false)
  const [emitirOpen, setEmitirOpen] = useState(false)

  useEffect(() => {
    api.get<NotaCredito>(`/api/dte/notas-credito/${id}`).then(r => setNc(r.data))
  }, [id])

  async function handleEmitir() {
    setEmitiendo(true)
    try {
      await api.post(`/api/dte/notas-credito/${id}/emitir`)
      setEmitirOpen(false)
      const r = await api.get<NotaCredito>(`/api/dte/notas-credito/${id}`)
      setNc(r.data)
      toast.success('Solicitud DTE enviada')
    } catch {
      toast.error('Error al emitir. Intenta de nuevo.')
    } finally {
      setEmitiendo(false)
    }
  }

  if (!nc) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const fmt = (v: string | number) => `$${Number(v).toLocaleString('es-CL')}`

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">NC-{nc.numero}</h1>
        <DteBadge estado={nc.dte_estado} />
        {nc.dte_estado === 'no_emitida' && (
          <Button size="sm" leftIcon={<Send className="size-4" />} onClick={() => setEmitirOpen(true)}>
            Emitir DTE
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-2 text-sm">
          <Row label="Fecha" value={nc.fecha} />
          <Row label="Razón" value={nc.razon} />
          <Row label="Neto" value={fmt(nc.monto_neto)} />
          <Row label="IVA" value={fmt(nc.monto_iva)} />
          <div className="flex justify-between font-semibold pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="text-gray-700 dark:text-gray-300">Total</span>
            <span className="text-gray-900 dark:text-gray-100 font-num">{fmt(nc.monto_total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table density="compact">
          <THead>
            <TR>
              <TH>Descripción</TH>
              <TH className="text-right">Cant.</TH>
              <TH className="text-right">P. Unit.</TH>
              <TH className="text-right">Subtotal</TH>
            </TR>
          </THead>
          <TBody>
            {nc.lineas.map(l => (
              <TR key={l.id}>
                <TD>{l.descripcion}</TD>
                <TD className="text-right font-num">{l.cantidad}</TD>
                <TD className="text-right font-num">{fmt(l.precio_unitario)}</TD>
                <TD className="text-right font-num">{fmt(l.subtotal)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Modal open={emitirOpen} onOpenChange={setEmitirOpen}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>¿Emitir Nota de Crédito?</ModalTitle>
            <ModalDescription>Total: <span className="font-num">{fmt(nc.monto_total)}</span></ModalDescription>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Se enviará la nota al SII. Esta acción no se puede deshacer.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setEmitirOpen(false)} disabled={emitiendo}>
              Cancelar
            </Button>
            <Button onClick={handleEmitir} loading={emitiendo}>
              {emitiendo ? 'Enviando...' : 'Confirmar'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-700 dark:text-gray-200">{value}</span>
    </div>
  )
}
