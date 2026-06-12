import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, it, expect, describe, beforeEach } from 'vitest'
import Aprobaciones from './Aprobaciones'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }))
vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: any) =>
    fn ? fn({ user: { id: 1, role: 'admin' } }) : { user: { id: 1, role: 'admin' } },
}))
vi.mock('../hooks/useEffectivePermissions', () => ({
  useEffectivePermissions: () => ({ role: 'admin' }),
}))

function wrap(ui: React.ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const CREDITO = {
  id: 10,
  vendedor: { id: 3, name: 'Vende Dor', email: 'v@test.cl' },
  empresa: { id: 7, nombre: 'Empresa Test SpA' },
  total: 119000,
  nota: null,
  estado: 'pendiente',
  cotizacion_id: null,
  nv_id: null,
  created_at: '2026-06-01T10:00:00Z',
}

const MARGEN = {
  id: 20,
  vendedor: { id: 3, name: 'Vende Dor', email: 'v@test.cl' },
  cotizacion_id: 42,
  nota: 'bajar margen',
  estado: 'pendiente',
  lineas_propuestas: [],
  created_at: '2026-06-02T10:00:00Z',
}

const TERMINO = {
  id: 55,
  numero: 123,
  terminos_pago: '30 días',
  empresa: { id: 8, nombre: 'Otra Empresa Ltda' },
  vendedor: { id: 3, name: 'Vende Dor', email: 'v@test.cl' },
}

describe('Aprobaciones', () => {
  beforeEach(() => {
    vi.mocked(apiModule.api.get).mockReset()
    vi.mocked(apiModule.api.get).mockImplementation((url: string) => {
      if (url.startsWith('/api/aprobaciones/')) return Promise.resolve({ data: [CREDITO] })
      if (url.startsWith('/api/aprobaciones_margen/')) return Promise.resolve({ data: [MARGEN] })
      if (url.startsWith('/api/solicitudes-descuento/')) return Promise.resolve({ data: [] })
      if (url.startsWith('/api/cotizaciones/')) return Promise.resolve({ data: [TERMINO] })
      return Promise.resolve({ data: [] })
    })
  })

  it('renderiza la cotización de margen como link navegable', async () => {
    render(wrap(<Aprobaciones />))

    await waitFor(() => expect(screen.getByText('COT-00042')).toBeInTheDocument())
    const link = screen.getByText('COT-00042').closest('a')
    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('href', '/cotizaciones/42')
  })

  it('renderiza la empresa de crédito como link navegable', async () => {
    render(wrap(<Aprobaciones />))

    await waitFor(() => expect(screen.getByText('Empresa Test SpA')).toBeInTheDocument())
    const link = screen.getByText('Empresa Test SpA').closest('a')
    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('href', '/empresas?detalle=7')
  })

  it('renderiza términos pendientes con link a la cotización', async () => {
    render(wrap(<Aprobaciones />))

    await waitFor(() => expect(screen.getByText('COT-00123')).toBeInTheDocument())
    const link = screen.getByText('COT-00123').closest('a')
    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('href', '/cotizaciones/55')
  })
})
