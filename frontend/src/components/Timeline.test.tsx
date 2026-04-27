import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Timeline from './Timeline'
import type { TimelinePage } from '../api/timeline'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: (s: { user: { role: string } }) => unknown) =>
    fn ? fn({ user: { role: 'admin' } }) : { user: { role: 'admin' } },
}))

const { api } = await import('../lib/api')

function emptyPage(overrides: Partial<TimelinePage> = {}): TimelinePage {
  return { items: [], total: 0, limit: 25, offset: 0, ...overrides }
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue({ data: emptyPage() })
})

describe('Timeline', () => {
  it('1. renderiza skeletons durante la carga', () => {
    // Never resolves → stays loading
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}))
    wrap(<Timeline scope="cliente" entityId={1} pageSize={25} />)
    // Skeletons have the animate-pulse class from Skeleton component
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('2. muestra estado vacío cuando items es []', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: emptyPage() })
    wrap(<Timeline scope="cliente" entityId={1} />)
    expect(await screen.findByText('Sin actividad registrada')).toBeTruthy()
  })

  it('3. renderiza 3 eventos con título y link correcto', async () => {
    const items: TimelinePage['items'] = [
      { tipo: 'factura',    id: 10, fecha: '2026-01-15', titulo: 'FAC-0010', link: '/facturas/10', estado: 'pagada' },
      { tipo: 'cotizacion', id: 5,  fecha: '2026-01-10', titulo: 'COT-0005', link: '/cotizaciones/5', estado: 'aprobada' },
      { tipo: 'pago',       id: 3,  fecha: '2026-01-20', titulo: 'Pago $50.000', link: '/pagos/3', monto: '50000' },
    ]
    vi.mocked(api.get).mockResolvedValue({ data: emptyPage({ items, total: 3 }) })
    wrap(<Timeline scope="cliente" entityId={7} />)

    expect(await screen.findByText('FAC-0010')).toBeTruthy()
    expect(screen.getByText('COT-0005')).toBeTruthy()
    expect(screen.getByText('Pago $50.000')).toBeTruthy()

    // Links point to correct hrefs
    const link = screen.getByRole('link', { name: /FAC-0010/i })
    expect(link.getAttribute('href')).toBe('/facturas/10')
  })

  it('4. pill Factura filtra llamada a API con tipos=factura', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: emptyPage() })
    wrap(<Timeline scope="cliente" entityId={2} pageSize={25} />)

    // Wait for initial render
    await screen.findByText('Sin actividad registrada')

    vi.mocked(api.get).mockClear()
    vi.mocked(api.get).mockResolvedValue({ data: emptyPage() })

    fireEvent.click(screen.getByText('Factura'))

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledWith(
        expect.stringContaining('/api/clientes/2/timeline'),
        expect.objectContaining({
          params: expect.objectContaining({ tipos: 'factura' }),
        }),
      )
    })
  })

  it('5. botón Cargar más aparece si hay más items; click incrementa offset', async () => {
    const PAGE_SIZE = 2
    const items: TimelinePage['items'] = [
      { tipo: 'factura', id: 1, fecha: '2026-01-01', titulo: 'FAC-0001', link: '/facturas/1' },
      { tipo: 'boleta',  id: 2, fecha: '2026-01-02', titulo: 'BOL-0002', link: '/boletas/2' },
    ]
    // total > items.length → should show "Cargar más"
    vi.mocked(api.get).mockResolvedValue({
      data: emptyPage({ items, total: 5, limit: PAGE_SIZE, offset: 0 }),
    })

    wrap(<Timeline scope="empresa" entityId={10} pageSize={PAGE_SIZE} />)

    const loadMore = await screen.findByText('Cargar más')
    expect(loadMore).toBeTruthy()

    vi.mocked(api.get).mockClear()
    vi.mocked(api.get).mockResolvedValue({
      data: emptyPage({ items: [], total: 5, limit: PAGE_SIZE, offset: PAGE_SIZE }),
    })

    fireEvent.click(loadMore)

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledWith(
        expect.stringContaining('/api/empresas/10/timeline'),
        expect.objectContaining({
          params: expect.objectContaining({ offset: PAGE_SIZE }),
        }),
      )
    })
  })
})
