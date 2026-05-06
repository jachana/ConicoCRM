type DteEstado = 'no_emitida' | 'pendiente' | 'procesando' | 'aceptada' | 'rechazada' | 'timeout'

const CONFIG: Record<DteEstado, { label: string; className: string }> = {
  no_emitida:  { label: 'Sin emitir',  className: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700' },
  pendiente:   { label: 'Enviando...', className: 'bg-warning-100 dark:bg-warning-900/40 text-warning-700 dark:text-warning-400 border-warning-300 dark:border-warning-800' },
  procesando:  { label: 'Enviando...', className: 'bg-warning-100 dark:bg-warning-900/40 text-warning-700 dark:text-warning-400 border-warning-300 dark:border-warning-800' },
  aceptada:    { label: 'DTE OK',      className: 'bg-success-100 dark:bg-success-900/40 text-success-700 dark:text-success-400 border-success-300 dark:border-success-800' },
  rechazada:   { label: 'Rechazada',   className: 'bg-danger-100 dark:bg-danger-900/40 text-danger-700 dark:text-danger-400 border-danger-300 dark:border-danger-800' },
  timeout:     { label: 'Timeout',     className: 'bg-warning-100 dark:bg-warning-900/40 text-warning-800 dark:text-warning-300 border-warning-400 dark:border-warning-700' },
}

export default function DteBadge({ estado }: { estado: string }) {
  const cfg = CONFIG[estado as DteEstado] ?? CONFIG.no_emitida
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
