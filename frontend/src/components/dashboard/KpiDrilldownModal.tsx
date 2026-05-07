import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Loader2, ExternalLink } from 'lucide-react'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from '../ui/Modal'
import { api } from '../../lib/api'
import type {
  VentasDetalleOut,
  NVPorCobrarOut,
  StockCriticoItem,
} from '../../types/dashboard'

export type KpiDrilldownKind = 'hoy' | 'mes' | 'cobrar' | 'stock'

interface Props {
  kind: KpiDrilldownKind | null
  onClose: () => void
}

const TITLES: Record<KpiDrilldownKind, string> = {
  hoy: 'Ventas de hoy',
  mes: 'Ventas del mes',
  cobrar: 'Notas de venta por cobrar',
  stock: 'Productos bajo stock mínimo',
}

function formatCLP(n: number): string {
  return n.toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  })
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function endpointFor(kind: KpiDrilldownKind): string {
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const todayIso = isoDate(today)
  const monthStartIso = isoDate(monthStart)
  switch (kind) {
    case 'hoy':
      return `/api/dashboard/data/ventas_detalle?date_from=${todayIso}&date_to=${todayIso}&limit=100`
    case 'mes':
      return `/api/dashboard/data/ventas_detalle?date_from=${monthStartIso}&date_to=${todayIso}&limit=100`
    case 'cobrar':
      return `/api/dashboard/data/nv_por_cobrar?limit=100`
    case 'stock':
      return `/api/dashboard/data/stock_critico?limit=100`
  }
}

function VentasTable({ data }: { data: VentasDetalleOut }) {
  if (!data.items.length) {
    return <EmptyState text="Sin ventas en este rango." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <th className="text-left font-medium py-2 pr-3">NV</th>
            <th className="text-left font-medium py-2 pr-3">Fecha</th>
            <th className="text-left font-medium py-2 pr-3">Cliente</th>
            <th className="text-left font-medium py-2 pr-3">Estado</th>
            <th className="text-right font-medium py-2 pl-3">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {data.items.map(it => (
            <tr key={it.nv_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="py-2 pr-3">
                <Link
                  to={`/notas-venta/${it.nv_id}`}
                  className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                >
                  NV-{String(it.numero).padStart(4, '0')}
                  <ExternalLink size={12} />
                </Link>
              </td>
              <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 tabular-nums">{it.fecha}</td>
              <td className="py-2 pr-3 text-gray-900 dark:text-gray-100 truncate max-w-[280px]">
                {it.cliente}
              </td>
              <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 capitalize">{it.estado}</td>
              <td className="py-2 pl-3 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                {formatCLP(it.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-gray-700">
            <td colSpan={4} className="py-2 pr-3 text-xs text-gray-500 dark:text-gray-400">
              {data.count} venta{data.count === 1 ? '' : 's'}
            </td>
            <td className="py-2 pl-3 text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {formatCLP(data.total_monto)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function PorCobrarTable({ data }: { data: NVPorCobrarOut }) {
  if (!data.items.length) {
    return <EmptyState text="Sin notas de venta pendientes." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <th className="text-left font-medium py-2 pr-3">NV</th>
            <th className="text-left font-medium py-2 pr-3">Fecha</th>
            <th className="text-left font-medium py-2 pr-3">Cliente</th>
            <th className="text-right font-medium py-2 pl-3">Monto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {data.items.map(it => (
            <tr key={it.nv_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="py-2 pr-3">
                <Link
                  to={`/notas-venta/${it.nv_id}`}
                  className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                >
                  NV-{String(it.numero).padStart(4, '0')}
                  <ExternalLink size={12} />
                </Link>
              </td>
              <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 tabular-nums">
                {it.fecha ?? '—'}
              </td>
              <td className="py-2 pr-3 text-gray-900 dark:text-gray-100 truncate max-w-[280px]">
                {it.cliente}
              </td>
              <td className="py-2 pl-3 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                {formatCLP(it.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-gray-700">
            <td colSpan={3} className="py-2 pr-3 text-xs text-gray-500 dark:text-gray-400">
              {data.count} pendiente{data.count === 1 ? '' : 's'}
            </td>
            <td className="py-2 pl-3 text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {formatCLP(data.total_monto)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function StockTable({ items }: { items: StockCriticoItem[] }) {
  if (!items.length) {
    return <EmptyState text="No hay productos bajo el mínimo." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <th className="text-left font-medium py-2 pr-3">SKU</th>
            <th className="text-left font-medium py-2 pr-3">Producto</th>
            <th className="text-right font-medium py-2 pl-3">Actual</th>
            <th className="text-right font-medium py-2 pl-3">Mínimo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {items.map(it => (
            <tr key={it.producto_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="py-2 pr-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                {it.sku ?? '—'}
              </td>
              <td className="py-2 pr-3">
                <Link
                  to="/inventario"
                  className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                >
                  {it.nombre}
                  <ExternalLink size={12} />
                </Link>
              </td>
              <td className="py-2 pl-3 text-right tabular-nums text-rose-600 dark:text-rose-400 font-medium">
                {it.stock_actual}
              </td>
              <td className="py-2 pl-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                {it.stock_minimo}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{text}</div>
  )
}

export default function KpiDrilldownModal({ kind, onClose }: Props) {
  const open = kind !== null
  const url = kind ? endpointFor(kind) : ''

  const { data, isLoading, error } = useQuery({
    queryKey: ['kpi-drilldown', kind],
    queryFn: () => api.get(url).then(r => r.data),
    enabled: open,
    staleTime: 30_000,
  })

  return (
    <Modal open={open} onOpenChange={o => { if (!o) onClose() }}>
      <ModalContent size="2xl">
        <ModalHeader>
          <ModalTitle>{kind ? TITLES[kind] : ''}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          {isLoading && (
            <div className="py-10 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              <Loader2 size={16} className="animate-spin mr-2" />
              Cargando…
            </div>
          )}
          {error && !isLoading && (
            <div className="py-10 text-center text-sm text-rose-600 dark:text-rose-400">
              No se pudo cargar la información.
            </div>
          )}
          {!isLoading && !error && data && kind === 'hoy' && <VentasTable data={data} />}
          {!isLoading && !error && data && kind === 'mes' && <VentasTable data={data} />}
          {!isLoading && !error && data && kind === 'cobrar' && <PorCobrarTable data={data} />}
          {!isLoading && !error && data && kind === 'stock' && (
            <StockTable items={data as StockCriticoItem[]} />
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
