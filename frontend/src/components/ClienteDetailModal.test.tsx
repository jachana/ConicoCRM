import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ClienteDetailModal from './ClienteDetailModal'
import type { Cliente } from '../types'

// Mock timeline API so Timeline renders without network
vi.mock('../api/timeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/timeline')>()
  return {
    ...actual,
    getClienteTimeline: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 }),
    getEmpresaTimeline: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 }),
  }
})

// Mock api client so ClienteTabFacturas renders without network
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

const authState = vi.hoisted(() => ({ role: 'admin' }))
vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: (s: { user: { role: string } }) => unknown) =>
    fn ? fn({ user: { role: authState.role } }) : { user: { role: authState.role } },
}))

const CLIENTE_FIXTURE: Cliente = {
  id: 42,
  nombre: 'Pedro Soto',
  rut: '12.345.678-9',
  email: 'pedro@ejemplo.cl',
  telefono: '+56 9 9999 9999',
  direccion_despacho: 'Av. Siempreviva 123',
  notas: 'Cliente VIP',
  empresa_id: 1,
  empresa: { id: 1, nombre: 'Constructora Solar', razon_social: null, rut: null },
  recibe_correo: true,
  despacho_o_retiro: 'despacho',
  comuna: 'Santiago',
  ultimo_contacto: '2026-04-01',
  forma_captacion: 'referido',
  compromiso: 'Entrega mensual',
  es_nuevo: false,
  vendedor_id: null,
  vendedor: null,
  created_at: '2026-01-01T00:00:00Z',
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
      <MemoryRouter initialEntries={['/clientes']}>
        <Routes>
          <Route path="/clientes" element={ui} />
          <Route path="/reportes" element={<ReportesProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ClienteDetailModal', () => {
  const onClose = vi.fn()
  const onEdit = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    onEdit.mockClear()
    authState.role = 'admin'
  })

  it('1. renders cliente nombre and Datos tab fields', () => {
    wrap(
      <ClienteDetailModal cliente={CLIENTE_FIXTURE} onClose={onClose} onEdit={onEdit} />,
    )

    // Title (appears in both ModalTitle and Nombre field — use getAllBy)
    expect(screen.getAllByText('Pedro Soto').length).toBeGreaterThan(0)

    // Subtitle row (rut · empresa · email)
    expect(screen.getAllByText(/12\.345\.678-9/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Constructora Solar/).length).toBeGreaterThan(0)

    // Datos fields
    expect(screen.getByText('Santiago')).toBeTruthy()
    expect(screen.getAllByText('pedro@ejemplo.cl').length).toBeGreaterThan(0)
    expect(screen.getByText('Cliente VIP')).toBeTruthy()
  })

  it('2. click "Timeline" tab shows Timeline empty state', async () => {
    const user = userEvent.setup()
    wrap(
      <ClienteDetailModal cliente={CLIENTE_FIXTURE} onClose={onClose} onEdit={onEdit} />,
    )

    // Find and click the Timeline tab trigger using userEvent (handles pointer events)
    const timelineTab = screen.getByRole('tab', { name: /timeline/i })
    await user.click(timelineTab)

    await waitFor(() => {
      expect(screen.getByText('Sin actividad registrada')).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('3. click "Facturas" tab shows EmptyState when no facturas', async () => {
    const user = userEvent.setup()
    wrap(
      <ClienteDetailModal cliente={CLIENTE_FIXTURE} onClose={onClose} onEdit={onEdit} />,
    )

    const facturasTab = screen.getByRole('tab', { name: /facturas/i })
    await user.click(facturasTab)

    await waitFor(() => {
      expect(screen.getByText('Sin facturas')).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('4. click "Editar" button calls onEdit with the cliente', () => {
    wrap(
      <ClienteDetailModal cliente={CLIENTE_FIXTURE} onClose={onClose} onEdit={onEdit} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(CLIENTE_FIXTURE)
  })

  it('5. click "Ver en reportes" closes modal and navigates with cliente_id query param', () => {
    wrapWithRoutes(
      <ClienteDetailModal cliente={CLIENTE_FIXTURE} onClose={onClose} onEdit={onEdit} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /ver en reportes/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('reportes-probe').textContent).toBe(
      '/reportes?tab=por_marca&cliente_id=42',
    )
  })

  it('6. hides "Ver en reportes" button for vendedor role', () => {
    authState.role = 'vendedor'
    wrap(
      <ClienteDetailModal cliente={CLIENTE_FIXTURE} onClose={onClose} onEdit={onEdit} />,
    )

    expect(screen.queryByRole('button', { name: /ver en reportes/i })).toBeNull()
    // Editar sigue visible
    expect(screen.getByRole('button', { name: /editar/i })).toBeTruthy()
  })
})
