import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card'
import { Button } from './Button'

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['default', 'subtle', 'elevated'] },
    padded: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Card>

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Resumen mensual</CardTitle>
        <CardDescription>Mayo 2026 · 12 facturas</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">$4.820.000</p>
        <p className="text-sm text-success-600 mt-1">+12% vs abril</p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm">Ver detalle</Button>
      </CardFooter>
    </Card>
  ),
}

export const Subtle: Story = {
  render: () => (
    <Card variant="subtle" padded className="w-80">
      <p className="text-sm text-gray-600 dark:text-gray-400">Card sutil con padding</p>
    </Card>
  ),
}

export const Elevated: Story = {
  render: () => (
    <Card variant="elevated" padded className="w-80">
      <p className="text-sm text-gray-600 dark:text-gray-400">Card elevada</p>
    </Card>
  ),
}
