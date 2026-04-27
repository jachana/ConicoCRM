import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api } from '../lib/api'
import type { MovimientoPage } from '../types'
import {
  Button, Badge, Skeleton,
  Table, THead, TBody, TR, TH, TD,
} from './ui'

export default function ProductoHistorial({ productoId }: { productoId: number }) {
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  const { data, isLoading } = useQuery<MovimientoPage>({
    queryKey: ['producto-movimientos', productoId, page],
    queryFn: () => api.get(`/api/productos/${productoId}/movimientos`, {
      params: { page, page_size: PAGE_SIZE }
    }).then(r => r.data),
  })

  function exportar() {
    api.get(`/api/productos/${productoId}/movimientos/export`, { responseType: 'blob' })
      .then(r => {
        const url = URL.createObjectURL(r.data)
        const a = document.createElement('a')
        a.href = url; a.download = `movimientos_${productoId}.csv`; a.click()
        URL.revokeObjectURL(url)
      })
  }

  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const items = data?.items ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 dark:text-gray-400">{total} movimiento{total !== 1 ? 's' : ''}</span>
        <Button size="xs" variant="outline" leftIcon={<Download />} onClick={exportar}>
          Exportar CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Sin movimientos</p>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <Table density="compact">
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Tipo</TH>
                <TH className="text-right">Cant.</TH>
                <TH>Referencia</TH>
                <TH>Motivo</TH>
              </TR>
            </THead>
            <TBody>
              {items.map(m => (
                <TR key={m.id}>
                  <TD className="text-gray-600 dark:text-gray-300 whitespace-nowrap font-num text-xs">
                    {new Date(m.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </TD>
                  <TD>
                    <Badge variant={m.signo > 0 ? 'success' : 'danger'} size="sm" className="capitalize">{m.tipo}</Badge>
                  </TD>
                  <TD className="text-right font-num font-medium">
                    {m.signo > 0 ? '+' : '−'}{m.cantidad}
                  </TD>
                  <TD className="text-gray-500 dark:text-gray-400">
                    {m.referencia_tipo ? `${m.referencia_tipo} #${m.referencia_id}` : '—'}
                  </TD>
                  <TD className="text-gray-500 dark:text-gray-400">{m.motivo ?? '—'}</TD>
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
