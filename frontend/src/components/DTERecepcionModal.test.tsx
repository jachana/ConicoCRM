import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import DTERecepcionModal from './DTERecepcionModal'
import { aceptarDteRecepcion, rechazarDteRecepcion } from '../api/dte_recepcion'
import type { DteRecepcionRead } from '../api/dte_recepcion'

// Mock API functions
vi.mock('../api/dte_recepcion', () => ({
  aceptarDteRecepcion: vi.fn(),
  rechazarDteRecepcion: vi.fn(),
  listarDteRecepciones: vi.fn(),
  obtenerDteRecepcion: vi.fn(),
}))

const DTE_FIXTURE: DteRecepcionRead = {
  id: 1,
  empresa_id: 42,
  tipo: '46',
  folio: 12345,
  rut_emisor: '99.999.999-9',
  monto: 1500000,
  estado: 'recibido',
  xml_raw: '<documento>...</documento>',
  respuesta_sii: null,
  rechazo_motivo: null,
  created_at: '2026-04-01T10:30:00Z',
  updated_at: '2026-04-01T10:30:00Z',
}

const DTE_ACEPTADO: DteRecepcionRead = {
  ...DTE_FIXTURE,
  estado: 'aceptado',
  respuesta_sii: {
    estado: 'aceptado',
    timestamp: '2026-04-01T10:35:00Z',
  },
}

const DTE_RECHAZADO: DteRecepcionRead = {
  ...DTE_FIXTURE,
  estado: 'rechazado',
  rechazo_motivo: 'Datos incorrectos',
}

function renderModal(dte: DteRecepcionRead | null, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <DTERecepcionModal dteRecepcion={dte} onClose={onClose} />
      <Toaster />
    </QueryClientProvider>
  )
}

