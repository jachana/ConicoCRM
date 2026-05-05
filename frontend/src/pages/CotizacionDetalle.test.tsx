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
vi.mock('../components/AlertNotesModal', () => ({ default: () => null, __esModule: true }))
vi.mock('../components/CreditWarningModal', () => ({ default: () => null, __esModule: true }))
vi.mock('../components/UnsavedChangesModal', () => ({ default: () => null, __esModule: true }))
vi.mock('../components/ClienteSelectModal', () => ({ default: () => null, __esModule: true }))
vi.mock('../components/TareasRelacionadas', () => ({ default: () => null, __esModule: true }))
vi.mock('../components/AlertasTab', () => ({ default: () => null, __esModule: true }))

const MOCK_COT = {
  id: 5, numero: 3, estado: 'activa', empresa_id: 1, cliente_id: null,
  vendedor_id: 1, nv_id: null, fecha_emision: '2026-05-05',
  fecha_vencimiento: null, nota: '', metodo_pago: null, plazo_dias: 0,
  total_neto: '10000', total_iva: '1900', total: '11900',
  created_at: '2026-05-05T10:00:00Z', updated_at: '2026-05-05T10:00:00Z',
  cliente: null, vendedor: { id: 1, name: 'Admin' },
  lineas: [], alertas: [],
}

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url.includes('/api/cotizaciones/')) return Promise.resolve({ data: MOCK_COT })
      if (url.includes('/api/clientes')) return Promise.resolve({ data: [] })
      if (url.includes('/api/users')) return Promise.resolve({ data: [] })
      if (url.includes('/credito')) return Promise.resolve({ data: { credito_disponible: 999999 } })
      if (url.includes('/api/empresas')) return Promise.resolve({ data: [] })
      if (url.includes('/api/tareas')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useModuloEnabled } from '../hooks/useModulos'
import CotizacionDetalle from './CotizacionDetalle'

const mockUseModuloEnabled = useModuloEnabled as ReturnType<typeof vi.fn>

function renderPage(id = 5) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/cotizaciones/${id}`]}>
        <Routes>
          <Route path="/cotizaciones/:id" element={<CotizacionDetalle />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockUseModuloEnabled.mockReturnValue(true)
})

describe('CotizacionDetalle module gating', () => {
  it('shows Crear NV button when notas_venta module is on', async () => {
    mockUseModuloEnabled.mockReturnValue(true)
    renderPage()
    await waitFor(() => expect(screen.getByText(/COT-00003/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /crear nv/i })).toBeInTheDocument()
  })

  it('hides Crear NV button when notas_venta module is off', async () => {
    mockUseModuloEnabled.mockReturnValue(false)
    renderPage()
    await waitFor(() => expect(screen.getByText(/COT-00003/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /crear nv/i })).not.toBeInTheDocument()
  })
})
