import { Pencil } from 'lucide-react'
import type { EmpresaListItem, Empresa } from '../types'
import { Button, Card, CardContent } from './ui'

interface Props {
  empresa: EmpresaListItem
  onEdit: (e: Empresa) => void
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card variant="subtle">
      <CardContent className="py-2.5">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
        <div className={`text-sm font-medium ${highlight ? 'text-brand-600 dark:text-brand-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {value || '—'}
        </div>
      </CardContent>
    </Card>
  )
}

export default function EmpresaTabResumen({ empresa, onEdit }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field label="RUT" value={empresa.rut ?? '—'} />
        <Field label="Razón Social" value={empresa.razon_social ?? '—'} />
        <Field label="Sector" value={empresa.sector ?? '—'} />
        <Field label="Forma de Pago" value={empresa.forma_pago ?? '—'} />
        <Field label="Plazo de Crédito" value={empresa.plazo_credito ?? '—'} />
        <Field label="Prioridad" value={empresa.prioridad ?? '—'} />
        <Field label="Línea de Crédito" value={fmtMoney(empresa.linea_credito)} />
        <Field label="Límite de Crédito" value={fmtMoney(empresa.limite_credito)} />
        <Field label="Última Compra" value={fmtDate(empresa.ultima_compra)} highlight />
        <Field label="Email" value={empresa.email ?? '—'} />
        <Field label="Ubicación" value={empresa.ubicacion ?? '—'} />
      </div>
      {empresa.nota_cobranza && (
        <Card variant="subtle">
          <CardContent className="py-2.5">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Nota de Cobranza</div>
            <div className="text-sm text-gray-700 dark:text-gray-300">{empresa.nota_cobranza}</div>
          </CardContent>
        </Card>
      )}
      <div>
        <Button leftIcon={<Pencil />} onClick={() => onEdit(empresa)}>
          Editar empresa
        </Button>
      </div>
    </div>
  )
}
