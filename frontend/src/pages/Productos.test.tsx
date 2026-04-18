import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Productos from './Productos'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: any) => fn ? fn({ user: { role: 'admin' } }) : { user: { role: 'admin' } },
}))

function wrap(ui: React.ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Routes><Route path="/" element={ui} /></Routes></MemoryRouter>
    </QueryClientProvider>
  )
}

it('muestra lista de productos', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({
    data: [{ id: 1, nombre: 'Tornillo M6', descripcion: null, precio_costo: 50, precio_venta: 120, stock_minimo: 10, stock_actual: 50, proveedor_id: null, created_at: '' }],
  })
  render(wrap(<Productos />))
  await waitFor(() => expect(screen.getByText('Tornillo M6')).toBeInTheDocument())
  expect(screen.getByText('$120')).toBeInTheDocument()
})

it('muestra botón Agregar producto', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({ data: [] })
  render(wrap(<Productos />))
  await waitFor(() => expect(screen.getByText('Agregar producto')).toBeInTheDocument())
})
