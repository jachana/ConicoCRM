import { useState, useEffect } from 'react'
import {
  Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter,
  Button, Textarea, FormField,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from './ui'
import type { NotaAlerta } from './AlertasTab'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  alerta: NotaAlerta | null
  onSubmit: (contenido: string, estado?: string) => void
  isLoading?: boolean
}

export default function AlertaModal({
  open,
  onOpenChange,
  alerta,
  onSubmit,
  isLoading,
}: Props) {
  const [contenido, setContenido] = useState('')
  const [estado, setEstado] = useState('pendiente')

  useEffect(() => {
    if (alerta) {
      setContenido(alerta.contenido)
      setEstado(alerta.estado)
    } else {
      setContenido('')
      setEstado('pendiente')
    }
  }, [alerta, open])

  const handleSubmit = () => {
    if (!contenido.trim()) return
    onSubmit(contenido, alerta ? estado : undefined)
    setContenido('')
    setEstado('pendiente')
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>
            {alerta ? 'Editar alerta' : 'Crear alerta'}
          </ModalTitle>
        </ModalHeader>
        <ModalBody>
          <FormField label="Contenido" required>
            <Textarea
              value={contenido}
              onChange={e => setContenido(e.target.value)}
              placeholder="Describe la alerta..."
              rows={4}
              disabled={isLoading}
            />
          </FormField>

          {alerta && (
            <FormField label="Estado">
              <Select value={estado} onValueChange={setEstado} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="completada">Completada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!contenido.trim() || isLoading}
            loading={isLoading}
          >
            {alerta ? 'Actualizar' : 'Crear'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
