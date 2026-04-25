import { Command } from 'cmdk'
import { User } from 'lucide-react'
import type { SearchCliente } from '../../../api/search'
import type { RecentTipo } from '../../../hooks/useRecentEntities'

interface Props {
  item: SearchCliente
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string }) => void
}

export default function ClienteItem({ item, onSelect }: Props) {
  const subtitulo = [item.rut, item.empresa].filter(Boolean).join(' · ')
  return (
    <Command.Item
      value={`cliente-${item.id}-${item.nombre}-${item.rut ?? ''}`}
      onSelect={() => onSelect({ tipo: 'cliente', id: item.id, titulo: item.nombre, subtitulo: subtitulo || undefined })}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <User size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">{item.nombre}</div>
        {subtitulo && <div className="text-xs text-gray-500 truncate">{subtitulo}</div>}
      </div>
    </Command.Item>
  )
}
