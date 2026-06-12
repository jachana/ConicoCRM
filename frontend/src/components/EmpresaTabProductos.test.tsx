import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EmpresaTabProductos from './EmpresaTabProductos'
import type { EmpresaProductoLine } from '../types'

const LINEAS_FIXTURE: EmpresaProductoLine[] = [
  {
    fecha: '2026-05-10',
    factura_id: 9,
    factura_numero: 4,
    sku: 'SKU-001',
    descripcion: 'Producto demo',
    cantidad: 2,
    precio_unit: 1000,
    total_neto: 2000,
  },
]

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation(() => Promise.resolve({ data: LINEAS_FIXTURE })),
  },
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EmpresaTabProductos', () => {
  it('renders factura numero as a link to /facturas/<factura_id>', async () => {
    wrap(<EmpresaTabProductos empresaId={1} empresaNombre="Constructora Solar" />)

    const link = await screen.findByRole('link', { name: 'FAC-0004' })
    expect(link.getAttribute('href')).toBe('/facturas/9')
  })
})
