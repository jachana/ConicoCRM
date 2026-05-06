import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Inbox } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import DteBadge from '../components/DteBadge'
import type { NotaCredito } from '../types'
import {
  Button, Card, EmptyState, Skeleton,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

export default function NotasCredito() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const { data: listResponse, isLoading: loading, isFetching } = useQuery<{ data: NotaCredito[], pagination: { limit: number, offset: number, total: number } }>({
    queryKey: ['notas-credito', page],
    queryFn: () => api.get(`/api/dte/notas-credito/?limit=50&offset=${(page - 1) * 50}`).then(r => r.data),
  })

  const items = listResponse?.data ?? []
  const hasNextPage = items.length === 50

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Notas de Crédito</h1>
        <Button onClick={() => navigate('/notas-credito/nueva')} leftIcon={<Plus className="size-4" />}>
          Nueva NC
        </Button>
      </div>

      {loading ? (
        <Card padded>
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </Card>
      ) : items.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={<Inbox className="size-8" />}
            title="Sin notas de crédito"
            description="Crea la primera para empezar."
          />
        </Card>
      ) : (
        <Card>
          <Table density="compact">
            <THead>
              <TR>
                <TH>N°</TH>
                <TH>Fecha</TH>
                <TH>Razón</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-center">DTE</TH>
              </TR>
            </THead>
            <TBody>
              {items.map(nc => (
                <TR key={nc.id} interactive onClick={() => navigate(`/notas-credito/${nc.id}`)}>
                  <TD>
                    <Link
                      to={`/notas-credito/${nc.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
                    >
                      NC-{nc.numero}
                    </Link>
                  </TD>
                  <TD>{nc.fecha}</TD>
                  <TD className="max-w-xs truncate">{nc.razon}</TD>
                  <TD className="text-right font-num">
                    ${Number(nc.monto_total).toLocaleString('es-CL')}
                  </TD>
                  <TD className="text-center"><DteBadge estado={nc.dte_estado} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {(page > 1 || hasNextPage) && (
        <div className="flex items-center justify-center gap-3 py-3">
          <Button variant="ghost" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || isFetching}>
            Anterior
          </Button>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-num">Página {page}</span>
          <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasNextPage || isFetching}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  )
}
