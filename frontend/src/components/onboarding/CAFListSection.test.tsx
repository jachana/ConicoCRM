import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CAFListSection } from './CAFListSection'
import * as cafsApi from '../../api/cafs'

vi.mock('../../api/cafs')

function renderWithQuery(component: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}

describe('CAFListSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the CAFs section header', () => {
    vi.mocked(cafsApi.listCAFs).mockResolvedValue({ count: 0, cafs: [] })
    renderWithQuery(<CAFListSection empresaId={1} />)
    expect(screen.getByText(/CAFs Actuales/)).toBeInTheDocument()
  })

  it('displays empty state when no CAFs', async () => {
    vi.mocked(cafsApi.listCAFs).mockResolvedValue({ count: 0, cafs: [] })
    renderWithQuery(<CAFListSection empresaId={1} />)

    await waitFor(() => {
      expect(screen.getByText(/No hay CAFs cargados aún/)).toBeInTheDocument()
    })
  })

  it('displays CAF count in header', async () => {
    vi.mocked(cafsApi.listCAFs).mockResolvedValue({
      count: 2,
      cafs: [
        {
          id: 1,
          empresa_id: 1,
          tipo_dte: '33',
          num_inicio: 1,
          num_fin: 1000,
          vigente: true,
          consumido: 500,
          total_folios: 1000,
          folios_restantes: 500,
          porcentaje_consumido: 50,
          created_at: '2026-05-01T00:00:00Z',
        },
        {
          id: 2,
          empresa_id: 1,
          tipo_dte: '34',
          num_inicio: 1,
          num_fin: 500,
          vigente: true,
          consumido: 450,
          total_folios: 500,
          folios_restantes: 50,
          porcentaje_consumido: 90,
          created_at: '2026-05-01T00:00:00Z',
        },
      ],
    })

    renderWithQuery(<CAFListSection empresaId={1} />)

    await waitFor(() => {
      expect(screen.getByText(/CAFs Actuales \(2\)/)).toBeInTheDocument()
    })
  })

  it('displays CAF tipo in table', async () => {
    vi.mocked(cafsApi.listCAFs).mockResolvedValue({
      count: 1,
      cafs: [
        {
          id: 1,
          empresa_id: 1,
          tipo_dte: '33',
          num_inicio: 1,
          num_fin: 1000,
          vigente: true,
          consumido: 500,
          total_folios: 1000,
          folios_restantes: 500,
          porcentaje_consumido: 50,
        },
      ],
    })

    renderWithQuery(<CAFListSection empresaId={1} />)

    await waitFor(() => {
      expect(screen.getByText('33')).toBeInTheDocument()
    })
  })

  it('shows vigente badge', async () => {
    vi.mocked(cafsApi.listCAFs).mockResolvedValue({
      count: 1,
      cafs: [
        {
          id: 1,
          empresa_id: 1,
          tipo_dte: '33',
          num_inicio: 1,
          num_fin: 1000,
          vigente: true,
          consumido: 500,
          total_folios: 1000,
          folios_restantes: 500,
          porcentaje_consumido: 50,
        },
      ],
    })

    renderWithQuery(<CAFListSection empresaId={1} />)

    await waitFor(() => {
      expect(screen.getByText('Vigente')).toBeInTheDocument()
    })
  })

  it('shows warning alert when folios > 80% consumed', async () => {
    vi.mocked(cafsApi.listCAFs).mockResolvedValue({
      count: 1,
      cafs: [
        {
          id: 1,
          empresa_id: 1,
          tipo_dte: '33',
          num_inicio: 1,
          num_fin: 1000,
          vigente: true,
          consumido: 850,
          total_folios: 1000,
          folios_restantes: 150,
          porcentaje_consumido: 85,
        },
      ],
    })

    renderWithQuery(<CAFListSection empresaId={1} />)

    await waitFor(() => {
      expect(screen.getByText(/Folios en riesgo/)).toBeInTheDocument()
    })
  })

  it('displays consumption percentage', async () => {
    vi.mocked(cafsApi.listCAFs).mockResolvedValue({
      count: 1,
      cafs: [
        {
          id: 1,
          empresa_id: 1,
          tipo_dte: '33',
          num_inicio: 1,
          num_fin: 1000,
          vigente: true,
          consumido: 600,
          total_folios: 1000,
          folios_restantes: 400,
          porcentaje_consumido: 60,
        },
      ],
    })

    renderWithQuery(<CAFListSection empresaId={1} />)

    await waitFor(() => {
      expect(screen.getByText('60.0%')).toBeInTheDocument()
    })
  })

  it('renders refresh button', async () => {
    vi.mocked(cafsApi.listCAFs).mockResolvedValue({ count: 0, cafs: [] })
    renderWithQuery(<CAFListSection empresaId={1} />)

    await waitFor(() => {
      const refreshBtn = screen.getByText('Actualizar')
      expect(refreshBtn).toBeInTheDocument()
    })
  })
})
