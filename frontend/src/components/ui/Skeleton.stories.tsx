import type { Meta, StoryObj } from '@storybook/react-vite'
import { Skeleton } from './Skeleton'

const meta: Meta<typeof Skeleton> = {
  title: 'UI/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  argTypes: {
    shape: { control: 'select', options: ['rect', 'circle', 'text'] },
  },
}
export default meta
type Story = StoryObj<typeof Skeleton>

export const Rect: Story = { args: { className: 'h-12 w-48' } }
export const Circle: Story = { args: { shape: 'circle', className: 'size-10' } }
export const Text: Story = { args: { shape: 'text', className: 'w-32' } }

export const CardLoader: Story = {
  render: () => (
    <div className="w-80 rounded-lg border border-gray-200 dark:border-gray-800 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton shape="circle" className="size-10" />
        <div className="flex-1 space-y-2">
          <Skeleton shape="text" className="w-32" />
          <Skeleton shape="text" className="w-24 h-3" />
        </div>
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="space-y-2">
        <Skeleton shape="text" className="w-full" />
        <Skeleton shape="text" className="w-3/4" />
      </div>
    </div>
  ),
}

export const TableLoader: Story = {
  render: () => (
    <div className="space-y-3 w-full">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton shape="text" className="w-24" />
          <Skeleton shape="text" className="w-48" />
          <Skeleton shape="text" className="w-20" />
          <Skeleton shape="text" className="w-16" />
        </div>
      ))}
    </div>
  ),
}
