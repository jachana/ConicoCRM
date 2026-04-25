import { Command } from 'cmdk'
import { UserCircle } from 'lucide-react'
import type { SearchEmpleado } from '../../../api/search'
import type { RecentTipo } from '../../../hooks/useRecentEntities'

interface Props {
  item: SearchEmpleado
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string }) => void
}

export default function EmpleadoItem({ item, onSelect }: Props) {
  return (
    <Command.Item
      value={`empleado-${item.id}-${item.nombre}`}
      onSelect={() => onSelect({ tipo: 'empleado', id: item.id, titulo: item.nombre, subtitulo: item.cargo })}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <UserCircle size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">{item.nombre}</div>
        <div className="text-xs text-gray-500 truncate">{item.cargo}</div>
      </div>
    </Command.Item>
  )
}
