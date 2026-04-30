import { useState } from 'react'
import { Bell, Check, CheckCheck, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  listNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  type Notification,
} from '../api/notifications'
import { Popover, PopoverContent, PopoverTrigger } from './ui/Popover'
import { useAuthStore } from '../stores/auth'

const POLL_MS = 30_000

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  const days = Math.floor(diff / 86400)
  if (days < 7) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es-CL')
}

function targetUrl(n: Notification): string | null {
  const p = n.payload as Record<string, unknown>
  if (n.tipo === 'tarea_asignada' && typeof p.tarea_id === 'number') {
    return '/tareas'
  }
  return null
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['notifications', { page: 1, page_size: 10 }],
    queryFn: () => listNotifications({ page: 1, page_size: 10 }),
    enabled: !!user,
    refetchInterval: POLL_MS,
    staleTime: POLL_MS / 2,
  })

  const unread = data?.unread ?? 0
  const items = data?.items ?? []

  const readMut = useMutation({
    mutationFn: (id: number) => markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const readAllMut = useMutation({
    mutationFn: () => markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  function handleClick(n: Notification) {
    if (!n.leida_at) readMut.mutate(n.id)
    const url = targetUrl(n)
    if (url) {
      setOpen(false)
      navigate(url)
    }
  }

  if (!user) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `${unread} notificaciones sin leer` : 'Notificaciones'}
          className="relative flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-md transition-colors"
        >
          <Bell size={16} />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-red-500 text-white"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 max-h-[480px] flex flex-col"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-sm font-semibold">Notificaciones</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => readAllMut.mutate()}
              disabled={readAllMut.isPending}
              className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
            >
              <CheckCheck size={12} />
              Marcar todas leídas
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Sin notificaciones
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map(n => {
                const isUnread = !n.leida_at
                return (
                  <li
                    key={n.id}
                    className={
                      'group relative flex gap-2 px-3 py-2.5 cursor-pointer transition-colors ' +
                      (isUnread
                        ? 'bg-brand-50/40 dark:bg-brand-950/20 hover:bg-brand-50 dark:hover:bg-brand-950/40'
                        : 'hover:bg-gray-50 dark:hover:bg-white/5')
                    }
                    onClick={() => handleClick(n)}
                  >
                    <div
                      aria-hidden
                      className={
                        'mt-1.5 flex-shrink-0 w-2 h-2 rounded-full ' +
                        (isUnread ? 'bg-brand-500' : 'bg-transparent')
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {n.titulo}
                      </div>
                      {n.cuerpo && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">
                          {n.cuerpo}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">
                        {timeAgo(n.created_at)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isUnread && (
                        <button
                          type="button"
                          aria-label="Marcar leída"
                          onClick={e => {
                            e.stopPropagation()
                            readMut.mutate(n.id)
                          }}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10"
                        >
                          <Check size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Eliminar"
                        onClick={e => {
                          e.stopPropagation()
                          deleteMut.mutate(n.id)
                        }}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
