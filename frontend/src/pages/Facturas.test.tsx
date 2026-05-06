import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Facturas from './Facturas'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

const { api } = await import('../lib/api')

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const sampleFactura = {
  id: 1,
  numero: 1,
  fecha: '2026-04-18',
  fecha_vencimiento: '2026-05-18',
  estado: 'emitida',
  total: 2380,
  total_neto: 2000,
  total_iva: 380,
  cliente_id: 1,
  vendedor_id: null,
  empresa_id: null,
  nv_id: null,
  cotizacion_id: null,
  cliente: { id: 1, nombre: 'Cliente Test', rut: '11.111.111-1' },
  vendedor: null,
  empresa: null,
  nv: null,
  cotizacion: null,
  lineas: [],
}

function mockApiGet(facturas: any[]) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.startsWith('/api/facturas/')) {
      return Promise.resolve({
        data: { data: facturas, pagination: { limit: 50, offset: 0, total: facturas.length } },
      } as any)
    }
    // /api/empresas/, /api/clientes/, /api/productos/ — raw array shape
    return Promise.resolve({ data: [] } as any)
  })
}

beforeEach(() => {
  mockApiGet([])
})

describe('Facturas', () => {
  it('renders page title', async () => {
    wrap(<Facturas />)
    expect(await screen.findByText('Facturas')).toBeTruthy()
  })

  it('renders facturas table with data', async () => {
    mockApiGet([sampleFactura])
    wrap(<Facturas />)
    const matches = await screen.findAllByText('FAC-00001')
    expect(matches.length).toBeGreaterThan(0)
    const clienteMatches = await screen.findAllByText('Cliente Test')
    expect(clienteMatches.length).toBeGreaterThan(0)
  })

  it('shows DTE badge as primary SII signal', async () => {
    mockApiGet([{ ...sampleFactura, dte_estado: 'aceptada' }])
    const { container } = wrap(<Facturas />)
    await waitFor(() => expect(container.textContent).toContain('DTE OK'), { timeout: 3000 })
  })

  it('shows empty message when no facturas', async () => {
    wrap(<Facturas />)
    expect(await screen.findByText('Sin facturas')).toBeTruthy()
  })
})
