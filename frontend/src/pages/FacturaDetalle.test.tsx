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

vi.mock('../lib/pdf', () => ({ openPdf: vi.fn() }))
vi.mock('../components/DteBadge', () => ({ default: () => null, __esModule: true }))
vi.mock('../components/TareasRelacionadas', () => ({ default: () => null, __esModule: true }))
vi.mock('../components/FacturaAdjuntos', () => ({ default: () => null, __esModule: true }))

const MOCK_FACTURA = {
  id: 1, numero: 7, estado: 'emitida', empresa_id: 1, cliente_id: 1,
  vendedor_id: 1, nota_venta_id: null,
  fecha: '2026-05-05', nota: '', retiro_en_conico: false,
  metodo_pago: null, plazo_dias: 0,
  total_neto: '10000', total_iva: '1900', total: '11900', monto_pagado: '0',
  dte_estado: 'aceptada', folio_sii: 100, track_id: null, email_enviado_at: null,
  is_locked: false,
  created_at: '2026-05-05T10:00:00Z', updated_at: '2026-05-05T10:00:00Z',
  cliente: { id: 1, nombre: 'ACME SpA', rut: '11111111-1' },
  vendedor: { id: 1, name: 'Admin' },
  lineas: [],
  tipo_dte: '33',
}

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url.includes('/api/facturas/')) return Promise.resolve({ data: MOCK_FACTURA })
      if (url.includes('/api/pagos/')) return Promise.resolve({ data: [] })
      if (url.includes('/api/clientes')) return Promise.resolve({ data: [] })
      if (url.includes('/api/users')) return Promise.resolve({ data: [] })
      if (url.includes('/api/empresas')) return Promise.resolve({ data: [] })
      if (url.includes('/api/bancos')) return Promise.resolve({ data: [] })
      if (url.includes('/api/tareas')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useModuloEnabled } from '../hooks/useModulos'
import FacturaDetalle from './FacturaDetalle'

const mockUseModuloEnabled = useModuloEnabled as ReturnType<typeof vi.fn>

function renderPage(id = 1) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/facturas/${id}`]}>
        <Routes>
          <Route path="/facturas/:id" element={<FacturaDetalle />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockUseModuloEnabled.mockReturnValue(true)
})

describe('FacturaDetalle module gating', () => {
  it('shows Registrar abono when pagos module is on and factura not pagada', async () => {
    mockUseModuloEnabled.mockReturnValue(true)
    renderPage()
    await waitFor(() => expect(screen.getByText(/ACME SpA/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /registrar abono/i })).toBeInTheDocument()
  })

  it('hides Registrar abono when pagos module is off', async () => {
    mockUseModuloEnabled.mockReturnValue(false)
    renderPage()
    await waitFor(() => expect(screen.getByText(/ACME SpA/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /registrar abono/i })).not.toBeInTheDocument()
  })
})
