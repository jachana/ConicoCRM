import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../hooks/useModulos', () => ({
  useModuloEnabled: vi.fn().mockReturnValue(true),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: (s: any) => any) =>
    fn ? fn({ user: { id: 1, role: 'admin' } }) : { user: { id: 1, role: 'admin' } },
}))

vi.mock('../hooks/useEffectivePermissions', () => ({
  useEffectivePermissions: () => ({ role: 'admin' }),
}))

vi.mock('../lib/pdf', () => ({ openPdf: vi.fn() }))
vi.mock('../components/CreditWarningModal', () => ({ default: () => null, __esModule: true }))
vi.mock('../components/UnsavedChangesModal', () => ({ default: () => null, __esModule: true }))
vi.mock('../components/TareasRelacionadas', () => ({ default: () => null, __esModule: true }))
vi.mock('../components/NotaVentaAdjuntos', () => ({ default: () => null, __esModule: true }))

const MOCK_NV = {
  id: 1, numero: 42, estado: 'activa', empresa_id: 1, cliente_id: null,
  vendedor_id: 1, factura_id: null, guia_despacho_id: null,
  fecha: '2026-05-05', nota: '', retiro_en_conico: false,
  sede_despacho_id: null, metodo_pago: null, plazo_dias: 0,
  numero_oc_cliente: '', contacto: '', correo: '',
  total_neto: '10000', total_iva: '1900', total: '11900',
  created_at: '2026-05-05T10:00:00Z', updated_at: '2026-05-05T10:00:00Z',
  cliente: null, vendedor: { id: 1, name: 'Admin' },
  lineas: [], adjuntos: [],
}

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url.includes('/api/nota_ventas/')) return Promise.resolve({ data: MOCK_NV })
      if (url.includes('/api/clientes')) return Promise.resolve({ data: [] })
      if (url.includes('/api/users')) return Promise.resolve({ data: [] })
      if (url.includes('/api/empresas')) return Promise.resolve({ data: [] })
      if (url.includes('/api/sedes')) return Promise.resolve({ data: [] })
      if (url.includes('/api/tareas')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useModuloEnabled } from '../hooks/useModulos'
import NotaVentaDetalle from './NotaVentaDetalle'

const mockUseModuloEnabled = useModuloEnabled as ReturnType<typeof vi.fn>

function renderPage(id = 1) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/notas-venta/${id}`]}>
        <Routes>
          <Route path="/notas-venta/:id" element={<NotaVentaDetalle />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockUseModuloEnabled.mockReturnValue(true)
})

describe('NotaVentaDetalle module gating', () => {
  it('shows Generar Factura when facturas module is on and no factura linked', async () => {
    mockUseModuloEnabled.mockImplementation((slug: string) => slug === 'facturas')
    renderPage()
    await waitFor(() => expect(screen.getByText(/NV-00042/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /generar factura/i })).toBeInTheDocument()
  })

  it('hides Generar Factura when facturas module is off', async () => {
    mockUseModuloEnabled.mockReturnValue(false)
    renderPage()
    await waitFor(() => expect(screen.getByText(/NV-00042/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /generar factura/i })).not.toBeInTheDocument()
  })

  it('shows Generar guía when guias_despacho module is on', async () => {
    mockUseModuloEnabled.mockImplementation((slug: string) => slug === 'guias_despacho')
    renderPage()
    await waitFor(() => expect(screen.getByText(/NV-00042/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /generar guía/i })).toBeInTheDocument()
  })

  it('hides Generar guía when guias_despacho module is off', async () => {
    mockUseModuloEnabled.mockReturnValue(false)
    renderPage()
    await waitFor(() => expect(screen.getByText(/NV-00042/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /generar guía/i })).not.toBeInTheDocument()
  })
})
