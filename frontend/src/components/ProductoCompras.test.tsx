import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProductoCompras from './ProductoCompras'

const getMock = vi.fn()

vi.mock('../lib/api', () => ({
  api: { get: (...args: unknown[]) => getMock(...args) },
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProductoCompras', () => {
  it('shows empty state when no compras', async () => {
    getMock.mockResolvedValueOnce({
      data: { items: [], total: 0, total_cantidad: 0, total_monto: '0' },
    })

    wrap(<ProductoCompras productoId={1} />)

    await waitFor(() => {
      expect(screen.getByText(/Sin compras registradas/i)).toBeInTheDocument()
    })
  })

  it('renders rows with OC link, proveedor, estado badge and totals', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            fecha: '2026-05-01',
            oc_id: 10,
            oc_numero: 12,
            proveedor_id: 3,
            proveedor_nombre: 'Prov X',
            estado: 'recibida_completa',
            cantidad: 5,
            cantidad_recibida: 5,
            precio_unitario: '800',
            total: '4000',
          },
          {
            fecha: '2026-04-20',
            oc_id: 11,
            oc_numero: 13,
            proveedor_id: 4,
            proveedor_nombre: 'Prov Y',
            estado: 'recibida_parcial',
            cantidad: 10,
            cantidad_recibida: 4,
            precio_unitario: '700',
            total: '7000',
          },
        ],
        total: 2,
        total_cantidad: 15,
        total_monto: '11000',
      },
    })

    wrap(<ProductoCompras productoId={42} />)

    await waitFor(() => {
      expect(screen.getByText('OC-0012')).toBeInTheDocument()
    })
    expect(screen.getByText('OC-0012').closest('a')).toHaveAttribute('href', '/ordenes-compra/10')
    expect(screen.getByText('Prov X')).toBeInTheDocument()
    expect(screen.getByText('Prov Y')).toBeInTheDocument()
    expect(screen.getByText('Recibida completa')).toBeInTheDocument()
    expect(screen.getByText('Recibida parcial')).toBeInTheDocument()
    expect(screen.getByText(/\(4 rec\.\)/)).toBeInTheDocument()
    expect(screen.getByText(/2 compras/)).toBeInTheDocument()
    expect(screen.getByText(/\$11,000|\$11.000/)).toBeInTheDocument()
  })
})
