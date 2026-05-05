import {
  Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription,
  ModalFooter,
} from './Modal'
import { Button } from './Button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  onConfirm: () => void
  isPending?: boolean
}

export default function ConfirmModal({
  open, onOpenChange, title, description,
  confirmLabel = 'Eliminar', onConfirm, isPending,
}: Props) {
  return (
    <Modal open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          {description && <ModalDescription>{description}</ModalDescription>}
        </ModalHeader>
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Procesando...' : confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
