import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { misPendientes } from '../api/tareas'
import type { MisPendientes } from '../types/tarea'

interface Props {
  collapsed?: boolean
  onClose?: () => void
}

export default function MisPendientesWidget({ collapsed, onClose }: Props) {
  const user = useAuthStore(s => s.user)

  const { data } = useQuery<MisPendientes>({
    queryKey: ['mis-pendientes'],
    queryFn: () => misPendientes(),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 5 * 60 * 1000,
  })

  if (collapsed) return null
  if (!data || data.total === 0) return null

  return (
    <div className="mx-2 my-2 p-3 rounded-lg bg-white/5 border border-white/10">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
        Mis pendientes
      </div>
      <div className="space-y-1 text-sm text-gray-300">
        {data.vencidas > 0 && (
          <div className="flex items-center gap-2">
            <span aria-hidden>🔴</span>
            <span>{data.vencidas} vencidas</span>
          </div>
        )}
        {data.hoy > 0 && (
          <div className="flex items-center gap-2">
            <span aria-hidden>🟡</span>
            <span>{data.hoy} hoy</span>
          </div>
        )}
        {data.futuras > 0 && (
          <div className="flex items-center gap-2">
            <span aria-hidden>⚪</span>
            <span>{data.futuras} próximas</span>
          </div>
        )}
      </div>
      <Link
        to="/tareas"
        onClick={onClose}
        className="block mt-2 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
      >
        Ver todas →
      </Link>
    </div>
  )
}
