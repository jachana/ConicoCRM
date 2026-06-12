import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import NotaCreditoNueva from './NotaCreditoNueva'
import * as apiGuias from '../api/guiasDespacho'

const mockGuia = {
  id: 42, numero: 100, cliente_id: 7,
  cliente: { id: 7, nombre: 'ACME', rut: '11111111-1' },
  lineas: [{ id: 1, orden: 0, descripcion: 'Producto X',
    cantidad: '2', precio_unitario: '5000', descuento_pct: '0',
    exenta: false, total_neto: '10000', iva: '1900', total_linea: '11900' }],
}

vi.mock('../api/guiasDespacho', () => ({
  getGuiaDespacho: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '../lib/api'

const mockFactura = { id: 17, numero: 230, cliente_id: 7 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiGuias.getGuiaDespacho).mockResolvedValue(mockGuia as any)
  vi.mocked(api.get).mockResolvedValue({ data: mockFactura })
})

describe('NotaCreditoNueva', () => {
  it('precharges from ?guia_despacho_id=X', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/notas-credito/nueva?guia_despacho_id=42']}>
          <Routes>
            <Route path="/notas-credito/nueva" element={<NotaCreditoNueva />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    // Wait for the mock to be called
    await waitFor(() => expect(apiGuias.getGuiaDespacho).toHaveBeenCalledWith(42))
    await waitFor(() => expect(screen.getByText(/anulará la guía N°100/i)).toBeInTheDocument())
    expect(screen.getByDisplayValue('Producto X')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/anulación guía despacho/i)).toBeInTheDocument()
  })

  it('precharges from ?factura_id=X y muestra banner de rectificación', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/notas-credito/nueva?factura_id=17']}>
          <Routes>
            <Route path="/notas-credito/nueva" element={<NotaCreditoNueva />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/facturas/17'))
    await waitFor(() => expect(screen.getByText(/rectificará la factura N°230/i)).toBeInTheDocument())
    expect(screen.getByDisplayValue('7')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/rectifica factura/i)).toBeInTheDocument()
  })
})
