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
  onConfirm: (razon: string) => void
  isPending: boolean
  error: string | null
}

export default function BoletaAnularModal({ isOpen, boleta, onClose, onConfirm, isPending, error }: Props) {
  const [razon, setRazon] = useState('')
  const canSubmit = razon.trim().length > 0 && !isPending

  function handleOpenChange(open: boolean) {
    if (!open && !isPending) onClose()
  }

  return (
    <Modal open={isOpen} onOpenChange={handleOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Anular boleta {String(boleta.numero).padStart(5, '0')}</ModalTitle>
          <ModalDescription>Esta acción no se puede deshacer.</ModalDescription>
        </ModalHeader>
        <ModalBody>
          <label htmlFor="boleta-anular-razon" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Razón *
          </label>
          <textarea
            id="boleta-anular-razon"
            autoFocus
            value={razon}
            onChange={e => setRazon(e.target.value)}
            rows={3}
            aria-invalid={!!error}
            aria-describedby={error ? 'boleta-anular-razon-error' : undefined}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          {error && <p id="boleta-anular-razon-error" className="text-sm text-danger-500 mt-2">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => onConfirm(razon.trim())} disabled={!canSubmit}>
            {isPending ? 'Anulando...' : 'Anular'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
