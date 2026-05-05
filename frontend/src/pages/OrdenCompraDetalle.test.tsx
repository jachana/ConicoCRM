import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../hooks/useModulos', () => ({
  useModuloEnabled: vi.fn().mockReturnValue(true),
}))

vi.mock('../lib/pdf', () => ({ openPdf: vi.fn() }))

const MOCK_OC = {
  id: 1, numero: 10, estado: 'enviada', proveedor_id: 1, empresa_id: 1,
  fecha: '2026-05-05', fecha_entrega: null, nota: '',
  total_neto: '50000', total_iva: '9500', total: '59500',
  created_at: '2026-05-05T10:00:00Z', updated_at: '2026-05-05T10:00:00Z',
  proveedor: { id: 1, nombre: 'Proveedor X', rut: '99999999-9' },
  lineas: [
    { id: 1, orden: 0, producto_id: null, descripcion: 'Item A',
      cantidad: '10', precio_unitario: '5000', descuento_pct: '0',
      total_neto: '50000', iva: '9500', total_linea: '59500',
      cantidad_recibida: '0' },
  ],
}

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url.includes('/api/ordenes-compra/')) return Promise.resolve({ data: MOCK_OC })
      if (url.includes('/api/proveedores')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useModuloEnabled } from '../hooks/useModulos'
import OrdenCompraDetalle from './OrdenCompraDetalle'

const mockUseModuloEnabled = useModuloEnabled as ReturnType<typeof vi.fn>

function renderPage(id = 1) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/ordenes-compra/${id}`]}>
        <Routes>
          <Route path="/ordenes-compra/:id" element={<OrdenCompraDetalle />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockUseModuloEnabled.mockReturnValue(true)
})

describe('OrdenCompraDetalle module gating', () => {
  it('shows Recepcionar mercadería when inventario module is on and orden is enviada', async () => {
    mockUseModuloEnabled.mockReturnValue(true)
    renderPage()
    await waitFor(() => expect(screen.getByText(/OC-00010/i)).toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: /recepcionar mercader/i }).length).toBeGreaterThan(0)
  })

  it('hides Recepcionar mercadería when inventario module is off', async () => {
    mockUseModuloEnabled.mockReturnValue(false)
    renderPage()
    await waitFor(() => expect(screen.getByText(/OC-00010/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /recepcionar mercader/i })).not.toBeInTheDocument()
  })
})
