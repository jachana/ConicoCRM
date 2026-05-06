import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import GuiasDespachoList from './GuiasDespachoList'
import * as apiGuias from '../api/guiasDespacho'

vi.mock('../api/guiasDespacho')

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GuiasDespachoList />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockGuia: apiGuias.GuiaDespachoListItem = {
  id: 1,
  numero: 100,
  fecha: '2026-04-26',
  cliente_id: 7,
  motivo_traslado: 1,
  total: '11900',
  estado: 'emitida',
  dte_estado: 'aceptada',
  cliente: { id: 7, nombre: 'ACME SpA' },
  vendedor: { id: 2, name: 'Juan' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiGuias.listarGuiasDespacho).mockResolvedValue({ data: [mockGuia], pagination: { limit: 50, offset: 0, total: 1 } })
})

describe('GuiasDespachoList', () => {
  it('renders table with guías', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('ACME SpA')).toBeInTheDocument())
    expect(screen.getByText('00100')).toBeInTheDocument()
  })

  it('applies filters and refetches', async () => {
    renderPage()
    await waitFor(() => expect(apiGuias.listarGuiasDespacho).toHaveBeenCalled())
    const desde = screen.getByLabelText(/desde/i) as HTMLInputElement
    await userEvent.type(desde, '2026-04-01')
    await waitFor(() => {
      const last = vi.mocked(apiGuias.listarGuiasDespacho).mock.calls.at(-1)
      expect(last?.[0]).toMatchObject({ fecha_desde: '2026-04-01' })
    })
  })

  it('shows empty state when no guías', async () => {
    vi.mocked(apiGuias.listarGuiasDespacho).mockResolvedValue({ data: [], pagination: { limit: 50, offset: 0, total: 0 } })
    renderPage()
    await waitFor(() => expect(screen.getByText(/sin guías/i)).toBeInTheDocument())
  })
})
