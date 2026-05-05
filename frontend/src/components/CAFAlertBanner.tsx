import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCAFAlerts, type CAFAlert } from '../api/cafs'
import { useAuthStore } from '../stores/auth'

function buildMessage(alerts: CAFAlert[]): string {
  if (alerts.length === 1) {
    const a = alerts[0]
    let msg = `CAF tipo ${a.tipo_dte}: ${a.folios_restantes} folios restantes`
    if (a.dias_al_vencimiento !== null && a.dias_al_vencimiento <= 30) {
      msg += `, vence en ${a.dias_al_vencimiento} días`
    }
    return msg
  }
  return `${alerts.length} CAFs requieren atención (folios bajos o próximos a vencer)`
}

export default function CAFAlertBanner() {
  const [dismissed, setDismissed] = useState(false)
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  const { data } = useQuery({
    queryKey: ['caf-alerts'],
    queryFn: getCAFAlerts,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })

  if (dismissed || !data || data.count === 0) return null

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 px-4 py-2 bg-warning-100 dark:bg-warning-900/30 border-b border-warning-300 dark:border-warning-700 text-warning-900 dark:text-warning-100 text-sm flex-shrink-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle size={16} className="flex-shrink-0" />
        <span className="truncate">{buildMessage(data.alerts)}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate('/configuracion')}
          className="px-2 py-1 rounded-md text-xs font-medium bg-warning-200 hover:bg-warning-300 dark:bg-warning-800 dark:hover:bg-warning-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-500 whitespace-nowrap"
        >
          Ver configuración →
        </button>
        <button
          type="button"
          aria-label="Cerrar alerta CAF"
          onClick={() => setDismissed(true)}
          className="p-1 rounded-md hover:bg-warning-200 dark:hover:bg-warning-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-500"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
