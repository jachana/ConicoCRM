import { Command } from 'cmdk'
import { Clock } from 'lucide-react'
import type { RecentEntity, RecentTipo } from '../../hooks/useRecentEntities'
import { badgeClass } from './items/badge'

interface Props {
  recientes: RecentEntity[]
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string; estado?: string }) => void
}

export default function RecentesGroup({ recientes, onSelect }: Props) {
  if (recientes.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        Empieza a escribir para buscar
      </div>
    )
  }
  return (
    <Command.Group heading="Recientes">
      {recientes.map(r => (
        <Command.Item
          key={`recent-${r.tipo}-${r.id}`}
          value={`recent-${r.tipo}-${r.id}`}
          onSelect={() => onSelect(r)}
          className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
        >
          <Clock size={16} className="text-gray-400" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-900 dark:text-white truncate">{r.titulo}</div>
            {r.subtitulo && <div className="text-xs text-gray-500 truncate">{r.subtitulo}</div>}
          </div>
          {r.estado && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${badgeClass(r.estado)}`}>
              {r.estado}
            </span>
          )}
        </Command.Item>
      ))}
    </Command.Group>
  )
}
