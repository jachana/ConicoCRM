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
    {
      id: 3,
      user_id: 7,
      user_name: 'Admin Test 2',
      user_email: 'admin@test.cl',
      action: 'update',
      entity_type: 'SystemConfig',
      entity_id: '9',
      diff_json: { before: { v: 1 }, after: { v: 2 }, changed: ['v'] },
      ip: '127.0.0.1',
      user_agent: 'vitest',
      created_at: '2026-04-24T12:00:00Z',
    },
  ],
  total: 3,
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
    expect(screen.getAllByLabelText('Ver diff')).toHaveLength(3)
    // Las celdas de tabla incluyen los entity_type (también aparecen en el select).
    expect(screen.getAllByText('Cliente').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Empresa').length).toBeGreaterThanOrEqual(1)
  })

  it('links entity_id for navegable entity types and leaves others as plain text', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: MOCK_PAGE })
    render(wrap(<AdminAuditoria />))

    await waitFor(() => expect(screen.getByText('Admin Test')).toBeInTheDocument())

    // Cliente #42 → link a /clientes?detalle=42
    const clienteLink = screen.getByRole('link', { name: '42' })
    expect(clienteLink).toHaveAttribute('href', '/clientes?detalle=42')

    // Empresa #5 → link a /empresas?detalle=5
    const empresaLink = screen.getByRole('link', { name: '5' })
    expect(empresaLink).toHaveAttribute('href', '/empresas?detalle=5')

    // SystemConfig #9 → sin mapeo, texto plano (no link)
    expect(screen.queryByRole('link', { name: '9' })).not.toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('opens diff modal with JSON when Ver diff clicked', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: MOCK_PAGE })
    render(wrap(<AdminAuditoria />))

    await waitFor(() => expect(screen.getAllByLabelText('Ver diff')).toHaveLength(3))
    fireEvent.click(screen.getAllByLabelText('Ver diff')[0])

    await waitFor(() =>
      expect(screen.getByText(/"changed"/)).toBeInTheDocument(),
    )
    expect(screen.getByText(/Diff · Cliente #42 · update/)).toBeInTheDocument()
  })

  it('shows total count', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: MOCK_PAGE })
    render(wrap(<AdminAuditoria />))

    await waitFor(() => expect(screen.getByText(/3 registros/)).toBeInTheDocument())
  })
})
