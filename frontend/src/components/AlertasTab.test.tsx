import { it, expect, vi, describe, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import AlertasTab, { NotaAlerta } from './AlertasTab'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  )
}

const mockAlertas: NotaAlerta[] = [
  {
    id: 1,
    cotizacion_id: 1,
    contenido: 'Alerta 1: Pendiente de aprobación',
    estado: 'pendiente',
    created_at: '2026-05-01T10:30:00Z',
    updated_at: '2026-05-01T10:30:00Z',
  },
  {
    id: 2,
    cotizacion_id: 1,
    contenido: 'Alerta 2: Completada',
    estado: 'completada',
    created_at: '2026-04-30T15:45:00Z',
    updated_at: '2026-04-30T15:45:00Z',
  },
  {
    id: 3,
    cotizacion_id: 1,
    contenido: 'Alerta 3: Cancelada por cambio de requisitos',
    estado: 'cancelada',
    created_at: '2026-04-29T09:15:00Z',
    updated_at: '2026-04-29T09:15:00Z',
  },
  {
    id: 4,
    cotizacion_id: 1,
    contenido: 'Alerta 4: Otro pendiente',
    estado: 'pendiente',
    created_at: '2026-04-28T14:20:00Z',
    updated_at: '2026-04-28T14:20:00Z',
  },
  {
    id: 5,
    cotizacion_id: 1,
    contenido: 'Alerta 5: Otra completada',
    estado: 'completada',
    created_at: '2026-04-27T11:00:00Z',
    updated_at: '2026-04-27T11:00:00Z',
  },
  {
    id: 6,
    cotizacion_id: 1,
    contenido: 'Alerta 6: Última alerta',
    estado: 'pendiente',
    created_at: '2026-04-26T16:30:00Z',
    updated_at: '2026-04-26T16:30:00Z',
  },
]

