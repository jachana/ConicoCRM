import type { EmpresaListItem, Empresa } from '../types'
import EmpresaTabResumen from './EmpresaTabResumen'
import EmpresaTabFacturas from './EmpresaTabFacturas'
import EmpresaTabProductos from './EmpresaTabProductos'
import EmpresaTabCredito from './EmpresaTabCredito'
import EmpresaTabContactos from './EmpresaTabContactos'
import VentasTab from './VentasTab'
import Timeline from './Timeline'
import {
  Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from './ui'

interface Props {
  empresa: EmpresaListItem | null
  onClose: () => void
  onEdit?: (e: Empresa) => void
}

export default function EmpresaDetailModal({ empresa, onClose, onEdit }: Props) {
  if (!empresa) return null

  const subtitle = [empresa.rut, empresa.sector].filter(Boolean).join(' · ')

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalContent size="2xl" className="flex flex-col max-h-[90vh] p-0">
        <ModalHeader className="px-6 pt-5 pb-3">
          <ModalTitle>{empresa.nombre}</ModalTitle>
          {subtitle && <ModalDescription>{subtitle}</ModalDescription>}
        </ModalHeader>

        <Tabs defaultValue="resumen" className="flex flex-col flex-1 overflow-hidden">
          <TabsList variant="underline" className="px-6 flex-shrink-0">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="ventas">Ventas</TabsTrigger>
            <TabsTrigger value="facturas">Facturas</TabsTrigger>
            <TabsTrigger value="productos">Productos</TabsTrigger>
            <TabsTrigger value="credito">Crédito</TabsTrigger>
            <TabsTrigger value="contactos">Contactos</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <TabsContent value="resumen">
              <EmpresaTabResumen empresa={empresa} onEdit={onEdit} />
            </TabsContent>
            <TabsContent value="timeline">
              <Timeline scope="empresa" entityId={empresa.id} />
            </TabsContent>
            <TabsContent value="ventas">
              <VentasTab scope="empresas" entityId={empresa.id} />
            </TabsContent>
            <TabsContent value="facturas">
              <EmpresaTabFacturas empresaId={empresa.id} empresaNombre={empresa.nombre} />
            </TabsContent>
            <TabsContent value="productos">
              <EmpresaTabProductos empresaId={empresa.id} empresaNombre={empresa.nombre} />
            </TabsContent>
            <TabsContent value="credito">
              <EmpresaTabCredito empresaId={empresa.id} />
            </TabsContent>
            <TabsContent value="contactos">
              <EmpresaTabContactos empresaId={empresa.id} />
            </TabsContent>
          </div>
        </Tabs>
      </ModalContent>
    </Modal>
  )
}
