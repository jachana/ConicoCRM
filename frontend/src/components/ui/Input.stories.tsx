import type { Meta, StoryObj } from '@storybook/react-vite'
import { Search, Mail } from 'lucide-react'
import { Input } from './Input'

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    tone: { control: 'select', options: ['default', 'error'] },
    disabled: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = { args: { placeholder: 'Buscar cliente…' } }
export const Error: Story = { args: { placeholder: 'Email inválido', tone: 'error' } }
export const Disabled: Story = { args: { placeholder: 'Deshabilitado', disabled: true } }
export const WithLeftIcon: Story = {
  args: { placeholder: 'Buscar…', leftAddon: <Search /> },
}
export const WithRightIcon: Story = {
  args: { placeholder: 'correo@empresa.cl', rightAddon: <Mail /> },
}
export const Small: Story = { args: { placeholder: 'Pequeño', size: 'sm' } }
export const Large: Story = { args: { placeholder: 'Grande', size: 'lg' } }
