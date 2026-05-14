import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProductoHistorialVentas from './ProductoHistorialVentas'

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

describe('ProductoHistorialVentas', () => {
  it('shows empty state when no ventas', async () => {
    getMock.mockResolvedValueOnce({
      data: { items: [], total: 0, total_cantidad: '0', total_monto: '0' },
    })

    wrap(<ProductoHistorialVentas productoId={1} />)

    await waitFor(() => {
      expect(screen.getByText(/Sin ventas registradas/i)).toBeInTheDocument()
    })
  })

  it('renders rows with doc badge, cliente/empresa, and totals', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            fecha: '2026-05-01',
            doc_tipo: 'NV',
            doc_id: 10,
            doc_numero: 1001,
            cliente_id: 5,
            cliente_nombre: 'Cli X',
            empresa_id: null,
            empresa_nombre: null,
            cantidad: '3',
            precio_unitario: '500',
            total: '1500',
          },
          {
            fecha: '2026-04-30',
            doc_tipo: 'Factura',
            doc_id: 22,
            doc_numero: 7,
            cliente_id: null,
            cliente_nombre: null,
            empresa_id: 9,
            empresa_nombre: 'Emp Y',
            cantidad: '2',
            precio_unitario: '1000',
            total: '2000',
          },
        ],
        total: 2,
        total_cantidad: '5',
        total_monto: '3500',
      },
    })

    wrap(<ProductoHistorialVentas productoId={42} />)

    await waitFor(() => {
      expect(screen.getByText(/NV #1001/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Factura #7/)).toBeInTheDocument()
    expect(screen.getByText('Cli X')).toBeInTheDocument()
    expect(screen.getByText('Emp Y')).toBeInTheDocument()
    expect(screen.getByText(/2 ventas/)).toBeInTheDocument()
    expect(screen.getByText(/\$3,500|\$3.500/)).toBeInTheDocument()
  })
})
