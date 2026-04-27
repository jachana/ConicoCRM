type DteEstado = 'no_emitida' | 'pendiente' | 'procesando' | 'aceptada' | 'rechazada' | 'timeout'

const CONFIG: Record<DteEstado, { label: string; className: string }> = {
  no_emitida:  { label: 'Sin emitir',  className: 'bg-gray-800 text-gray-400 border-gray-700' },
  pendiente:   { label: 'Enviando...', className: 'bg-warning-900/40 text-warning-400 border-warning-800' },
  procesando:  { label: 'Enviando...', className: 'bg-warning-900/40 text-warning-400 border-warning-800' },
  aceptada:    { label: 'DTE OK',      className: 'bg-success-900/40 text-success-400 border-success-800' },
  rechazada:   { label: 'Rechazada',   className: 'bg-danger-900/40 text-danger-400 border-danger-800' },
  timeout:     { label: 'Timeout',     className: 'bg-warning-900/40 text-warning-300 border-warning-700' },
}

export default function DteBadge({ estado }: { estado: string }) {
  const cfg = CONFIG[estado as DteEstado] ?? CONFIG.no_emitida
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
