import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    </QueryClientProvider>
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

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue({ data: [] })
})

describe('Facturas', () => {
  it('renders facturas table with data', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [sampleFactura] })
    wrap(<Facturas />)
    expect(await screen.findByText('FAC-00001')).toBeTruthy()
    expect(await screen.findByText('Cliente Test')).toBeTruthy()
  })

  it('shows estado badge emitida', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [sampleFactura] })
    wrap(<Facturas />)
    expect(await screen.findByText('emitida')).toBeTruthy()
  })

  it('shows nueva factura button', async () => {
    wrap(<Facturas />)
    expect(await screen.findByText(/nueva factura/i)).toBeTruthy()
  })

  it('shows empty message when no facturas', async () => {
    wrap(<Facturas />)
    expect(await screen.findByText(/no hay facturas registradas/i)).toBeTruthy()
  })
})
