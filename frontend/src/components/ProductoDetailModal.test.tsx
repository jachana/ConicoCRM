import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProductoDetailModal from './ProductoDetailModal'
import type { Producto } from '../types'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }) },
}))

const authState = vi.hoisted(() => ({ role: 'admin' }))
vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: (s: { user: { role: string } }) => unknown) =>
    fn ? fn({ user: { role: authState.role } }) : { user: { role: authState.role } },
}))

const producto: Producto = {
  id: 1,
  nombre: 'Producto Test',
  descripcion: null,
  sku: 'SKU-1',
  formato: null,
  precio_venta: 1000,
  precio_con_iva: 1190,
  precio_costo: 500,
  costo_con_iva: 595,
  stock_minimo: 1,
  stock_actual: 10,
  proveedor_id: null,
  marca_id: null,
  marca: null,
  volumen: null,
  tags: [],
  specs: [],
  tipos: [],
  created_at: '2026-01-01',
}

const productoConMarca: Producto = {
  ...producto,
  id: 2,
  marca_id: 3,
  marca: { id: 3, nombre: 'Marca Tres' },
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

function ReportesProbe() {
  const loc = useLocation()
  return <div data-testid="reportes-probe">{loc.pathname + loc.search}</div>
}

function wrapWithRoutes(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/productos']}>
        <Routes>
          <Route path="/productos" element={ui} />
          <Route path="/reportes" element={<ReportesProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProductoDetailModal', () => {
  beforeEach(() => {
    authState.role = 'admin'
  })

  it('shows Compras and Costos tabs when showCosto=true', () => {
    wrap(<ProductoDetailModal producto={producto} onClose={() => {}} showCosto />)

    expect(screen.getByRole('tab', { name: 'Compras' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Costos' })).toBeInTheDocument()
  })

  it('hides Compras and Costos tabs when showCosto=false', () => {
    wrap(<ProductoDetailModal producto={producto} onClose={() => {}} showCosto={false} />)

    expect(screen.queryByRole('tab', { name: 'Compras' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Costos' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Datos' })).toBeInTheDocument()
  })

  it('shows "Ver reportes de la marca" for admin when producto has marca', () => {
    wrap(<ProductoDetailModal producto={productoConMarca} onClose={() => {}} />)

    expect(screen.getByRole('button', { name: /ver reportes de la marca/i })).toBeInTheDocument()
  })

  it('hides "Ver reportes de la marca" when producto has no marca', () => {
    wrap(<ProductoDetailModal producto={producto} onClose={() => {}} />)

    expect(screen.queryByRole('button', { name: /ver reportes de la marca/i })).not.toBeInTheDocument()
  })

  it('hides "Ver reportes de la marca" for vendedor role', () => {
    authState.role = 'vendedor'
    wrap(<ProductoDetailModal producto={productoConMarca} onClose={() => {}} />)

    expect(screen.queryByRole('button', { name: /ver reportes de la marca/i })).not.toBeInTheDocument()
  })

  it('click "Ver reportes de la marca" closes modal and navigates with marca_id query param', () => {
    const onClose = vi.fn()
    wrapWithRoutes(<ProductoDetailModal producto={productoConMarca} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /ver reportes de la marca/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('reportes-probe').textContent).toBe(
      '/reportes?tab=por_marca&marca_id=3',
    )
  })
})
