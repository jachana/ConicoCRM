// frontend/src/components/dashboard/WidgetConfig.tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import type { WidgetConfig, ChartType, DateRange } from '../../types/dashboard'
import { WIDGET_BY_TYPE } from './widgetCatalog'

const CHART_LABELS: Record<ChartType, string> = {
  kpi: 'KPI (número)',
  bar: 'Barras',
  line: 'Línea',
  table: 'Tabla',
}

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: 'Hoy',
  week: 'Esta semana',
  month: 'Este mes',
  quarter: 'Este trimestre',
  year: 'Este año',
  custom: 'Personalizado',
}

interface WidgetConfigProps {
  widget: WidgetConfig
  onSave: (updated: WidgetConfig) => void
  onClose: () => void
}

export default function WidgetConfigModal({ widget, onSave, onClose }: WidgetConfigProps) {
  const def = WIDGET_BY_TYPE[widget.type]
  const [draft, setDraft] = useState<WidgetConfig>({ ...widget })

  function set<K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-80 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{def.label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Tipo de gráfico
            </label>
            <select
              value={draft.chart}
              onChange={e => set('chart', e.target.value as ChartType)}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-700 dark:text-gray-200"
            >
              {def.chartTypes.map(ct => (
                <option key={ct} value={ct}>{CHART_LABELS[ct]}</option>
              ))}
            </select>
          </div>

          {def.hasDateRange && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Período
              </label>
              <select
                value={draft.date_range}
                onChange={e => set('date_range', e.target.value as DateRange)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-700 dark:text-gray-200"
              >
                {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map(dr => (
                  <option key={dr} value={dr}>{DATE_RANGE_LABELS[dr]}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Límite de filas
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={draft.limit}
              onChange={e => set('limit', Number(e.target.value))}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-700 dark:text-gray-200"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={() => { onSave(draft); onClose() }}
            className="flex-1 px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
