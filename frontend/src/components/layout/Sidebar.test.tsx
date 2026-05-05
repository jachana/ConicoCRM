import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import Sidebar from './Sidebar'
import type { ModulosState } from '../../lib/modulos'

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../stores/auth', () => ({
  useAuthStore: (sel: (s: { user: { id: number; name: string; role: string } | null; logout: () => void }) => unknown) =>
    sel({ user: { id: 1, name: 'Test User', role: 'admin' }, logout: vi.fn() }),
}))

vi.mock('../../hooks/useEffectivePermissions', () => ({
  useEffectivePermissions: () => ({ permissions: undefined, role: 'admin' }),
}))

vi.mock('../../stores/preferences', () => ({
  usePreferencesStore: (sel: (s: { preferencias: { sidebar_hidden: string[] } }) => unknown) =>
    sel({ preferencias: { sidebar_hidden: [] } }),
}))

vi.mock('../MisPendientesWidget', () => ({
  default: () => null,
}))

vi.mock('./ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light', toggle: vi.fn() }),
}))

// useModulos is the key mock — controlled per test
const mockUseModulos = vi.fn()
vi.mock('../../hooks/useModulos', () => ({
  useModulos: () => mockUseModulos(),
  useModuloEnabled: vi.fn(),
}))

// ── helpers ──────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

function renderSidebar(collapsed = false) {
  return render(
    <Sidebar collapsed={collapsed} onToggle={vi.fn()} />,
    { wrapper: makeWrapper() },
  )
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('Sidebar module filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows skeleton while modules are loading', () => {
    mockUseModulos.mockReturnValue({ effective: undefined, isLoading: true, error: null })
    const { container } = renderSidebar()
    // Skeleton divs are aria-hidden
    const skeletonRoot = container.querySelector('[aria-hidden="true"]')
    expect(skeletonRoot).toBeTruthy()
    // Nav links not rendered during loading
    expect(screen.queryByRole('link', { name: /facturas/i })).toBeNull()
  })

  it('shows optional module items when module is enabled', () => {
    const state = { facturas: true, cotizaciones: true } as unknown as ModulosState
    mockUseModulos.mockReturnValue({ effective: state, isLoading: false, error: null })
    renderSidebar()
    expect(screen.getByRole('link', { name: /facturas/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /cotizaciones/i })).toBeTruthy()
  })

  it('hides optional module items when module is disabled', () => {
    const state = { facturas: false, cotizaciones: false } as unknown as ModulosState
    mockUseModulos.mockReturnValue({ effective: state, isLoading: false, error: null })
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^Facturas$/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Cotizaciones$/i })).toBeNull()
  })

  it('always shows core items regardless of modulos state', () => {
    // Empty state — all slugs disabled
    const state = {} as ModulosState
    mockUseModulos.mockReturnValue({ effective: state, isLoading: false, error: null })
    renderSidebar()
    // Dashboard has module: 'dashboard' but no moduleSlug → always visible
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeTruthy()
    // Configuración is adminOnly with no moduleSlug → always visible for admins
    expect(screen.getByRole('link', { name: /configuraci/i })).toBeTruthy()
  })

  it('hides section entirely when all its module items are disabled', () => {
    // Disable all compras slugs
    const state = {
      ordenes_compra: false,
      facturas_compra: false,
      proveedores: false,
    } as unknown as ModulosState
    mockUseModulos.mockReturnValue({ effective: state, isLoading: false, error: null })
    renderSidebar()
    expect(screen.queryByText('Compras')).toBeNull()
  })

  it('shows mixed section when some modules enabled and others disabled', () => {
    const state = { facturas: true, boletas: false } as unknown as ModulosState
    mockUseModulos.mockReturnValue({ effective: state, isLoading: false, error: null })
    renderSidebar()
    expect(screen.getByRole('link', { name: /^Facturas$/i })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Boletas$/i })).toBeNull()
  })

  it('renders correctly in collapsed mode while loading', () => {
    mockUseModulos.mockReturnValue({ effective: undefined, isLoading: true, error: null })
    const { container } = renderSidebar(true)
    // Collapsed skeleton: no text labels, only icon placeholders
    const skeletonCircles = container.querySelectorAll('.rounded-full')
    expect(skeletonCircles.length).toBeGreaterThan(0)
  })
})
