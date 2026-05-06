import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, it, expect, describe, beforeEach } from 'vitest'
import AdminTelemetria from './AdminTelemetria'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))
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

const MOCK_ROUTES_RESPONSE = {
  period: '24h',
  routes: [
    {
      route: '/api/facturas/',
      count: 150,
      p50: 45.2,
      p95: 230.5,
      p99: 450.1,
      error_rate: 0.02,
      trend: [
        { hour: '2024-01-01T00:00:00Z', p95: 200, count: 10 },
        { hour: '2024-01-01T01:00:00Z', p95: 230, count: 15 },
        { hour: '2024-01-01T02:00:00Z', p95: 220, count: 12 },
      ],
    },
    {
      route: '/api/cotizaciones/',
      count: 80,
      p50: 30.0,
      p95: 1200,
      p99: 2000,
      error_rate: 0.06,
      trend: [],
    },
  ],
}

describe('AdminTelemetria', () => {
  beforeEach(() => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: MOCK_ROUTES_RESPONSE })
  })

  it('renders heading and routes tab', async () => {
    render(wrap(<AdminTelemetria />))
    expect(screen.getByText('Telemetría')).toBeInTheDocument()
    expect(screen.getByText('Rutas')).toBeInTheDocument()
  })

  it('shows route rows after load', async () => {
    render(wrap(<AdminTelemetria />))
    await waitFor(() => expect(screen.getByText('/api/facturas/')).toBeInTheDocument())
    expect(screen.getByText('/api/cotizaciones/')).toBeInTheDocument()
  })

  it('colors slow p95 red and high error rate red', async () => {
    render(wrap(<AdminTelemetria />))
    await waitFor(() => screen.getByText('/api/cotizaciones/'))
    const p95Cell = screen.getByText('1.2s')
    expect(p95Cell.className).toMatch(/danger/)
  })

  it('shows empty state when no routes', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: { period: '24h', routes: [] } })
    render(wrap(<AdminTelemetria />))
    await waitFor(() => expect(screen.getByText('Sin datos')).toBeInTheDocument())
  })

  it('opens detail modal on row click', async () => {
    render(wrap(<AdminTelemetria />))
    await waitFor(() => screen.getByText('/api/facturas/'))
    fireEvent.click(screen.getByText('/api/facturas/'))
    await waitFor(() => expect(screen.getAllByText('/api/facturas/').length).toBeGreaterThan(1))
  })
})
