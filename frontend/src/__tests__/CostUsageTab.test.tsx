import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import CostUsageTab from '../components/config/CostUsageTab'
import * as apiLib from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }))

const MOCK_DATA = {
  period: '30d',
  empresas: [
    {
      empresa_id: 2,
      request_count: 500,
      lioren_call_count: 20,
      lioren_cost_clp: 8000,
      dte_emitidos_count: 10,
      slow_request_count: 2,
    },
    {
      empresa_id: 1,
      request_count: 1000,
      lioren_call_count: 50,
      lioren_cost_clp: 15000,
      dte_emitidos_count: 25,
      slow_request_count: 0,
    },
  ],
  total: {
    empresa_id: null,
    request_count: 1500,
    lioren_call_count: 70,
    lioren_cost_clp: 23000,
    dte_emitidos_count: 35,
    slow_request_count: 2,
  },
}

function wrap(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiLib.api.get).mockResolvedValue({ data: MOCK_DATA })
})

describe('CostUsageTab', () => {
  it('renders summary tiles with totals', async () => {
    render(wrap(<CostUsageTab />))
    await screen.findByText(/Costo total Lioren/i)
    expect(screen.getByText(/23\.000/)).toBeTruthy()
    expect(screen.getByText(/1\.500/)).toBeTruthy()
    expect(screen.getByText(/Empresas activas/i)).toBeTruthy()
  })

  it('sorts empresas by lioren_cost_clp descending', async () => {
    render(wrap(<CostUsageTab />))
    await screen.findByText(/Costo total Lioren/i)
    const rows = screen.getAllByRole('row').slice(1)
    const firstId = rows[0].querySelectorAll('td')[0].textContent?.trim()
    const secondId = rows[1].querySelectorAll('td')[0].textContent?.trim()
    expect(firstId).toBe('1')
    expect(secondId).toBe('2')
  })

  it('shows empty state when no data', async () => {
    vi.mocked(apiLib.api.get).mockResolvedValue({ data: { period: '30d', empresas: [], total: { empresa_id: null, request_count: 0, lioren_call_count: 0, lioren_cost_clp: 0, dte_emitidos_count: 0, slow_request_count: 0 } } })
    render(wrap(<CostUsageTab />))
    await screen.findByText(/Sin datos/i)
  })

  it('passes period param to API', async () => {
    render(wrap(<CostUsageTab />))
    await screen.findByText(/Costo total Lioren/i)
    expect(vi.mocked(apiLib.api.get)).toHaveBeenCalledWith(
      '/api/admin/telemetry/cost',
      expect.objectContaining({ params: { period: '30d' } }),
    )
  })
})
