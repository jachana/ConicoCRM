// frontend/src/components/dashboard/WidgetPicker.tsx
import { Plus } from 'lucide-react'
import { WIDGET_CATALOG, makeWidget } from './widgetCatalog'
import { useModulos } from '../../hooks/useModulos'
import { isModuloEnabled } from '../../lib/modulos'
import type { WidgetConfig } from '../../types/dashboard'

interface WidgetPickerProps {
  isAdmin: boolean
  onAdd: (widget: WidgetConfig) => void
}

export default function WidgetPicker({ isAdmin, onAdd }: WidgetPickerProps) {
  const { effective } = useModulos()
  const available = WIDGET_CATALOG.filter(def => {
    if (!isAdmin && def.adminOnly) return false
    if (def.modulo && !isModuloEnabled(effective, def.modulo)) return false
    return true
  })

  return (
    <div className="w-56 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-3 overflow-y-auto">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        Agregar widget
      </p>
      <div className="flex flex-col gap-2">
        {available.map(def => (
          <button
            key={def.type}
            onClick={() => onAdd(makeWidget(def.type, def.chartTypes[0]))}
            className="flex items-center gap-2 w-full text-left px-2 py-2 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600"
          >
            <Plus size={13} className="flex-shrink-0 text-indigo-500" />
            <span className="truncate">{def.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
