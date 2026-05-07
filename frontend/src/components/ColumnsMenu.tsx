import { Settings2 } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger } from './ui'
import type { ColumnVisibilityApi } from '../hooks/useColumnVisibility'

interface Props {
  api: ColumnVisibilityApi
  label?: string
}

export default function ColumnsMenu({ api, label = 'Columnas' }: Props) {
  const { columns, isVisible, toggle, reset } = api

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Settings2 size={14} />}
          aria-label={label}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Mostrar columnas
          </span>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
          >
            Reset
          </button>
        </div>
        <div className="space-y-1">
          {columns.map(col => {
            const checked = isVisible(col.key)
            const disabled = !!col.alwaysVisible
            return (
              <label
                key={col.key}
                className={`flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(col.key)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="text-gray-800 dark:text-gray-200">{col.label}</span>
                {disabled && (
                  <span className="ml-auto text-[10px] text-gray-500 dark:text-gray-400">fija</span>
                )}
              </label>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
