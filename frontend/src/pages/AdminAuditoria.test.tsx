import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, it, expect, describe, beforeEach } from 'vitest'
import AdminAuditoria from './AdminAuditoria'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }))
vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: any) =>
    fn
      ? fn({ accessToken: 'test-token', user: { role: 'admin' } })
      : { accessToken: 'test-token', user: { role: 'admin' } },
}))

function wrap(ui: React.ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const MOCK_PAGE = {
  items: [
    {
      id: 1,
      user_id: 7,
      user_name: 'Admin Test',
      user_email: 'admin@test.cl',
      action: 'update',
      entity_type: 'Cliente',
      entity_id: '42',
      diff_json: { before: { nombre: 'A' }, after: { nombre: 'B' }, changed: ['nombre'] },
      ip: '127.0.0.1',
      user_agent: 'vitest',
      created_at: '2026-04-24T10:00:00Z',
    },
    {
      id: 2,
      user_id: null,
      user_name: null,
      user_email: null,
      action: 'create',
      entity_type: 'Empresa',
      entity_id: '5',
      diff_json: { after: { nombre: 'Empresa Sis' } },
      ip: null,
      user_agent: null,
      created_at: '2026-04-24T11:00:00Z',
    },
  ],
  total: 2,
  limit: 50,
  offset: 0,
}

describe('AdminAuditoria', () => {
  beforeEach(() => {
    vi.mocked(apiModule.api.get).mockReset()
  })

  it('renders rows with entity type, action, and Ver diff button', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: MOCK_PAGE })
    render(wrap(<AdminAuditoria />))

    // 'Admin Test' es único; 'Sistema' aparece solo cuando user_id es null.
    await waitFor(() => expect(screen.getByText('Admin Test')).toBeInTheDocument())
    expect(screen.getByText('Sistema')).toBeInTheDocument()
    expect(screen.getAllByText('Ver diff')).toHaveLength(2)
    // Las celdas de tabla incluyen los entity_type (también aparecen en el select).
    expect(screen.getAllByText('Cliente').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Empresa').length).toBeGreaterThanOrEqual(1)
  })

  it('opens diff modal with JSON when Ver diff clicked', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: MOCK_PAGE })
    render(wrap(<AdminAuditoria />))

    await waitFor(() => expect(screen.getAllByText('Ver diff')).toHaveLength(2))
    fireEvent.click(screen.getAllByText('Ver diff')[0])

    await waitFor(() =>
      expect(screen.getByText(/"changed"/)).toBeInTheDocument(),
    )
    expect(screen.getByText(/Diff · Cliente #42 · update/)).toBeInTheDocument()
  })

  it('shows total count', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: MOCK_PAGE })
    render(wrap(<AdminAuditoria />))

    await waitFor(() => expect(screen.getByText(/2 registros/)).toBeInTheDocument())
  })
})
