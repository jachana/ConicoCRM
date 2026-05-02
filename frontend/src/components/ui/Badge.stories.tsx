import type { Meta, StoryObj } from '@storybook/react-vite'
import { CheckCircle } from 'lucide-react'
import { Badge } from './Badge'

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['neutral', 'brand', 'success', 'warning', 'danger', 'info', 'outline'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    showDot: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Badge>

export const Neutral: Story = { args: { children: 'Borrador', variant: 'neutral' } }
export const Brand: Story = { args: { children: 'Nuevo', variant: 'brand' } }
export const Success: Story = { args: { children: 'Pagado', variant: 'success', showDot: true } }
export const Warning: Story = { args: { children: 'Pendiente', variant: 'warning', showDot: true } }
export const Danger: Story = { args: { children: 'Anulado', variant: 'danger', showDot: true } }
export const Info: Story = { args: { children: 'Enviado', variant: 'info', showDot: true } }
export const Outline: Story = { args: { children: 'Opcional', variant: 'outline' } }
export const WithIcon: Story = {
  args: { children: (<><CheckCircle />Activo</>) as any, variant: 'success' },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 p-4">
      {(['neutral', 'brand', 'success', 'warning', 'danger', 'info', 'outline'] as const).map(v => (
        <Badge key={v} variant={v} showDot={v !== 'neutral' && v !== 'outline'}>{v}</Badge>
      ))}
    </div>
  ),
}
