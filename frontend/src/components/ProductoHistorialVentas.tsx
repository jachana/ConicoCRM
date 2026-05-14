import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  Button, Badge, Skeleton,
  Table, THead, TBody, TR, TH, TD,
} from './ui'
import EntityLink, { type EntityKind } from './EntityLink'

interface VentaItem {
  fecha: string
  doc_tipo: 'NV' | 'Factura' | 'Boleta'
  doc_id: number
  doc_numero: number | null
  cliente_id: number | null
  cliente_nombre: string | null
  empresa_id: number | null
  empresa_nombre: string | null
  cantidad: string
  precio_unitario: string
  total: string
}

interface VentaPage {
  items: VentaItem[]
  total: number
  total_cantidad: string
  total_monto: string
}

const DOC_KIND: Record<VentaItem['doc_tipo'], EntityKind> = {
  NV: 'nv',
  Factura: 'factura',
  Boleta: 'boleta',
}

function fmtCLP(n: number | string | null | undefined) {
  const v = Number(n ?? 0)
  if (!v) return '$0'
  return '$' + Math.round(v).toLocaleString('es-CL')
}

export default function ProductoHistorialVentas({ productoId }: { productoId: number }) {
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25

  const { data, isLoading, error } = useQuery<VentaPage>({
    queryKey: ['producto-historial-ventas', productoId, page],
    queryFn: () => api.get(`/api/productos/${productoId}/historial-ventas`, {
      params: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }).then(r => r.data),
  })

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const items = data?.items ?? []

  if (error) {
    return <p className="text-sm text-danger-600 dark:text-danger-400 py-4">Error al cargar historial de ventas.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {total} venta{total !== 1 ? 's' : ''}
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
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Sin ventas registradas</p>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <Table density="compact">
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Doc</TH>
                <TH>Cliente / Empresa</TH>
                <TH className="text-right">Cant.</TH>
                <TH className="text-right">Precio u.</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((it, idx) => (
                <TR key={`${it.doc_tipo}-${it.doc_id}-${idx}`}>
                  <TD className="text-gray-600 dark:text-gray-300 whitespace-nowrap font-num text-xs">
                    {new Date(it.fecha).toLocaleDateString('es-CL')}
                  </TD>
                  <TD>
                    <EntityLink kind={DOC_KIND[it.doc_tipo]} id={it.doc_id}>
                      <Badge variant="neutral" size="sm">
                        {it.doc_tipo}{it.doc_numero != null ? ` #${it.doc_numero}` : ''}
                      </Badge>
                    </EntityLink>
                  </TD>
                  <TD className="text-gray-700 dark:text-gray-200 text-xs">
                    {it.empresa_id ? (
                      <EntityLink kind="empresa" id={it.empresa_id}>{it.empresa_nombre ?? '—'}</EntityLink>
                    ) : it.cliente_id ? (
                      <EntityLink kind="cliente" id={it.cliente_id}>{it.cliente_nombre ?? '—'}</EntityLink>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TD>
                  <TD className="text-right font-num">{Number(it.cantidad)}</TD>
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
