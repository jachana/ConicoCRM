import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import GlobalSearchModal from '../components/search/GlobalSearchModal'
import * as searchApi from '../api/search'
import * as modulosApi from '../api/modulos'
import { useAuthStore } from '../stores/auth'
import type { ModulosState } from '../lib/modulos'

vi.mock('../api/search')
vi.mock('../api/modulos')

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname}</div>
}

function wrap(children: React.ReactNode, initialEntries: string[] = ['/']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="*" element={<>{children}<LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const ALL_MODULOS_ON: ModulosState = {
  catalogo: true, clientes: true, empresas: true, usuarios: true, dashboard: true,
  cotizaciones: true, notas_venta: true, facturas: true, boletas: true,
  guias_despacho: true, nota_credito: true, nota_debito: true,
  proveedores: true, ordenes_compra: true, facturas_compra: true,
  inventario: true, listas_precios: true, precios_especiales: true,
  pagos: true, cobranza: true, bancos_receptores: true, libros: true,
  dte_recepcion: true, oportunidades: true, tareas: true, reglas_tareas: true,
  rrhh_empleados: true, rrhh_vacaciones: true, rrhh_documentos: true,
  aprobaciones_descuento: true, aprobaciones_costo: true, aprobaciones_margen: true,
}

function loginAs(role: 'admin' | 'subadmin' | 'vendedor') {
  useAuthStore.setState({
    user: {
      id: 1, email: 'u@example.com', name: 'Test', role,
      is_active: true, created_at: '2025-01-01', empresa_id: 1,
    },
    accessToken: 'tok',
    refreshToken: 'rtok',
  })
}

describe('GlobalSearchModal — Acciones group', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
    vi.spyOn(modulosApi, 'fetchMyModulos').mockResolvedValue(ALL_MODULOS_ON)
    vi.spyOn(searchApi, 'search').mockResolvedValue({ q: '' })
  })

  it('renders Acciones group with quick-create actions for admin', async () => {
    loginAs('admin')
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    expect(await screen.findByText('Acciones')).toBeInTheDocument()
    expect(await screen.findByText('Nueva factura')).toBeInTheDocument()
    expect(screen.getByText('Nueva nota de venta')).toBeInTheDocument()
    expect(screen.getByText('Nueva cotización')).toBeInTheDocument()
    expect(screen.getByText('Nueva orden de compra')).toBeInTheDocument()
    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument()
  })

  it('hides admin-only actions from vendedor role', async () => {
    loginAs('vendedor')
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    expect(await screen.findByText('Nueva cotización')).toBeInTheDocument()
    expect(screen.queryByText('Nueva orden de compra')).not.toBeInTheDocument()
    expect(screen.queryByText('Nueva nota de crédito')).not.toBeInTheDocument()
    expect(screen.queryByText('Ir a Reportes')).not.toBeInTheDocument()
    expect(screen.queryByText('Ir a Configuración')).not.toBeInTheDocument()
  })

  it('hides actions whose módulo is disabled', async () => {
    loginAs('admin')
    vi.spyOn(modulosApi, 'fetchMyModulos').mockResolvedValue({
      ...ALL_MODULOS_ON,
      boletas: false,
    })
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    expect(await screen.findByText('Nueva factura')).toBeInTheDocument()
    expect(screen.queryByText('Nueva boleta')).not.toBeInTheDocument()
  })

  it('keyword search filters actions ("fac" matches "Nueva factura")', async () => {
    loginAs('admin')
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    await screen.findByText('Nueva factura')
    const input = screen.getByPlaceholderText(/Buscar/i)
    fireEvent.change(input, { target: { value: 'fac' } })
    await waitFor(() => {
      expect(screen.getByText('Nueva factura')).toBeInTheDocument()
    })
    expect(screen.queryByText('Nueva guía de despacho')).not.toBeInTheDocument()
  })

  it('keyword search is diacritic-insensitive ("cotizacion" matches "Nueva cotización")', async () => {
    loginAs('admin')
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    await screen.findByText('Nueva cotización')
    const input = screen.getByPlaceholderText(/Buscar/i)
    fireEvent.change(input, { target: { value: 'cotizacion' } })
    await waitFor(() => {
      expect(screen.getByText('Nueva cotización')).toBeInTheDocument()
    })
  })

  it('selecting an action navigates to its route and closes modal', async () => {
    loginAs('admin')
    const onOpenChange = vi.fn()
    render(wrap(<GlobalSearchModal open={true} onOpenChange={onOpenChange} />))
    const item = await screen.findByText('Nueva factura')
    fireEvent.click(item)
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(screen.getByTestId('loc').textContent).toBe('/facturas/nueva')
  })

  it('logout action clears auth and navigates to /login', async () => {
    loginAs('admin')
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    const item = await screen.findByText('Cerrar sesión')
    fireEvent.click(item)
    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBeNull()
    })
    expect(screen.getByTestId('loc').textContent).toBe('/login')
  })

  it('placeholder hints at action keywords', () => {
    loginAs('admin')
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    const input = screen.getByPlaceholderText(/o escribe 'nueva'/i)
    expect(input).toBeInTheDocument()
  })
})
