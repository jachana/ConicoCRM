import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProductoDetailModal from './ProductoDetailModal'
import type { Producto } from '../types'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }) },
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

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProductoDetailModal', () => {
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
})
