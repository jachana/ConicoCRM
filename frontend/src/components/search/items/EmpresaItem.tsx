import { Command } from 'cmdk'
import { Building } from 'lucide-react'
import type { SearchEmpresa } from '../../../api/search'
import type { RecentTipo } from '../../../hooks/useRecentEntities'

interface Props {
  item: SearchEmpresa
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string }) => void
}

export default function EmpresaItem({ item, onSelect }: Props) {
  return (
    <Command.Item
      value={`empresa-${item.id}-${item.nombre}-${item.rut ?? ''}`}
      onSelect={() => onSelect({ tipo: 'empresa', id: item.id, titulo: item.nombre, subtitulo: item.rut ?? undefined })}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <Building size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">{item.nombre}</div>
        {item.rut && <div className="text-xs text-gray-500 truncate">{item.rut}</div>}
      </div>
    </Command.Item>
  )
}
