import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText, Search, AlertCircle } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { Button } from './Button'

const meta: Meta<typeof EmptyState> = {
  title: 'UI/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof EmptyState>

export const NoDocuments: Story = {
  args: {
    icon: <FileText />,
    title: 'Sin facturas',
    description: 'Aún no tienes facturas emitidas. Crea tu primera factura para comenzar.',
    action: <Button leftIcon={<FileText />}>Nueva factura</Button>,
  },
}

export const SearchEmpty: Story = {
  args: {
    icon: <Search />,
    title: 'Sin resultados',
    description: 'No se encontraron resultados para tu búsqueda.',
  },
}

export const ErrorState: Story = {
  args: {
    icon: <AlertCircle />,
    title: 'Error al cargar',
    description: 'No se pudo cargar la información. Intenta de nuevo.',
    action: <Button variant="outline">Reintentar</Button>,
  },
}

export const Minimal: Story = {
  args: { title: 'Sin datos' },
}
