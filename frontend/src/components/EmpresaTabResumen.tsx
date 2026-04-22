import type { EmpresaListItem, Empresa } from '../types'

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
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-sky-500' : 'text-gray-900 dark:text-white'}`}>
        {value || '—'}
      </div>
    </div>
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
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Nota de Cobranza</div>
          <div className="text-sm text-gray-700 dark:text-gray-300">{empresa.nota_cobranza}</div>
        </div>
      )}
      <div>
        <button onClick={() => onEdit(empresa)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          ✏ Editar empresa
        </button>
      </div>
    </div>
  )
}
