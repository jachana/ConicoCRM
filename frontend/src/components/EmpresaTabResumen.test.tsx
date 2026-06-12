import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EmpresaTabResumen from './EmpresaTabResumen'
import type { EmpresaListItem } from '../types'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

const authState = vi.hoisted(() => ({ role: 'admin' }))
vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: (s: { user: { role: string } }) => unknown) =>
    fn ? fn({ user: { role: authState.role } }) : { user: { role: authState.role } },
}))

const EMPRESA_FIXTURE: EmpresaListItem = {
  id: 7,
  nombre: 'Constructora Solar',
  razon_social: 'Constructora Solar SpA',
  rut: '76.123.456-7',
  linea_credito: 1000000,
  plazo_credito: '30 días',
  sector: 'Construcción',
  email: 'contacto@solar.cl',
  nota_cobranza: null,
  ubicacion: 'Santiago',
  created_at: '2026-01-01T00:00:00Z',
  has_logo: false,
  ruts_adicionales: [],
  vendedor_id: null,
  vendedor: null,
  ultima_compra: '2026-05-01',
}

function ReportesProbe() {
  const loc = useLocation()
  return <div data-testid="reportes-probe">{loc.pathname + loc.search}</div>
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/empresas']}>
        <Routes>
          <Route path="/empresas" element={ui} />
          <Route path="/reportes" element={<ReportesProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EmpresaTabResumen — Ver en reportes', () => {
  beforeEach(() => {
    authState.role = 'admin'
  })

  it('shows "Ver en reportes" button for admin', () => {
    wrap(<EmpresaTabResumen empresa={EMPRESA_FIXTURE} />)

    expect(screen.getByRole('button', { name: /ver en reportes/i })).toBeInTheDocument()
  })

  it('hides "Ver en reportes" button for vendedor role', () => {
    authState.role = 'vendedor'
    wrap(<EmpresaTabResumen empresa={EMPRESA_FIXTURE} />)

    expect(screen.queryByRole('button', { name: /ver en reportes/i })).not.toBeInTheDocument()
  })

  it('click "Ver en reportes" calls onClose and navigates with empresa_id query param', () => {
    const onClose = vi.fn()
    wrap(<EmpresaTabResumen empresa={EMPRESA_FIXTURE} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /ver en reportes/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('reportes-probe').textContent).toBe(
      '/reportes?tab=ventas&empresa_id=7',
    )
  })
})
