type DteEstado = 'no_emitida' | 'pendiente' | 'procesando' | 'aceptada' | 'rechazada' | 'timeout'

const CONFIG: Record<DteEstado, { label: string; className: string }> = {
  no_emitida:  { label: 'Sin emitir',  className: 'bg-gray-800 text-gray-400 border-gray-700' },
  pendiente:   { label: 'Enviando...', className: 'bg-yellow-900/40 text-yellow-400 border-yellow-800' },
  procesando:  { label: 'Enviando...', className: 'bg-yellow-900/40 text-yellow-400 border-yellow-800' },
  aceptada:    { label: 'DTE OK',      className: 'bg-green-900/40 text-green-400 border-green-800' },
  rechazada:   { label: 'Rechazada',   className: 'bg-red-900/40 text-red-400 border-red-800' },
  timeout:     { label: 'Timeout',     className: 'bg-orange-900/40 text-orange-400 border-orange-800' },
}

export default function DteBadge({ estado }: { estado: string }) {
  const cfg = CONFIG[estado as DteEstado] ?? CONFIG.no_emitida
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
