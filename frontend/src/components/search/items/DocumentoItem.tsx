import { Command } from 'cmdk'
import { FileText, ShoppingCart, Receipt, Truck } from 'lucide-react'
import type { SearchDoc } from '../../../api/search'
import type { RecentTipo } from '../../../hooks/useRecentEntities'
import { badgeClass } from './badge'

type DocTipo = Extract<RecentTipo, 'cotizacion' | 'nota_venta' | 'factura' | 'orden_compra'>

const ICONS: Record<DocTipo, typeof FileText> = {
  cotizacion: FileText,
  nota_venta: ShoppingCart,
  factura: Receipt,
  orden_compra: Truck,
}

interface Props {
  item: SearchDoc
  tipo: DocTipo
  onSelect: (e: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string; estado?: string }) => void
}

export default function DocumentoItem({ item, tipo, onSelect }: Props) {
  const Icon = ICONS[tipo]
  const subtitulo = item.cliente_nombre ?? item.proveedor_nombre ?? undefined
  return (
    <Command.Item
      value={`${tipo}-${item.id}-${item.numero}`}
      onSelect={() =>
        onSelect({
          tipo,
          id: item.id,
          titulo: `#${item.numero}`,
          subtitulo,
          estado: item.estado,
        })
      }
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-white/5"
    >
      <Icon size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white truncate">#{item.numero}</div>
        {subtitulo && <div className="text-xs text-gray-500 truncate">{subtitulo}</div>}
      </div>
      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${badgeClass(item.estado)}`}>
        {item.estado}
      </span>
    </Command.Item>
  )
}
