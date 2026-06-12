import { useNavigate } from 'react-router-dom'
import {
  Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Card, CardContent, Button,
} from './ui'
import { BarChart3, Pencil } from 'lucide-react'
import Timeline from './Timeline'
import ClienteTabFacturas from './ClienteTabFacturas'
import VentasTab from './VentasTab'
import { useAuthStore } from '../stores/auth'
import type { Cliente } from '../types'

interface Props {
  cliente: Cliente | null
  onClose: () => void
  onEdit: (c: Cliente) => void
}

export default function ClienteDetailModal({ cliente, onClose, onEdit }: Props) {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const isVendedor = user?.role === 'vendedor'

  if (!cliente) return null

  const subtitle = [cliente.rut, cliente.empresa?.nombre, cliente.email].filter(Boolean).join(' · ')

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalContent size="2xl" className="flex flex-col max-h-[90vh] p-0">
        <ModalHeader className="px-6 pt-5 pb-3">
          <ModalTitle>{cliente.nombre}</ModalTitle>
          {subtitle && <ModalDescription>{subtitle}</ModalDescription>}
        </ModalHeader>

        <Tabs defaultValue="datos" className="flex flex-col flex-1 overflow-hidden">
          <TabsList variant="underline" className="px-6 flex-shrink-0">
            <TabsTrigger value="datos">Datos</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="ventas">Ventas</TabsTrigger>
            <TabsTrigger value="facturas">Facturas</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <TabsContent value="datos">
              <div className="space-y-4">
                <div className="flex justify-end gap-2">
                  {!isVendedor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<BarChart3 size={14} />}
                      onClick={() => {
                        onClose()
                        navigate(`/reportes?tab=por_marca&cliente_id=${cliente.id}`)
                      }}
                    >
                      Ver en reportes
                    </Button>
                  )}
                  <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} onClick={() => onEdit(cliente)}>
                    Editar
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nombre" value={cliente.nombre} />
                  <Field label="RUT" value={cliente.rut ?? '—'} />
                  <Field label="Email" value={cliente.email ?? '—'} />
                  <Field label="Teléfono" value={cliente.telefono ?? '—'} />
                  <Field label="Empresa" value={cliente.empresa?.nombre ?? '—'} />
                  <Field label="Comuna" value={cliente.comuna ?? '—'} />
                  <Field label="Despacho o Retiro" value={cliente.despacho_o_retiro ?? '—'} />
                  <Field label="Forma de Captación" value={cliente.forma_captacion ?? '—'} />
                  <Field label="Último Contacto" value={cliente.ultimo_contacto ?? '—'} />
                  <Field label="Compromiso" value={cliente.compromiso ?? '—'} />
                  <Field label="Dirección Despacho" value={cliente.direccion_despacho ?? '—'} className="col-span-2" />
                  <Field label="Notas" value={cliente.notas ?? '—'} className="col-span-2" />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="timeline">
              <Timeline scope="cliente" entityId={cliente.id} />
            </TabsContent>
            <TabsContent value="ventas">
              <VentasTab scope="clientes" entityId={cliente.id} />
            </TabsContent>
            <TabsContent value="facturas">
              <ClienteTabFacturas clienteId={cliente.id} />
            </TabsContent>
          </div>
        </Tabs>
      </ModalContent>
    </Modal>
  )
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card variant="subtle" className={className}>
      <CardContent className="py-2.5">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{value || '—'}</div>
      </CardContent>
    </Card>
  )
}
