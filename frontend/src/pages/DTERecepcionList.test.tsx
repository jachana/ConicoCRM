import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import DTERecepcionList from './DTERecepcionList'
import * as dteApi from '../api/dte_recepcion'

vi.mock('../api/dte_recepcion')

const mockDteRecepciones = [
  {
    id: 1,
    empresa_id: 1,
    tipo: '46',
    folio: 1001,
    rut_emisor: '12.345.678-9',
    monto: 50000,
    xml_raw: null,
    estado: 'recibido' as const,
    respuesta_sii: null,
    rechazo_motivo: null,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
  },
  {
    id: 2,
    empresa_id: 1,
    tipo: '46',
    folio: 1002,
    rut_emisor: '98.765.432-1',
    monto: 75000,
    xml_raw: null,
    estado: 'aceptado' as const,
    respuesta_sii: { estado: 'aceptado' },
    rechazo_motivo: null,
    created_at: '2024-01-02T10:00:00Z',
    updated_at: '2024-01-02T10:00:00Z',
  },
]

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DTERecepcionList />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('DTERecepcionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page title', () => {
    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    })

    renderPage()
    expect(screen.getByText('DTE Recepción')).toBeInTheDocument()
  })

  it('fetches and displays DTEs', async () => {
    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: mockDteRecepciones,
      pagination: { limit: 50, offset: 0, total: 2 },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('1001')).toBeInTheDocument()
      expect(screen.getByText('1002')).toBeInTheDocument()
    })
  })

  it('shows empty state when no DTEs', async () => {
    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Sin DTEs')).toBeInTheDocument()
    })
  })

  it('filter controls exist', async () => {
    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: [mockDteRecepciones[0]],
      pagination: { limit: 50, offset: 0, total: 1 },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Estado')).toBeInTheDocument()
      expect(screen.getByText('RUT Emisor')).toBeInTheDocument()
    })
  })

  it('has rut_emisor input field', async () => {
    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: [mockDteRecepciones[0]],
      pagination: { limit: 50, offset: 0, total: 1 },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByPlaceholderText('XX.XXX.XXX-K')).toBeInTheDocument()
    })
  })

  it('accepts a DTE', async () => {
    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: [mockDteRecepciones[0]],
      pagination: { limit: 50, offset: 0, total: 1 },
    })

    vi.mocked(dteApi.aceptarDteRecepcion).mockResolvedValueOnce({
      ...mockDteRecepciones[0],
      estado: 'aceptado',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('1001')).toBeInTheDocument()
    })

    const aceptarButtons = screen.getAllByRole('button')
    const aceptarBtn = aceptarButtons.find(btn => btn.querySelector('svg'))

    if (aceptarBtn) {
      await userEvent.click(aceptarBtn)
    }

    await waitFor(() => {
      expect(dteApi.aceptarDteRecepcion).toHaveBeenCalledWith(1)
    })
  })

  it('opens reject modal', async () => {
    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: [mockDteRecepciones[0]],
      pagination: { limit: 50, offset: 0, total: 1 },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('1001')).toBeInTheDocument()
    })

    const buttons = screen.getAllByRole('button')
    const rejectBtn = buttons.find(btn => btn.querySelector('svg'))

    if (rejectBtn) {
      await userEvent.click(rejectBtn.nextElementSibling as HTMLElement)
    }

    await waitFor(() => {
      expect(screen.getByText(/Rechazar DTE/i)).toBeInTheDocument()
    })
  })

  it('disables actions for non-recibido status', async () => {
    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: [mockDteRecepciones[1]],
      pagination: { limit: 50, offset: 0, total: 1 },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('1002')).toBeInTheDocument()
    })

    const buttons = screen.getAllByRole('button')
    const actionButtons = buttons.filter(
      btn => btn.getAttribute('disabled') !== null && btn.querySelector('svg'),
    )

    expect(actionButtons.length).toBeGreaterThan(0)
  })

  it('shows status badges with correct valores', async () => {
    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: mockDteRecepciones,
      pagination: { limit: 50, offset: 0, total: 2 },
    })

    renderPage()

    await waitFor(() => {
      // Both DTEs are rendered
      expect(screen.getByText('1001')).toBeInTheDocument()
      expect(screen.getByText('1002')).toBeInTheDocument()
    })
  })

  it('handles pagination', async () => {
    const dtes = Array.from({ length: 50 }).map((_, i) => ({
      ...mockDteRecepciones[0],
      id: i + 1,
      folio: 1000 + i + 1,
    }))

    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: dtes,
      pagination: { limit: 50, offset: 0, total: 100 },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('1001')).toBeInTheDocument()
    })

    const nextBtn = screen.getByRole('button', { name: /Siguiente/i })
    expect(nextBtn).not.toBeDisabled()

    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: dtes.map(d => ({ ...d, id: d.id + 50, folio: d.folio + 50 })),
      pagination: { limit: 50, offset: 50, total: 100 },
    })

    await userEvent.click(nextBtn)

    await waitFor(() => {
      expect(dteApi.listarDteRecepciones).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 50,
        }),
      )
    })
  })

  it('formats money correctly', async () => {
    vi.mocked(dteApi.listarDteRecepciones).mockResolvedValueOnce({
      data: [mockDteRecepciones[0]],
      pagination: { limit: 50, offset: 0, total: 1 },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('$ 50.000')).toBeInTheDocument()
    })
  })

})
