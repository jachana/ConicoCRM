import { api } from '../lib/api'

export interface Notification {
  id: number
  tipo: string
  titulo: string
  cuerpo: string | null
  payload: Record<string, unknown>
  leida_at: string | null
  created_at: string
}

export interface NotificationListPage {
  items: Notification[]
  total: number
  unread: number
}

export async function listNotifications(
  params: { unread?: boolean; page?: number; page_size?: number } = {},
): Promise<NotificationListPage> {
  const { data } = await api.get<NotificationListPage>('/api/notifications', {
    params,
  })
  return data
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get<{ unread: number }>('/api/notifications/unread-count')
  return data.unread
}

export async function markRead(id: number): Promise<Notification> {
  const { data } = await api.post<Notification>(`/api/notifications/${id}/read`)
  return data
}

export async function markAllRead(): Promise<number> {
  const { data } = await api.post<{ marked: number }>('/api/notifications/read-all')
  return data.marked
}

export async function deleteNotification(id: number): Promise<void> {
  await api.delete(`/api/notifications/${id}`)
}
