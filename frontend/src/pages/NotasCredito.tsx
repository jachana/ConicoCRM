import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import DteBadge from '../components/DteBadge'
import type { NotaCredito } from '../types'
import {
  Button, Card, EmptyState, Skeleton,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

export default function NotasCredito() {
  const navigate = useNavigate()
  const [items, setItems] = useState<NotaCredito[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<NotaCredito[]>('/api/dte/notas-credito/').then(r => {
      setItems(r.data)
      setLoading(false)
    })
  }, [])

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
    </div>
  )
}
