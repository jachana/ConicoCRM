import { Command } from 'cmdk'
import { Package } from 'lucide-react'
import type { SearchProducto } from '../../../api/search'
import type { RecentTipo } from '../../../hooks/useRecentEntities'

interface Props {
  item: SearchProducto
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string }) => void
}

export default function ProductoItem({ item, onSelect }: Props) {
  return (
    <Command.Item
      value={`producto-${item.id}-${item.nombre}-${item.sku ?? ''}`}
      onSelect={() => onSelect({ tipo: 'producto', id: item.id, titulo: item.nombre, subtitulo: item.sku ?? undefined })}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <Package size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">{item.nombre}</div>
        {item.sku && <div className="text-xs text-gray-500 truncate">{item.sku}</div>}
      </div>
    </Command.Item>
  )
}
