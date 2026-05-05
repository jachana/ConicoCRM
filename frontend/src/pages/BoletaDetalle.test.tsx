import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../hooks/useModulos', () => ({
  useModuloEnabled: vi.fn().mockReturnValue(true),
}))

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn().mockResolvedValue({
    id: 1,
    numero: 100,
    fecha: '2026-04-25',
    tipo_dte: '39',
    total: '1190',
    total_neto: '1000',
    total_iva: '190',
    monto_pagado: '1190',
    estado: 'emitida',
    dte_estado: 'aceptada',
    metodo_pago: 'efectivo',
    folio_sii: 5001,
    email_enviado_at: null,
    is_locked: false,
    nombre_receptor: 'Juan',
    rut_receptor: null,
    patente_vehiculo: 'XYZ99',
    email_envio: null,
    cliente: null,
    vendedor: null,
    created_at: '2026-04-25T10:00:00Z',
    updated_at: '2026-04-25T10:00:00Z',
    lineas: [
      {
        id: 1,
        orden: 0,
        descripcion: 'Producto X',
        cantidad: '1',
        precio_unitario: '1190',
        descuento_pct: '0',
        exenta: false,
        total_neto: '1000',
        iva: '190',
        total_linea: '1190',
      },
    ],
  }),
}))

vi.mock('../api/boletas', () => ({
  getBoleta: mockGet,
  enviarEmailBoleta: vi.fn(),
  anularBoleta: vi.fn(),
}))

vi.mock('../lib/pdf', () => ({ openPdf: vi.fn() }))

import { useModuloEnabled } from '../hooks/useModulos'
import BoletaDetalle from './BoletaDetalle'

const mockUseModuloEnabled = useModuloEnabled as ReturnType<typeof vi.fn>

function renderAt(path = '/boletas/1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/boletas/:id" element={<BoletaDetalle />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockUseModuloEnabled.mockReturnValue(true)
})

describe('BoletaDetalle', () => {
  it('muestra número, receptor y total', async () => {
    renderAt()
    await waitFor(() => expect(screen.getByText(/00100/)).toBeInTheDocument())
    expect(screen.getByText(/Juan/)).toBeInTheDocument()
    expect(screen.getAllByText(/1[.,]?190/).length).toBeGreaterThan(0)
    expect(screen.getByText(/XYZ99/)).toBeInTheDocument()
  })

  it('shows Anular button when nota_credito module is on', async () => {
    mockUseModuloEnabled.mockReturnValue(true)
    renderAt()
    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument())
  })

  it('hides Anular button when nota_credito module is off', async () => {
    mockUseModuloEnabled.mockReturnValue(false)
    renderAt()
    await waitFor(() => expect(screen.getByText(/00100/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument()
  })
})
