import { it, expect, vi, describe } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ModulesTab from './ModulesTab'
import * as apiModule from '../../lib/api'

vi.mock('../../lib/api', () => ({ api: { get: vi.fn() } }))

const REGISTRY = [
  { slug: 'cotizaciones', label: 'Cotizaciones', categoria: 'ventas', requires: [], dependents: ['notas_venta'] },
  { slug: 'notas_venta', label: 'Notas de Venta', categoria: 'ventas', requires: ['cotizaciones'], dependents: [] },
  { slug: 'inventario', label: 'Inventario', categoria: 'inventario_precios', requires: [], dependents: [] },
]

const RESPONSE = {
  stored: { cotizaciones: false, notas_venta: false, inventario: false },
  effective: { cotizaciones: false, notas_venta: false, inventario: false },
  registry: REGISTRY,
}

const RESPONSE_WITH_ENABLED = {
  stored: { cotizaciones: true, notas_venta: false, inventario: false },
  effective: { cotizaciones: true, notas_venta: false, inventario: false },
  registry: REGISTRY,
}

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  )
}

describe('ModulesTab', () => {
  it('renders modules grouped by category', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText('Cotizaciones')).toBeInTheDocument())
    expect(screen.getByText('Notas de Venta')).toBeInTheDocument()
    expect(screen.getByText('Inventario')).toBeInTheDocument()
    expect(screen.getByText('Ventas')).toBeInTheDocument()
    expect(screen.getByText('Inventario y Precios')).toBeInTheDocument()
  })

  it('shows active badge for enabled modules', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE_WITH_ENABLED })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText('Cotizaciones')).toBeInTheDocument())
    const badges = screen.getAllByText('Activo')
    expect(badges).toHaveLength(1)
    const inactives = screen.getAllByText('Inactivo')
    expect(inactives).toHaveLength(2)
  })

  it('shows Requiere text when dependency is disabled', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText(/Requiere: Cotizaciones/)).toBeInTheDocument())
  })

  it('shows Habilita text for modules with dependents', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText(/Habilita:/)).toBeInTheDocument())
  })

  it('shows loading skeletons while fetching', () => {
    vi.mocked(apiModule.api.get).mockReturnValue(new Promise(() => {}))
    wrap(<ModulesTab empresaId={1} />)
    expect(document.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('shows error message on fetch failure', async () => {
    vi.mocked(apiModule.api.get).mockRejectedValue(new Error('network error'))
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText(/Error al cargar/)).toBeInTheDocument())
  })

  it('fetches from correct empresa endpoint', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE })
    wrap(<ModulesTab empresaId={42} />)
    await waitFor(() => expect(apiModule.api.get).toHaveBeenCalledWith('/api/empresas/42/modulos'))
  })

  it('switches are visually disabled', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText('Cotizaciones')).toBeInTheDocument())
    const switches = document.querySelectorAll('[role="switch"]')
    switches.forEach(sw => expect(sw).toBeDisabled())
  })
})
