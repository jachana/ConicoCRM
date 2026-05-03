import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CAFListSection } from './CAFListSection'
import * as apiModule from '../../lib/api'

// Mock the axios instance so all API calls are intercepted at the HTTP level.
// This avoids Vitest's ESM module-binding issue where vi.mock on the api module
// creates a different instance than what the component's static import resolves to.
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const CAF_ITEM_1 = {
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
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CAFListSection />
    </QueryClientProvider>
  )
}

describe('CAFListSection', () => {
  beforeEach(() => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: { count: 0, cafs: [] } })
  })

  it('renders the CAFs section header', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText(/CAFs Actuales/)).toBeInTheDocument())
  })

  it('displays empty state when no CAFs', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText(/No hay CAFs cargados aún/)).toBeInTheDocument())
  })

  it('displays CAF count in header', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({
      data: {
        count: 2,
        cafs: [
          { ...CAF_ITEM_1, id: 1, tipo_dte: '33' },
          { ...CAF_ITEM_1, id: 2, tipo_dte: '34', num_fin: 500, total_folios: 500, folios_restantes: 50, consumido: 450, porcentaje_consumido: 90 },
        ],
      },
    })
    renderSection()
    await waitFor(() => expect(screen.getByText(/CAFs Actuales \(2\)/)).toBeInTheDocument())
  })

  it('displays CAF tipo in table', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: { count: 1, cafs: [CAF_ITEM_1] } })
    renderSection()
    await waitFor(() => expect(screen.getByText('33')).toBeInTheDocument())
  })

  it('shows vigente badge', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: { count: 1, cafs: [CAF_ITEM_1] } })
    renderSection()
    await waitFor(() => expect(screen.getByText('Vigente')).toBeInTheDocument())
  })

  it('shows warning alert when folios > 80% consumed', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({
      data: { count: 1, cafs: [{ ...CAF_ITEM_1, consumido: 850, folios_restantes: 150, porcentaje_consumido: 85 }] },
    })
    renderSection()
    await waitFor(() => expect(screen.getByText(/Folios en riesgo/)).toBeInTheDocument())
  })

  it('displays consumption percentage', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({
      data: { count: 1, cafs: [{ ...CAF_ITEM_1, consumido: 600, folios_restantes: 400, porcentaje_consumido: 60 }] },
    })
    renderSection()
    await waitFor(() => expect(screen.getByText('60.0%')).toBeInTheDocument())
  })

  it('renders refresh button', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText('Actualizar')).toBeInTheDocument())
  })

  it('calls the CAFs API on mount', async () => {
    renderSection()
    await waitFor(() => {
      expect(vi.mocked(apiModule.api.get)).toHaveBeenCalledWith('/api/onboarding/cafs')
    })
  })
})
