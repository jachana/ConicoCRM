// frontend/src/components/dashboard/WidgetGrid.tsx
import GridLayout from 'react-grid-layout'
import type { WidgetConfig } from '../../types/dashboard'
import Widget from './Widget'

type LayoutItem = { i: string; x: number; y: number; w: number; h: number; static?: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WidthProvider = (GridLayout as any).WidthProvider as (c: React.ComponentType<any>) => React.ComponentClass<any>

const ResponsiveGrid = WidthProvider(GridLayout)

interface WidgetGridProps {
  widgets: WidgetConfig[]
  editMode: boolean
  onLayoutChange: (updated: WidgetConfig[]) => void
  onConfigure: (id: string) => void
  onRemove: (id: string) => void
}

export default function WidgetGrid({
  widgets, editMode, onLayoutChange, onConfigure, onRemove,
}: WidgetGridProps) {
  const layout: LayoutItem[] = widgets.map(w => ({
    i: w.id,
    x: w.grid.x,
    y: w.grid.y,
    w: w.grid.w,
    h: w.grid.h,
    static: !editMode,
  }))

  function handleLayoutChange(newLayout: LayoutItem[]) {
    const posMap = Object.fromEntries(newLayout.map(l => [l.i, l]))
    const updated = widgets.map(w => {
      const pos = posMap[w.id]
      if (!pos) return w
      return { ...w, grid: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } }
    })
    onLayoutChange(updated)
  }

  return (
    <ResponsiveGrid
      className="layout"
      layout={layout as never}
      cols={12}
      rowHeight={60}
      isDraggable={editMode}
      isResizable={editMode}
      onLayoutChange={handleLayoutChange as never}
      draggableHandle=".drag-handle"
    >
      {widgets.map(w => (
        <div key={w.id} className={editMode ? 'cursor-grab' : ''}>
          {editMode && (
            <div className="drag-handle absolute top-0 left-0 right-0 h-6 cursor-grab z-10 opacity-0 hover:opacity-100 bg-indigo-500/20 rounded-t" />
          )}
          <Widget
            widget={w}
            editMode={editMode}
            onConfigure={onConfigure}
            onRemove={onRemove}
          />
        </div>
      ))}
    </ResponsiveGrid>
  )
}
