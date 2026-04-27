import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import GuiaDespachoNueva from './GuiaDespachoNueva'
import * as apiGuias from '../api/guiasDespacho'
import type { Cliente } from '../types'

vi.mock('../api/guiasDespacho')

// ClienteSelectModal.onSelect takes a single (cliente: Cliente) object.
// empresaId, empresaNombre, and open are required props — we accept them and ignore in the mock.
vi.mock('../components/ClienteSelectModal', () => ({
  default: ({
    onSelect,
    onClose,
  }: {
    open: boolean
    empresaId: number
    empresaNombre: string
    onSelect: (cliente: Cliente) => void
    onClose: () => void
  }) => (
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
  ),
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/guias-despacho/nueva']}>
        <Routes>
          <Route path="/guias-despacho/nueva" element={<GuiaDespachoNueva />} />
          <Route path="/guias-despacho/:id" element={<div>detalle-stub</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GuiaDespachoNueva', () => {
  it('renders empty form', () => {
    renderPage()
    expect(screen.getByText(/nueva guía/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/dirección destino/i)).toBeInTheDocument()
  })

  it('blocks submit without cliente', async () => {
    renderPage()
    const submitBtn = screen.getByRole('button', { name: /guardar y emitir/i })
    expect(submitBtn).toBeDisabled()
  })

  it('blocks submit without lineas válidas', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /seleccionar cliente/i }))
    await userEvent.click(screen.getByText('pick-cliente'))
    await userEvent.type(screen.getByLabelText(/dirección destino/i), 'Av Test 123')
    await userEvent.type(screen.getByLabelText(/comuna/i), 'Santiago')
    const submitBtn = screen.getByRole('button', { name: /guardar y emitir/i })
    expect(submitBtn).toBeDisabled()
  })

  it('submits successfully with valid form', async () => {
    vi.mocked(apiGuias.crearGuiaDespacho).mockResolvedValue({ id: 42 } as apiGuias.GuiaDespacho)
    vi.mocked(apiGuias.emitirGuiaDespachoDte).mockResolvedValue({ id: 42 } as apiGuias.GuiaDespacho)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /seleccionar cliente/i }))
    await userEvent.click(screen.getByText('pick-cliente'))
    await userEvent.type(screen.getByLabelText(/dirección destino/i), 'Av Test 123')
    await userEvent.type(screen.getByLabelText(/comuna/i), 'Santiago')
    const descInputs = screen.getAllByPlaceholderText(/descripción/i)
    await userEvent.type(descInputs[0], 'Producto X')
    const cantInputs = screen.getAllByPlaceholderText(/cantidad/i)
    await userEvent.clear(cantInputs[0])
    await userEvent.type(cantInputs[0], '2')
    const precInputs = screen.getAllByPlaceholderText(/precio/i)
    await userEvent.clear(precInputs[0])
    await userEvent.type(precInputs[0], '1000')

    await userEvent.click(screen.getByRole('button', { name: /guardar y emitir/i }))
    await waitFor(() => expect(apiGuias.crearGuiaDespacho).toHaveBeenCalled())
    await waitFor(() => expect(apiGuias.emitirGuiaDespachoDte).toHaveBeenCalledWith(42))
    await waitFor(() => expect(screen.getByText(/detalle-stub/)).toBeInTheDocument())
  })
})