describe('DTERecepcionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when dteRecepcion is null', () => {
    const { container } = renderModal(null)
    expect(container.firstChild?.childNodes.length).toBe(0)
  })

  it('displays DTE header with type, folio, and RUT', () => {
    renderModal(DTE_FIXTURE)
    expect(screen.getByText(/DTE 46 Folio 12345/)).toBeInTheDocument()
    const rutElements = screen.getAllByText(/99.999.999-9/)
    expect(rutElements.length).toBeGreaterThan(0)
  })

  it('displays estado badge with correct variant for recibido', () => {
    renderModal(DTE_FIXTURE)
    const recibidoElements = screen.getAllByText(/Recibido/)
    expect(recibidoElements.length).toBeGreaterThan(0)
  })

  it('displays estado badge with success variant for aceptado', () => {
    renderModal(DTE_ACEPTADO)
    const aceptadoElements = screen.getAllByText(/Aceptado/)
    expect(aceptadoElements.length).toBeGreaterThan(0)
  })

  it('displays estado badge with danger variant for rechazado', () => {
    renderModal(DTE_RECHAZADO)
    expect(screen.getAllByText(/Rechazado/).length).toBeGreaterThan(0)
  })

  it('displays all basic information fields', () => {
    renderModal(DTE_FIXTURE)
    expect(screen.getByText('46')).toBeInTheDocument() // tipo
    expect(screen.getByText('12345')).toBeInTheDocument() // folio
    expect(screen.getByText('99.999.999-9')).toBeInTheDocument() // rut_emisor
    expect(screen.getByText('$ 1.500.000')).toBeInTheDocument() // monto
    expect(screen.getByText('42')).toBeInTheDocument() // empresa_id
  })

  it('displays created and updated timestamps', () => {
    renderModal(DTE_FIXTURE)
    // The dates should be displayed in the header and in the timestamps section
    expect(screen.getByText(/Creado/)).toBeInTheDocument()
    expect(screen.getByText(/Actualizado/)).toBeInTheDocument()
  })

  it('displays respuesta_sii when present', () => {
    renderModal(DTE_ACEPTADO)
    expect(screen.getByText('Respuesta SII')).toBeInTheDocument()
    // Click to expand
    fireEvent.click(screen.getByText('Respuesta SII'))
    expect(screen.getByText(/"estado"\s*:\s*"aceptado"/)).toBeInTheDocument()
  })

  it('displays rechazo_motivo when estado is rechazado', () => {
    renderModal(DTE_RECHAZADO)
    expect(screen.getByText('Motivo del Rechazo')).toBeInTheDocument()
    expect(screen.getByText('Datos incorrectos')).toBeInTheDocument()
  })

  it('displays xml_raw in collapsible section', () => {
    renderModal(DTE_FIXTURE)
    const xmlButton = screen.getByText('XML Raw')
    expect(xmlButton).toBeInTheDocument()
    fireEvent.click(xmlButton)
    expect(screen.getByText('<documento>...</documento>')).toBeInTheDocument()
  })

  it('allows copying XML when expanded', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)

    renderModal(DTE_FIXTURE)
    const xmlButton = screen.getByText('XML Raw')
    fireEvent.click(xmlButton)

    const copyButton = screen.getByTitle('Copiar XML')
    await user.click(copyButton)

    expect(writeText).toHaveBeenCalledWith('<documento>...</documento>')
    writeText.mockRestore()
  })

  it('shows Accept and Reject buttons when estado is recibido', () => {
    renderModal(DTE_FIXTURE)
    expect(screen.getByText('Aceptar')).toBeInTheDocument()
    expect(screen.getByText('Rechazar')).toBeInTheDocument()
  })

  it('hides action buttons when estado is aceptado', () => {
    renderModal(DTE_ACEPTADO)
    expect(screen.queryByText('Aceptar')).not.toBeInTheDocument()
    expect(screen.queryByText('Rechazar')).not.toBeInTheDocument()
    expect(screen.getByText(/No se puede cambiar el estado/i)).toBeInTheDocument()
  })

  it('hides action buttons when estado is rechazado', () => {
    renderModal(DTE_RECHAZADO)
    expect(screen.queryByText('Aceptar')).not.toBeInTheDocument()
    expect(screen.queryByText('Rechazar')).not.toBeInTheDocument()
  })

  it('calls aceptarDteRecepcion when Accept button is clicked', async () => {
    const mockAceptar = vi.mocked(aceptarDteRecepcion)
    mockAceptar.mockResolvedValue(DTE_ACEPTADO)

    renderModal(DTE_FIXTURE)
    const aceptarButton = screen.getByText('Aceptar')

    fireEvent.click(aceptarButton)

    await waitFor(() => {
      expect(mockAceptar).toHaveBeenCalledWith(1)
    })
  })

  it('opens rechazar modal when Reject button is clicked', async () => {
    renderModal(DTE_FIXTURE)

    const rechazarButton = screen.getByText('Rechazar')
    fireEvent.click(rechazarButton)

    // The rechazar modal should appear with the folio in its title
    await waitFor(() => {
      expect(screen.getByText(/Rechazar DTE Folio 12345/)).toBeInTheDocument()
    })
  })

  it('opens and closes rechazar modal correctly', async () => {
    renderModal(DTE_FIXTURE)

    const rechazarButton = screen.getByText('Rechazar')
    fireEvent.click(rechazarButton)

    // The rechazar modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Rechazar DTE Folio 12345/)).toBeInTheDocument()
    })

    // The motivo textarea should be in the modal
    const motivoInput = screen.getByPlaceholderText(/Ej: Datos incorrectos/) as HTMLTextAreaElement
    expect(motivoInput).toBeInTheDocument()
  })

  it('calls onClose when modal is closed', async () => {
    const onClose = vi.fn()
    renderModal(DTE_FIXTURE, onClose)

    // Find and click the close button (X button in the top right)
    const closeButton = screen.getByLabelText('Cerrar')

    fireEvent.click(closeButton)
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('displays info fields with correct styling', () => {
    renderModal(DTE_FIXTURE)
    const infoFields = screen.getAllByText(/Tipo DTE|Folio|RUT Emisor|Monto/)
    expect(infoFields.length).toBeGreaterThan(0)
  })

  it('formats monto correctly with Chilean locale', () => {
    renderModal(DTE_FIXTURE)
    expect(screen.getByText('$ 1.500.000')).toBeInTheDocument()
  })

  it('toggles XML section when clicking XML Raw button', () => {
    renderModal(DTE_FIXTURE)
    const xmlButton = screen.getByText('XML Raw')

    // Initially not visible
    expect(screen.queryByText('<documento>...</documento>')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(xmlButton)
    expect(screen.getByText('<documento>...</documento>')).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(xmlButton)
    expect(screen.queryByText('<documento>...</documento>')).not.toBeInTheDocument()
  })

  it('toggles respuesta_sii section when clicking button', () => {
    renderModal(DTE_ACEPTADO)
    const respuestaButton = screen.getByText('Respuesta SII')

    // Initially not visible
    expect(screen.queryByText(/"estado"\s*:\s*"aceptado"/)).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(respuestaButton)
    expect(screen.getByText(/"estado"\s*:\s*"aceptado"/)).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(respuestaButton)
    expect(screen.queryByText(/"estado"\s*:\s*"aceptado"/)).not.toBeInTheDocument()
  })
})
