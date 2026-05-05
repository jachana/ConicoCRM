import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Cliente } from '../types'

vi.mock('../api/boletas', () => ({
  crearBoleta: vi.fn().mockResolvedValue({ id: 99, numero: 1, total: '1190' }),
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url === '/api/empresas/') {
        return Promise.resolve({ data: [{ id: 1, nombre: 'Test SpA' }] })
      }
      if (url.startsWith('/api/productos/buscar')) {
        return Promise.resolve({
          data: [{ id: 5, nombre: 'Cemento', sku: 'CEM-01', precio_venta: 1000, precio_con_iva: 1190 }],
        })
      }
      return Promise.resolve({ data: [] })
    }),
  },
}))

vi.mock('../components/ClienteSelectModal', () => ({
  default: ({
    open,
    onSelect,
    onClose,
  }: {
    open: boolean
    empresaId: number
    empresaNombre: string
    onSelect: (cliente: Cliente) => void
    onClose: () => void
  }) =>
    open ? (
      <div data-testid="mock-cliente-modal">
        <button
          onClick={() => {
            onSelect({ id: 7, nombre: 'ACME SpA' } as Cliente)
            onClose()
          }}
        >
          pick-cliente
        </button>
      </div>
    ) : null,
}))

import BoletaNueva from './BoletaNueva'
import { crearBoleta } from '../api/boletas'

function makeClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return qc
}

function renderBoleta() {
  const qc = makeClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BoletaNueva />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BoletaNueva', () => {
  beforeEach(() => {
    ;(crearBoleta as unknown as ReturnType<typeof vi.fn>).mockClear()
  })

  it('emite boleta anónima con una línea', async () => {
    renderBoleta()
    fireEvent.change(screen.getByPlaceholderText(/descripción/i), { target: { value: 'Producto X' } })
    fireEvent.change(screen.getByPlaceholderText(/cantidad/i), { target: { value: '1' } })
    fireEvent.change(screen.getByPlaceholderText(/precio/i), { target: { value: '1190' } })
    fireEvent.click(screen.getByRole('button', { name: /^emitir$/i }))
    await waitFor(() => expect(crearBoleta).toHaveBeenCalled())
    const payload = (crearBoleta as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.tipo_dte).toBe('39')
    expect(payload.lineas).toHaveLength(1)
    expect(payload.lineas[0].descripcion).toBe('Producto X')
  })

  it('forza exenta cuando tipo_dte es 41', async () => {
    renderBoleta()
    fireEvent.click(screen.getByRole('button', { name: /41 Exenta/i }))
    fireEvent.change(screen.getByPlaceholderText(/descripción/i), { target: { value: 'Servicio exento' } })
    fireEvent.change(screen.getByPlaceholderText(/precio/i), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /^emitir$/i }))
    await waitFor(() => expect(crearBoleta).toHaveBeenCalled())
    const payload = (crearBoleta as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.tipo_dte).toBe('41')
    expect(payload.lineas[0].exenta).toBe(true)
  })

  it('selecciona cliente via modal → payload incluye cliente_id', async () => {
    renderBoleta()
    // Switch to "Cliente registrado" mode
    fireEvent.click(screen.getByRole('button', { name: /cliente registrado/i }))
    // Open the modal via the select-client button
    fireEvent.click(screen.getByText(/seleccionar cliente/i))
    // Modal should be visible
    expect(screen.getByTestId('mock-cliente-modal')).toBeInTheDocument()
    // Pick the client
    fireEvent.click(screen.getByRole('button', { name: /pick-cliente/i }))
    // Modal closes, client name shows
    await waitFor(() => expect(screen.queryByTestId('mock-cliente-modal')).not.toBeInTheDocument())
    expect(screen.getByText('ACME SpA')).toBeInTheDocument()
    // Fill a line item so form is valid
    fireEvent.change(screen.getByPlaceholderText(/descripción/i), { target: { value: 'Servicio' } })
    fireEvent.change(screen.getByPlaceholderText(/precio/i), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: /^emitir$/i }))
    await waitFor(() => expect(crearBoleta).toHaveBeenCalled())
    const payload = (crearBoleta as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.cliente_id).toBe(7)
    expect(payload.lineas[0].descripcion).toBe('Servicio')
  })

  it('selecciona producto via autocomplete → rellena descripción y precio', async () => {
    renderBoleta()
    const descripcionInput = screen.getByPlaceholderText(/descripción/i)
    fireEvent.change(descripcionInput, { target: { value: 'Cem' } })
    // Wait for autocomplete results to appear
    await waitFor(() => expect(screen.getByText('Cemento')).toBeInTheDocument())
    // Click the autocomplete option
    fireEvent.mouseDown(screen.getByText('Cemento'))
    // Description field should now show the product name
    await waitFor(() => expect(descripcionInput).toHaveValue('Cemento'))
    // Price field should be filled
    const precioInput = screen.getByPlaceholderText(/precio/i)
    expect(precioInput).toHaveValue(1000)
  })
})
