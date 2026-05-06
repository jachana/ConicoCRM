import { it, expect, vi, describe, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ModulesTab from './ModulesTab'
import * as apiModule from '../../lib/api'
import * as toastModule from 'sonner'

vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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

// cotizaciones ON, notas_venta ON → turning off cotizaciones cascades to notas_venta
const RESPONSE_BOTH_ON = {
  stored: { cotizaciones: true, notas_venta: true, inventario: false },
  effective: { cotizaciones: true, notas_venta: true, inventario: false },
  registry: REGISTRY,
}

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  )
}

describe('ModulesTab', () => {
  beforeEach(() => { vi.clearAllMocks() })

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

  it('blocked switch (parent disabled) is disabled; free switches are enabled', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText('Cotizaciones')).toBeInTheDocument())
    // notas_venta requires cotizaciones (which is off) → blocked
    expect(screen.getByRole('switch', { name: 'Notas de Venta' })).toBeDisabled()
    // cotizaciones and inventario have no unsatisfied requirements
    expect(screen.getByRole('switch', { name: 'Cotizaciones' })).not.toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Inventario' })).not.toBeDisabled()
  })

  it('clicking a free switch sends PATCH and shows success toast', async () => {
    const toggled = { ...RESPONSE, stored: { ...RESPONSE.stored, cotizaciones: true }, effective: { ...RESPONSE.effective, cotizaciones: true } }
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE })
    vi.mocked(apiModule.api.patch).mockResolvedValue({ data: toggled })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText('Cotizaciones')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('switch', { name: 'Cotizaciones' }))

    await waitFor(() =>
      expect(apiModule.api.patch).toHaveBeenCalledWith(
        '/api/empresas/1/modulos',
        { modulos: { cotizaciones: true } }
      )
    )
    await waitFor(() => expect(toastModule.toast.success).toHaveBeenCalled())
  })

  it('clicking a blocked switch does NOT send PATCH', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE })
    vi.mocked(apiModule.api.patch).mockResolvedValue({ data: RESPONSE })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText('Notas de Venta')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('switch', { name: 'Notas de Venta' }))

    // give time for any async effects
    await new Promise(r => setTimeout(r, 50))
    expect(apiModule.api.patch).not.toHaveBeenCalled()
  })

  it('reverts optimistic update and shows error toast on PATCH failure', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE })
    vi.mocked(apiModule.api.patch).mockRejectedValue(new Error('network'))
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText('Cotizaciones')).toBeInTheDocument())

    const sw = screen.getByRole('switch', { name: 'Cotizaciones' })
    fireEvent.click(sw)

    await waitFor(() => expect(toastModule.toast.error).toHaveBeenCalled())
    // After rollback the switch reverts to original state (off)
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  it('turning off parent with active dependents opens cascade modal with correct list', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE_BOTH_ON })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText('Cotizaciones')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('switch', { name: 'Cotizaciones' }))

    await waitFor(() => expect(screen.getByText(/Apagar Cotizaciones/)).toBeInTheDocument())
    expect(screen.getByText(/Esto también apagará/)).toBeInTheDocument()
    expect(screen.getByText(/Notas de Venta/, { selector: 'span.font-medium' })).toBeInTheDocument()
    expect(apiModule.api.patch).not.toHaveBeenCalled()
  })

  it('confirming cascade modal sends PATCH with parent and all dependent slugs', async () => {
    const after = { ...RESPONSE_BOTH_ON, stored: { cotizaciones: false, notas_venta: false, inventario: false }, effective: { cotizaciones: false, notas_venta: false, inventario: false } }
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE_BOTH_ON })
    vi.mocked(apiModule.api.patch).mockResolvedValue({ data: after })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText('Cotizaciones')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('switch', { name: 'Cotizaciones' }))
    await waitFor(() => expect(screen.getByText('Continuar')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Continuar'))

    await waitFor(() =>
      expect(apiModule.api.patch).toHaveBeenCalledWith(
        '/api/empresas/1/modulos',
        { modulos: { cotizaciones: false, notas_venta: false } }
      )
    )
  })

  it('canceling cascade modal does not send PATCH', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: RESPONSE_BOTH_ON })
    wrap(<ModulesTab empresaId={1} />)
    await waitFor(() => expect(screen.getByText('Cotizaciones')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('switch', { name: 'Cotizaciones' }))
    await waitFor(() => expect(screen.getByText('Cancelar')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Cancelar'))

    await new Promise(r => setTimeout(r, 50))
    expect(apiModule.api.patch).not.toHaveBeenCalled()
    expect(screen.queryByText('Continuar')).not.toBeInTheDocument()
  })
})
