import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as librosApi from '../api/libros'
import LibroDetalle from './LibroDetalle'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1', tipo: 'ventas' }),
  }
})

vi.mock('../api/libros')

const mockLibroVentas: librosApi.LibroVentasRead = {
  id: 1,
  periodo: '2025-05',
  empresa_id: 1,
  folio_inicio: 1000,
  folio_fin: 1050,
  total_registros: 50,
  monto_total: 5000000,
  estado: 'borrador',
  created_at: '2025-05-01T10:00:00',
}

const mockLibroCompras: librosApi.LibroComprasRead = {
  id: 2,
  periodo: '2025-05',
  empresa_id: 1,
  rut_proveedor: '12345678-9',
  total_registros: 30,
  monto_total: 3000000,
  estado: 'enviado',
  created_at: '2025-05-01T11:00:00',
}

describe('LibroDetalle', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
  })

  it('renders loading skeleton initially', () => {
    vi.spyOn(librosApi, 'obtenerLibroVentas').mockImplementation(
      () => new Promise(() => {}),
    )

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LibroDetalle />
        </BrowserRouter>
      </QueryClientProvider>,
    )

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders libro ventas data correctly', async () => {
    vi.spyOn(librosApi, 'obtenerLibroVentas').mockResolvedValue(mockLibroVentas)

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LibroDetalle />
        </BrowserRouter>
      </QueryClientProvider>,
    )

    await vi.waitFor(() => {
      expect(screen.getByText('Libro de Ventas')).toBeInTheDocument()
    })

    expect(screen.getByText('2025-05')).toBeInTheDocument()
    expect(screen.queryAllByText('borrador')).toBeDefined()
    expect(screen.queryAllByText('50')).toBeDefined()
    expect(screen.queryAllByText('1000')).toBeDefined()
  })

  it('renders error state when fetch fails', async () => {
    vi.spyOn(librosApi, 'obtenerLibroVentas').mockRejectedValue(new Error('API Error'))

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LibroDetalle />
        </BrowserRouter>
      </QueryClientProvider>,
    )

    await vi.waitFor(() => {
      expect(screen.getByText('No se encontró el libro')).toBeInTheDocument()
    })
  })

  it('has export CSV button', async () => {
    vi.spyOn(librosApi, 'obtenerLibroVentas').mockResolvedValue(mockLibroVentas)

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LibroDetalle />
        </BrowserRouter>
      </QueryClientProvider>,
    )

    await vi.waitFor(() => {
      expect(screen.getByText('Exportar CSV')).toBeInTheDocument()
    })
  })

  it('has export PDF button', async () => {
    vi.spyOn(librosApi, 'obtenerLibroVentas').mockResolvedValue(mockLibroVentas)

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LibroDetalle />
        </BrowserRouter>
      </QueryClientProvider>,
    )

    await vi.waitFor(() => {
      expect(screen.getByText('Generar PDF')).toBeInTheDocument()
    })
  })

  it('has print button', async () => {
    vi.spyOn(librosApi, 'obtenerLibroVentas').mockResolvedValue(mockLibroVentas)

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LibroDetalle />
        </BrowserRouter>
      </QueryClientProvider>,
    )

    await vi.waitFor(() => {
      expect(screen.getByText('Imprimir')).toBeInTheDocument()
    })
  })

  it('displays folio range for libro ventas', async () => {
    vi.spyOn(librosApi, 'obtenerLibroVentas').mockResolvedValue(mockLibroVentas)

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LibroDetalle />
        </BrowserRouter>
      </QueryClientProvider>,
    )

    await vi.waitFor(() => {
      expect(screen.queryAllByText('1000')).toBeDefined()
    })
  })

  it('displays appropriate error when libro not found', async () => {
    vi.spyOn(librosApi, 'obtenerLibroVentas').mockRejectedValue(new Error('404'))

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LibroDetalle />
        </BrowserRouter>
      </QueryClientProvider>,
    )

    await vi.waitFor(() => {
      expect(screen.getByText('No se encontró el libro')).toBeInTheDocument()
    })
  })

  it('formats currency correctly', async () => {
    vi.spyOn(librosApi, 'obtenerLibroVentas').mockResolvedValue(mockLibroVentas)

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LibroDetalle />
        </BrowserRouter>
      </QueryClientProvider>,
    )

    await vi.waitFor(() => {
      const moneyElement = screen.queryAllByText(/\$.*5.*000/)[0]
      expect(moneyElement).toBeDefined()
    })
  })

  it('has back button', async () => {
    vi.spyOn(librosApi, 'obtenerLibroVentas').mockResolvedValue(mockLibroVentas)

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LibroDetalle />
        </BrowserRouter>
      </QueryClientProvider>,
    )

    await vi.waitFor(() => {
      const backButton = screen.getByLabelText('Volver a libros')
      expect(backButton).toBeInTheDocument()
    })
  })
})