describe('AlertasTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza tabla cuando hay alertas', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: mockAlertas })

    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Alerta 1: Pendiente de aprobación')).toBeInTheDocument()
    })

    expect(screen.getByText('Alerta 2: Completada')).toBeInTheDocument()
    expect(screen.getByText('Alerta 3: Cancelada por cambio de requisitos')).toBeInTheDocument()
    expect(screen.getByText('Alerta 4: Otro pendiente')).toBeInTheDocument()
    expect(screen.getByText('Alerta 5: Otra completada')).toBeInTheDocument()
    expect(screen.getByText('Alerta 6: Última alerta')).toBeInTheDocument()

    // Verify table headers
    expect(screen.getByText('Fecha')).toBeInTheDocument()
    expect(screen.getByText('Contenido')).toBeInTheDocument()
    expect(screen.getByText('Estado')).toBeInTheDocument()
  })

  it('muestra estado vacío cuando no hay alertas', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: [] })

    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('No hay alertas para esta cotización')).toBeInTheDocument()
    })

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('muestra skeleton cargando', () => {
    vi.mocked(apiModule.api.get).mockImplementation(() => new Promise(() => {}))

    wrap(<AlertasTab cotizacionId={1} />)

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('abre modal al hacer clic en botón Agregar alerta', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: [] })
    const user = userEvent.setup()

    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Agregar alerta')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Agregar alerta'))

    expect(screen.getByText('Crear alerta')).toBeInTheDocument()
  })

  it('crea nueva alerta al enviar formulario', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: [] })
    vi.mocked(apiModule.api.post).mockResolvedValue({
      data: {
        id: 7,
        cotizacion_id: 1,
        contenido: 'Nueva alerta',
        estado: 'pendiente',
        created_at: '2026-05-01T12:00:00Z',
        updated_at: '2026-05-01T12:00:00Z',
      },
    })

    const user = userEvent.setup()
    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Agregar alerta')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Agregar alerta'))
    await waitFor(() => {
      expect(screen.getByText('Crear alerta')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Describe la alerta...')
    await user.type(textarea, 'Nueva alerta')

    const createButton = screen.getByRole('button', { name: /Crear/i })
    await user.click(createButton)

    await waitFor(() => {
      expect(apiModule.api.post).toHaveBeenCalledWith(
        '/api/cotizaciones/1/alertas',
        { contenido: 'Nueva alerta' }
      )
    })
  })

  it('abre modal con datos al hacer clic en botón Editar', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: mockAlertas })
    const user = userEvent.setup()

    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Alerta 1: Pendiente de aprobación')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByLabelText('Editar')
    await user.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Editar alerta')).toBeInTheDocument()
    })

    const textarea = screen.getByDisplayValue('Alerta 1: Pendiente de aprobación')
    expect(textarea).toBeInTheDocument()
  })

  it('actualiza alerta al enviar formulario en modo edición', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: mockAlertas })
    vi.mocked(apiModule.api.patch).mockResolvedValue({
      data: {
        ...mockAlertas[0],
        contenido: 'Alerta actualizada',
        estado: 'completada',
      },
    })

    const user = userEvent.setup()
    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Alerta 1: Pendiente de aprobación')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByLabelText('Editar')
    await user.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Editar alerta')).toBeInTheDocument()
    })

    const textarea = screen.getByDisplayValue('Alerta 1: Pendiente de aprobación')
    await user.clear(textarea)
    await user.type(textarea, 'Alerta actualizada')

    const updateButton = screen.getByRole('button', { name: /Actualizar/i })
    await user.click(updateButton)

    await waitFor(() => {
      expect(apiModule.api.patch).toHaveBeenCalledWith(
        '/api/cotizaciones/1/alertas/1',
        expect.objectContaining({
          contenido: 'Alerta actualizada',
        })
      )
    })
  })

  it('elimina alerta al hacer clic en botón Eliminar', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: mockAlertas })
    vi.mocked(apiModule.api.delete).mockResolvedValue({ data: {} })

    const user = userEvent.setup()
    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Alerta 1: Pendiente de aprobación')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByLabelText('Eliminar')
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(apiModule.api.delete).toHaveBeenCalledWith('/api/cotizaciones/1/alertas/1')
    })
  })

  it('muestra badge con color correcto para estado pendiente', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: mockAlertas })

    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Alerta 1: Pendiente de aprobación')).toBeInTheDocument()
    })

    const pendienteBadges = screen.getAllByText('Pendiente')
    expect(pendienteBadges.length).toBeGreaterThan(0)
    pendienteBadges.forEach(badge => {
      expect(badge).toHaveClass('bg-warning-100', 'text-warning-800')
    })
  })

  it('muestra badge con color correcto para estado completada', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: mockAlertas })

    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Alerta 2: Completada')).toBeInTheDocument()
    })

    const completadaBadges = screen.getAllByText('Completada')
    expect(completadaBadges.length).toBeGreaterThan(0)
    completadaBadges.forEach(badge => {
      expect(badge).toHaveClass('bg-success-100', 'text-success-800')
    })
  })

  it('muestra badge con color correcto para estado cancelada', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: mockAlertas })

    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Alerta 3: Cancelada por cambio de requisitos')).toBeInTheDocument()
    })

    const canceladaBadges = screen.getAllByText('Cancelada')
    expect(canceladaBadges.length).toBeGreaterThan(0)
    canceladaBadges.forEach(badge => {
      expect(badge).toHaveClass('bg-danger-100', 'text-danger-800')
    })
  })

  it('formatea fecha en formato Chile', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: mockAlertas })

    wrap(<AlertasTab cotizacionId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Alerta 1: Pendiente de aprobación')).toBeInTheDocument()
    })

    // Check that the date is formatted in es-CL locale (should contain abbreviated month names like "may", "abr", etc.)
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)

    // The first data row should contain a formatted date
    const firstDataRow = rows[1]
    const dateCell = firstDataRow.querySelector('td')
    expect(dateCell).toBeTruthy()
    expect(dateCell?.textContent).toMatch(/\d{1,2}\s+\w{3}\s+\d{4}/)
  })
})
