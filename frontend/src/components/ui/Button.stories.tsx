import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus, Trash2, Download } from 'lucide-react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost', 'danger', 'success', 'link'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'icon', 'icon-sm', 'icon-xs'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = { args: { children: 'Nueva factura', variant: 'primary' } }
export const Secondary: Story = { args: { children: 'Cancelar', variant: 'secondary' } }
export const Outline: Story = { args: { children: 'Exportar', variant: 'outline' } }
export const Ghost: Story = { args: { children: 'Ver detalle', variant: 'ghost' } }
export const Danger: Story = { args: { children: 'Eliminar', variant: 'danger' } }
export const Success: Story = { args: { children: 'Confirmar', variant: 'success' } }
export const Link: Story = { args: { children: 'Ver más', variant: 'link' } }
export const Loading: Story = { args: { children: 'Guardando…', loading: true } }
export const Disabled: Story = { args: { children: 'Deshabilitado', disabled: true } }
export const WithLeftIcon: Story = {
  args: { children: 'Agregar producto', leftIcon: <Plus /> },
}
export const WithRightIcon: Story = {
  args: { children: 'Descargar PDF', rightIcon: <Download />, variant: 'outline' },
}
export const IconButton: Story = {
  args: { size: 'icon', variant: 'ghost', children: <Trash2 /> },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 p-4">
      {(['primary', 'secondary', 'outline', 'ghost', 'danger', 'success', 'link'] as const).map(v => (
        <Button key={v} variant={v}>{v}</Button>
      ))}
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-3 p-4">
      {(['xs', 'sm', 'md', 'lg'] as const).map(s => (
        <Button key={s} size={s}>{s}</Button>
      ))}
    </div>
  ),
}
