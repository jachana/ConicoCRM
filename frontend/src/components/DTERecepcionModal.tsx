import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter,
  Badge, Button,
} from './ui'
import DteRecepcionRechazarModal from './DteRecepcionRechazarModal'
import { aceptarDteRecepcion, rechazarDteRecepcion, type DteRecepcionRead } from '../api/dte_recepcion'

interface Props {
  dteRecepcion: DteRecepcionRead | null
  onClose: () => void
}

const ESTADO_VARIANT: Record<'recibido' | 'aceptado' | 'rechazado', 'info' | 'success' | 'danger'> = {
  recibido: 'info',
  aceptado: 'success',
  rechazado: 'danger',
}

const ESTADO_LABELS: Record<'recibido' | 'aceptado' | 'rechazado', string> = {
  recibido: 'Recibido',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
}

function fmtMoney(n: number | string) {
  const num = typeof n === 'string' ? Number(n) : n
  return `$ ${Math.round(num).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  const date = new Date(iso)
  return date.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DTERecepcionModal({ dteRecepcion, onClose }: Props) {
  const qc = useQueryClient()
  const [rechazarTarget, setRechazarTarget] = useState(false)
  const [xmlExpanded, setXmlExpanded] = useState(false)
  const [respuestaExpanded, setRespuestaExpanded] = useState(false)

  if (!dteRecepcion) return null

  const canAction = dteRecepcion.estado === 'recibido'

  const aceptarMut = useMutation({
    mutationFn: () => aceptarDteRecepcion(dteRecepcion.id),
    onSuccess: () => {
      toast.success('DTE aceptado')
      qc.invalidateQueries({ queryKey: ['dte-recepcion-list'] })
      onClose()
    },
    onError: () => {
      toast.error('Error al aceptar DTE')
    },
  })

  const rechazarMut = useMutation({
    mutationFn: ({ motivo }: { motivo: string }) => {
      if (!dteRecepcion) throw new Error('DTE not found')
      return rechazarDteRecepcion(dteRecepcion.id, motivo)
    },
    onSuccess: () => {
      toast.success('DTE rechazado')
      setRechazarTarget(false)
      qc.invalidateQueries({ queryKey: ['dte-recepcion-list'] })
      onClose()
    },
    onError: () => {
      toast.error('Error al rechazar DTE')
    },
  })

  function handleCopyXml() {
    if (dteRecepcion && dteRecepcion.xml_raw) {
      navigator.clipboard.writeText(dteRecepcion.xml_raw)
      toast.success('XML copiado al portapapeles')
    }
  }

  function handleRechazarConfirm(motivo: string) {
    rechazarMut.mutate({ motivo })
  }

  return (
    <>
      <Modal open onOpenChange={(o) => { if (!o) onClose() }}>
        <ModalContent size="lg" className="flex flex-col max-h-[90vh]">
          <ModalHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <ModalTitle>
                  DTE {dteRecepcion.tipo} Folio {dteRecepcion.folio}
                </ModalTitle>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {dteRecepcion.rut_emisor} · {fmtDate(dteRecepcion.created_at)}
                </p>
              </div>
              <Badge variant={ESTADO_VARIANT[dteRecepcion.estado]} showDot>
                {ESTADO_LABELS[dteRecepcion.estado]}
              </Badge>
            </div>
          </ModalHeader>

          <ModalBody className="space-y-5">
            {/* Basic Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Información</h3>
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Tipo DTE" value={dteRecepcion.tipo} />
                <InfoField label="Folio" value={String(dteRecepcion.folio)} />
                <InfoField label="RUT Emisor" value={dteRecepcion.rut_emisor} />
                <InfoField label="Monto" value={fmtMoney(dteRecepcion.monto)} />
                <InfoField label="Empresa ID" value={String(dteRecepcion.empresa_id)} />
                <InfoField label="Estado" value={ESTADO_LABELS[dteRecepcion.estado]} />
              </div>
            </div>

            {/* Timestamps */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Fechas</h3>
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Creado" value={fmtDate(dteRecepcion.created_at)} />
                <InfoField label="Actualizado" value={fmtDate(dteRecepcion.updated_at)} />
              </div>
            </div>

            {/* Respuesta SII */}
            {dteRecepcion.respuesta_sii && (
              <div className="space-y-3">
                <button
                  onClick={() => setRespuestaExpanded(!respuestaExpanded)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 w-full"
                >
                  {respuestaExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  Respuesta SII
                </button>
                {respuestaExpanded && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 font-mono text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-40">
                    {JSON.stringify(dteRecepcion.respuesta_sii, null, 2)}
                  </div>
                )}
              </div>
            )}

            {/* Rechazo Motivo */}
            {dteRecepcion.rechazo_motivo && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Motivo del Rechazo</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-danger-50 dark:bg-danger-500/10 p-3 rounded-lg border border-danger-200 dark:border-danger-900">
                  {dteRecepcion.rechazo_motivo}
                </p>
              </div>
            )}

            {/* XML Raw */}
            {dteRecepcion.xml_raw && (
              <div className="space-y-3">
                <button
                  onClick={() => setXmlExpanded(!xmlExpanded)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 w-full"
                >
                  {xmlExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  XML Raw
                </button>
                {xmlExpanded && (
                  <div className="relative">
                    <button
                      onClick={handleCopyXml}
                      className="absolute top-2 right-2 p-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-400"
                      title="Copiar XML"
                    >
                      <Copy size={14} />
                    </button>
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 font-mono text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-60 break-words">
                      {dteRecepcion.xml_raw}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ModalBody>

          <ModalFooter className="gap-3">
            {canAction && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRechazarTarget(true)}
                  disabled={aceptarMut.isPending || rechazarMut.isPending}
                >
                  Rechazar
                </Button>
                <Button
                  size="sm"
                  loading={aceptarMut.isPending}
                  onClick={() => aceptarMut.mutate()}
                >
                  Aceptar
                </Button>
              </>
            )}
            {!canAction && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                No se puede cambiar el estado de un DTE {ESTADO_LABELS[dteRecepcion.estado].toLowerCase()}
              </div>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Rechazar modal */}
      {rechazarTarget && (
        <DteRecepcionRechazarModal
          dteRecepcion={dteRecepcion}
          onCancel={() => setRechazarTarget(false)}
          onConfirm={handleRechazarConfirm}
          isPending={rechazarMut.isPending}
          error={rechazarMut.error ? 'No se pudo rechazar' : null}
        />
      )}
    </>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">{value || '—'}</div>
    </div>
  )
}
