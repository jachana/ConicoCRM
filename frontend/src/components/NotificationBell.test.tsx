import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationBell from './NotificationBell'
import type { NotificationListPage, Notification } from '../api/notifications'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Mock auth store — user present by default
vi.mock('../stores/auth', () => ({
  useAuthStore: vi.fn((selector: (s: { user: { id: number } | null }) => unknown) =>
    selector({ user: { id: 1 } })
  ),
}))

// Mock react-query
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}))

// Mock notifications API
vi.mock('../api/notifications', () => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  deleteNotification: vi.fn(),
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function makeNotif(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    tipo: 'tarea_asignada',
    titulo: 'Nueva tarea',
    cuerpo: null,
    payload: { tarea_id: 42 },
    leida_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function mockData(overrides: Partial<NotificationListPage> = {}) {
  return { data: { items: [], total: 0, unread: 0, ...overrides }, isLoading: false }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore default user mock after clearAllMocks wipes implementations
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: { user: { id: number } }) => unknown) =>
        selector({ user: { id: 1 } }),
    )
    ;(useQuery as ReturnType<typeof vi.fn>).mockReturnValue(mockData())
  })

  it('returns null when user is not logged in', () => {
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (s: (state: { user: null }) => unknown) => s({ user: null }),
    )
    const { container } = render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders bell button', () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /notificaciones/i })).toBeTruthy()
  })

  it('shows no badge when unread count is 0', () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/^\d+$/)).toBeNull()
  })

  it('shows badge with unread count', () => {
    ;(useQuery as ReturnType<typeof vi.fn>).mockReturnValue(mockData({ unread: 3 }))
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    )
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('caps badge at 99+', () => {
    ;(useQuery as ReturnType<typeof vi.fn>).mockReturnValue(mockData({ unread: 150 }))
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    )
    expect(screen.getByText('99+')).toBeTruthy()
  })

  it('shows empty state when no notifications', () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }))
    expect(screen.getByText(/sin notificaciones/i)).toBeTruthy()
  })

  it('renders notification items', () => {
    ;(useQuery as ReturnType<typeof vi.fn>).mockReturnValue(
      mockData({
        items: [makeNotif({ titulo: 'Tarea ABC' }), makeNotif({ id: 2, titulo: 'Aprobación XYZ' })],
        unread: 1,
      }),
    )
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }))
    expect(screen.getByText('Tarea ABC')).toBeTruthy()
    expect(screen.getByText('Aprobación XYZ')).toBeTruthy()
  })

  it('navigates when clicking a tarea_asignada notification', () => {
    ;(useQuery as ReturnType<typeof vi.fn>).mockReturnValue(
      mockData({
        items: [makeNotif({ tipo: 'tarea_asignada', payload: { tarea_id: 42 } })],
        unread: 1,
      }),
    )
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }))
    fireEvent.click(screen.getByText('Nueva tarea'))
    expect(mockNavigate).toHaveBeenCalledWith('/tareas')
  })

  it('navigates to cotizacion when clicking aprobacion_pendiente notification', () => {
    ;(useQuery as ReturnType<typeof vi.fn>).mockReturnValue(
      mockData({
        items: [makeNotif({ tipo: 'aprobacion_pendiente', payload: { cotizacion_id: 7, solicitud_descuento_id: 1 } })],
        unread: 1,
      }),
    )
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }))
    fireEvent.click(screen.getByText('Nueva tarea'))
    expect(mockNavigate).toHaveBeenCalledWith('/cotizaciones/7')
  })

  it('shows mark-all-read button only when there are unread notifications', () => {
    ;(useQuery as ReturnType<typeof vi.fn>).mockReturnValue(
      mockData({ unread: 2, items: [makeNotif()] }),
    )
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }))
    expect(screen.getByText(/marcar todas leídas/i)).toBeTruthy()
  })
})
