import { AlertTriangle } from 'lucide-react'
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter, Button } from './ui'
import type { NotaAlerta } from '../types'

const TIPO_LABELS: Record<string, string> = {
  cobranza: 'Cobranza',
  'crédito': 'Crédito',
  custom: 'Alerta',
}

interface Props {
  isOpen: boolean
  notes: NotaAlerta[]
  onClose: () => void
}

export default function AlertNotesModal({ isOpen, notes, onClose }: Props) {
  return (
    <Modal open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Alertas del cliente
          </ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Este cliente tiene {notes.length} alerta{notes.length !== 1 ? 's' : ''} activa{notes.length !== 1 ? 's' : ''}. Revisa antes de continuar.
          </p>
          <ul className="space-y-2">
            {notes.map(note => (
              <li
                key={note.id}
                className="rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-3 py-2"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                    {TIPO_LABELS[note.tipo ?? 'custom'] ?? note.tipo}
                  </span>
                  {note.monto != null && (
                    <span className="text-xs text-red-600 dark:text-red-400 font-num">
                      $ {Number(note.monto).toLocaleString('es-CL')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-red-900 dark:text-red-200">{note.contenido}</p>
              </li>
            ))}
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={onClose}>
            Entendido, continuar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
