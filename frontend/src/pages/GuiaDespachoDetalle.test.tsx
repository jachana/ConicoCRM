import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../hooks/useModulos', () => ({
  useModuloEnabled: vi.fn().mockReturnValue(true),
}))

vi.mock('../api/guiasDespacho')

import GuiaDespachoDetalle from './GuiaDespachoDetalle'
import * as apiGuias from '../api/guiasDespacho'
import { useModuloEnabled } from '../hooks/useModulos'

const mockUseModuloEnabled = useModuloEnabled as ReturnType<typeof vi.fn>

function makeGuia(overrides: Partial<apiGuias.GuiaDespacho> = {}): apiGuias.GuiaDespacho {
  return {
    id: 42, numero: 100, fecha: '2026-04-26',
    cliente_id: 7, empresa_id: null, nota_venta_id: null,
    motivo_traslado: 1, direccion_destino: 'Av Test 123', comuna_destino: 'Santiago',
    email_envio: null, vendedor_id: 2,
    total_neto: '10000', total_iva: '1900', total: '11900',
    estado: 'emitida', dte_estado: 'aceptada',
    folio_sii: 5678, track_id: 'tk-123', email_enviado_at: null,
    created_at: '2026-04-26T10:00:00', updated_at: '2026-04-26T10:00:00',
    cliente: { id: 7, nombre: 'ACME SpA', rut: '11111111-1' },
    vendedor: { id: 2, name: 'Juan' },
    lineas: [
      { id: 1, orden: 0, producto_id: null, descripcion: 'Producto X',
        cantidad: '2', precio_unitario: '5000', descuento_pct: '0',
        exenta: false, total_neto: '10000', iva: '1900', total_linea: '11900' },
    ],
    ...overrides,
  }
}

function renderPage(id = 42) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/guias-despacho/${id}`]}>
        <Routes>
          <Route path="/guias-despacho/:id" element={<GuiaDespachoDetalle />} />
          <Route path="/notas-credito/nueva" element={<div>nc-nueva-stub</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseModuloEnabled.mockReturnValue(true)
})

describe('GuiaDespachoDetalle', () => {
  it('renders guía header + receptor + líneas', async () => {
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia())
    renderPage()
    await waitFor(() => expect(screen.getByText(/N°00100/i)).toBeInTheDocument())
    expect(screen.getByText(/ACME SpA/)).toBeInTheDocument()
    expect(screen.getByText(/Av Test 123/)).toBeInTheDocument()
    expect(screen.getByText(/Producto X/)).toBeInTheDocument()
  })

  it('shows "Anular" only when dte_estado=aceptada and not anulada', async () => {
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia({ dte_estado: 'aceptada' }))
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument())
  })

  it('hides "Anular" when guía already anulada', async () => {
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia({ estado: 'anulada' }))
    renderPage()
    await waitFor(() => expect(screen.getByText(/N°00100/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument()
  })

  it('clicking Anular navigates to /notas-credito/nueva with guia_despacho_id', async () => {
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia())
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /anular/i }))
    window.confirm = vi.fn(() => true)
    await userEvent.click(screen.getByRole('button', { name: /anular/i }))
    await waitFor(() => expect(screen.getByText('nc-nueva-stub')).toBeInTheDocument())
  })

  it('hides Anular when nota_credito module is off', async () => {
    mockUseModuloEnabled.mockReturnValue(false)
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia({ dte_estado: 'aceptada' }))
    renderPage()
    await waitFor(() => expect(screen.getByText(/N°00100/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument()
  })

  it('shows "Emitir DTE" when dte_estado=no_emitida', async () => {
    vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(makeGuia({ dte_estado: 'no_emitida' }))
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /emitir dte/i })).toBeInTheDocument())
  })

  it('polls every 10s while dte_estado=procesando, stops on aceptada', async () => {
    vi.useFakeTimers()
    const procesando = makeGuia({ dte_estado: 'procesando' })
    const aceptada = makeGuia({ dte_estado: 'aceptada' })
    const mock = vi.mocked(apiGuias.getGuiaDespacho)
    mock.mockResolvedValueOnce(procesando)
         .mockResolvedValueOnce(procesando)
         .mockResolvedValueOnce(aceptada)
    renderPage()
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(10_000)
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(10_000)
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(3))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mock).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
})
