import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearchModal from '../components/search/GlobalSearchModal'
import * as searchApi from '../api/search'

vi.mock('../api/search')

function wrap(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('GlobalSearchModal', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('does not call API when query < 2 chars', async () => {
    const spy = vi.spyOn(searchApi, 'search').mockResolvedValue({ q: '' })
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    const input = screen.getByPlaceholderText(/Buscar/i)
    fireEvent.change(input, { target: { value: 'a' } })
    await new Promise(r => setTimeout(r, 300))
    expect(spy).not.toHaveBeenCalled()
  })

  it('calls API after debounce when query >= 2 chars', async () => {
    const spy = vi.spyOn(searchApi, 'search').mockResolvedValue({
      q: 'tor',
      productos: [{ id: 1, nombre: 'Tornillo', sku: 'TOR-1' }],
    })
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    const input = screen.getByPlaceholderText(/Buscar/i)
    fireEvent.change(input, { target: { value: 'tor' } })
    await waitFor(() => expect(spy).toHaveBeenCalled(), { timeout: 1000 })
    expect(await screen.findByText('Tornillo')).toBeInTheDocument()
  })

  it('shows recientes when query empty and localStorage has entries', () => {
    localStorage.setItem(
      'conico:recientes',
      JSON.stringify([
        { tipo: 'cliente', id: 1, titulo: 'Juan', subtitulo: '12-3', addedAt: new Date().toISOString() },
      ])
    )
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    expect(screen.getByText('Juan')).toBeInTheDocument()
    expect(screen.getByText('Recientes')).toBeInTheDocument()
  })

  it('renders empty state when no recientes and query empty', () => {
    render(wrap(<GlobalSearchModal open={true} onOpenChange={() => {}} />))
    expect(screen.getByText(/Empieza a escribir/i)).toBeInTheDocument()
  })

})

describe('URL_BY_TIPO', () => {
  it('cliente includes id deep-link', async () => {
    const { URL_BY_TIPO } = await import('../components/search/GlobalSearchModal')
    expect(URL_BY_TIPO.cliente(42)).toBe('/clientes?detalle=42')
  })

  it('empleado includes id deep-link', async () => {
    const { URL_BY_TIPO } = await import('../components/search/GlobalSearchModal')
    expect(URL_BY_TIPO.empleado(7)).toBe('/rrhh?detalle=7')
  })

  it('empresa, producto continue to use id deep-link', async () => {
    const { URL_BY_TIPO } = await import('../components/search/GlobalSearchModal')
    expect(URL_BY_TIPO.empresa(3)).toBe('/empresas?detalle=3')
    expect(URL_BY_TIPO.producto(9)).toBe('/catalogo?detalle=9')
  })
})
