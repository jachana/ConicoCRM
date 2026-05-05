import { useState } from 'react'
import type { BoletaListItem } from '../api/boletas'
import {
  Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription,
  ModalBody, ModalFooter,
} from './ui/Modal'
import { Button } from './ui/Button'

interface Props {
  isOpen: boolean
  boleta: BoletaListItem
  onClose: () => void
  onConfirm: (email: string) => void
  isPending: boolean
  error: string | null
}

export default function BoletaEmailModal({ isOpen, boleta, onClose, onConfirm, isPending, error }: Props) {
  const [email, setEmail] = useState('')
  const canSubmit = /\S+@\S+\.\S+/.test(email) && !isPending

  function handleOpenChange(open: boolean) {
    if (!open && !isPending) onClose()
  }

  return (
    <Modal open={isOpen} onOpenChange={handleOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Enviar boleta {String(boleta.numero).padStart(5, '0')}</ModalTitle>
          <ModalDescription>No hay email asociado. Ingresa el destinatario.</ModalDescription>
        </ModalHeader>
        <ModalBody>
          <label htmlFor="boleta-email-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email *
          </label>
          <input
            id="boleta-email-input"
            autoFocus
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'boleta-email-input-error' : undefined}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          {error && <p id="boleta-email-input-error" className="text-sm text-danger-500 mt-2">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(email)} disabled={!canSubmit}>
            {isPending ? 'Enviando...' : 'Enviar'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
