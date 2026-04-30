import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import DteBadge from '../components/DteBadge'
import type { FacturaCompra } from '../types'
import {
  Button, Card, EmptyState, Skeleton,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

export default function FacturasCompraList() {
  const navigate = useNavigate()
  const [items, setItems] = useState<FacturaCompra[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<FacturaCompra[]>('/api/facturas-compra/').then(r => {
      setItems(r.data)
      setLoading(false)
    })
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Facturas de Compra</h1>
        <Button onClick={() => navigate('/facturas-compra/nueva')} leftIcon={<Plus className="size-4" />}>
          Nueva FC
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
            title="Sin facturas de compra"
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
                <TH>Proveedor</TH>
                <TH className="text-right">Neto</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-center">DTE</TH>
              </TR>
            </THead>
            <TBody>
              {items.map(fc => (
                <TR key={fc.id} interactive onClick={() => navigate(`/facturas-compra/${fc.id}`)}>
                  <TD>
                    <Link
                      to={`/facturas-compra/${fc.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
                    >
                      FC-{fc.numero}
                    </Link>
                  </TD>
                  <TD>{fc.fecha}</TD>
                  <TD className="text-gray-700 dark:text-gray-300">
                    {fc.proveedor_id ? `Proveedor #${fc.proveedor_id}` : '—'}
                  </TD>
                  <TD className="text-right font-num">
                    ${Number(fc.total_neto).toLocaleString('es-CL')}
                  </TD>
                  <TD className="text-right font-num">
                    ${Number(fc.total).toLocaleString('es-CL')}
                  </TD>
                  <TD className="text-center"><DteBadge estado={fc.dte_estado} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
