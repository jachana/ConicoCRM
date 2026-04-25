import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { mockList } = vi.hoisted(() => ({
  mockList: vi.fn().mockResolvedValue([
    {
      id: 1,
      numero: 100,
      fecha: '2026-04-25',
      tipo_dte: '39',
      cliente_id: null,
      nombre_receptor: 'Juan',
      patente_vehiculo: 'XYZ99',
      metodo_pago: 'efectivo',
      total: '1190',
      estado: 'emitida',
      dte_estado: 'aceptada',
      cliente: null,
      vendedor: null,
    },
  ]),
}))

vi.mock('../api/boletas', () => ({
  listarBoletas: mockList,
  exportarBoletasExcel: vi.fn(),
  pdfBoletaUrl: (id: number) => `/api/boletas/${id}/pdf`,
  enviarEmailBoleta: vi.fn(),
  anularBoleta: vi.fn(),
}))

import BoletasList from './BoletasList'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BoletasList />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BoletasList', () => {
  it('renderiza fila de boleta', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('XYZ99')).toBeInTheDocument())
    expect(screen.getByText('Juan')).toBeInTheDocument()
  })

  it('filtra por patente al escribir', async () => {
    renderPage()
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    mockList.mockClear()
    const input = screen.getByPlaceholderText(/patente/i)
    fireEvent.change(input, { target: { value: 'ABC123' } })
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ patente: 'ABC123' })),
    )
  })
})
