import { Command } from 'cmdk'
import type { ActionDef } from '../actions'

interface Props {
  action: ActionDef
  onSelect: (action: ActionDef) => void
}

export default function ActionItem({ action, onSelect }: Props) {
  const Icon = action.icon
  return (
    <Command.Item
      value={`action-${action.slug} ${action.label} ${action.keywords.join(' ')}`}
      onSelect={() => onSelect(action)}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <Icon size={16} className="text-blue-500 dark:text-blue-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">{action.label}</div>
      </div>
      <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
        Acción
      </span>
    </Command.Item>
  )
}
