import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  Button, Badge, Skeleton,
  Table, THead, TBody, TR, TH, TD,
} from './ui'
import EntityLink from './EntityLink'

interface CompraItem {
  fecha: string
  oc_id: number
  oc_numero: number
  proveedor_id: number
  proveedor_nombre: string
  estado: string
  cantidad: number
  cantidad_recibida: number
  precio_unitario: string
  total: string
}

interface CompraPage {
  items: CompraItem[]
  total: number
  total_cantidad: number
  total_monto: string
}

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  recibida_parcial: 'Recibida parcial',
  recibida_completa: 'Recibida completa',
  cancelada: 'Cancelada',
}

const ESTADO_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  borrador: 'neutral',
  enviada: 'info',
  recibida_parcial: 'warning',
  recibida_completa: 'success',
  cancelada: 'danger',
}

function fmtCLP(n: number | string | null | undefined) {
  const v = Number(n ?? 0)
  if (!v) return '$0'
  return '$' + Math.round(v).toLocaleString('es-CL')
}

export default function ProductoCompras({ productoId }: { productoId: number }) {
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25

  const { data, isLoading, error } = useQuery<CompraPage>({
    queryKey: ['producto-historial-compras', productoId, page],
    queryFn: () => api.get(`/api/productos/${productoId}/historial-compras`, {
      params: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }).then(r => r.data),
  })

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const items = data?.items ?? []

  if (error) {
    return <p className="text-sm text-danger-600 dark:text-danger-400 py-4">Error al cargar historial de compras.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {total} compra{total !== 1 ? 's' : ''}
        </span>
        {data && total > 0 && (
          <div className="text-xs text-gray-600 dark:text-gray-300 font-num">
            Total cant.: <span className="font-semibold">{Number(data.total_cantidad)}</span>
            <span className="mx-2">·</span>
            Monto: <span className="font-semibold">{fmtCLP(data.total_monto)}</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Sin compras registradas</p>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <Table density="compact">
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>OC</TH>
                <TH>Proveedor</TH>
                <TH>Estado</TH>
                <TH className="text-right">Cant.</TH>
                <TH className="text-right">Precio u.</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((it, idx) => (
                <TR key={`${it.oc_id}-${idx}`}>
                  <TD className="text-gray-600 dark:text-gray-300 whitespace-nowrap font-num text-xs">
                    {new Date(it.fecha).toLocaleDateString('es-CL')}
                  </TD>
                  <TD className="whitespace-nowrap font-num text-xs">
                    <EntityLink kind="oc" id={it.oc_id}>
                      OC-{String(it.oc_numero).padStart(4, '0')}
                    </EntityLink>
                  </TD>
                  <TD className="text-gray-700 dark:text-gray-200 text-xs">
                    {it.proveedor_nombre || <span className="text-gray-400">—</span>}
                  </TD>
                  <TD>
                    <Badge variant={ESTADO_VARIANT[it.estado] ?? 'neutral'} size="sm">
                      {ESTADO_LABELS[it.estado] ?? it.estado}
                    </Badge>
                  </TD>
                  <TD className="text-right font-num">
                    {Number(it.cantidad)}
                    {it.cantidad_recibida !== it.cantidad && (
                      <span className="text-xs text-gray-400 dark:text-gray-500"> ({Number(it.cantidad_recibida)} rec.)</span>
                    )}
                  </TD>
                  <TD className="text-right font-num text-xs">{fmtCLP(it.precio_unitario)}</TD>
                  <TD className="text-right font-num font-semibold">{fmtCLP(it.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <Button size="xs" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            Anterior
          </Button>
          <span className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 font-num">{page} / {totalPages}</span>
          <Button size="xs" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  )
}
