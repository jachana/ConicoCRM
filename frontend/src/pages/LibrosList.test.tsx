import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { mockListVentas, mockListCompras } = vi.hoisted(() => ({
  mockListVentas: vi.fn().mockResolvedValue({
    data: [
      {
        id: 1,
        periodo: '2026-05',
        empresa_id: 1,
        folio_inicio: 1,
        folio_fin: 50,
        total_registros: 50,
        monto_total: 1000000,
        estado: 'enviado',
        created_at: '2026-05-01T10:00:00',
      },
    ],
    pagination: { limit: 50, offset: 0, total: 1 },
  }),
  mockListCompras: vi.fn().mockResolvedValue({
    data: [
      {
        id: 1,
        periodo: '2026-05',
        empresa_id: 1,
        rut_proveedor: '12345678-9',
        total_registros: 25,
        monto_total: 500000,
        estado: 'borrador',
        created_at: '2026-05-01T10:00:00',
      },
    ],
    pagination: { limit: 50, offset: 0, total: 1 },
  }),
}))

vi.mock('../api/libros', () => ({
  listarLibrosVentas: mockListVentas,
  listarLibrosCompras: mockListCompras,
  obtenerLibroVentas: vi.fn(),
  obtenerLibroCompras: vi.fn(),
}))

import LibrosList from './LibrosList'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LibrosList />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LibrosList', () => {
  it('renderiza página de libros con título', async () => {
    renderPage()
    expect(screen.getByText('Libros')).toBeInTheDocument()
  })

  it('muestra tab de ventas y compras', async () => {
    renderPage()
    expect(screen.getByText('Ventas')).toBeInTheDocument()
    expect(screen.getByText('Compras')).toBeInTheDocument()
  })

  it('realiza llamada a API de ventas al cargar', async () => {
    renderPage()
    await waitFor(() => expect(mockListVentas).toHaveBeenCalled())
  })

  it('cambia a tab de compras cuando se hace click', async () => {
    renderPage()
    const comprasBtn = screen.getByText('Compras')
    fireEvent.click(comprasBtn)
    await waitFor(() => expect(mockListCompras).toHaveBeenCalled())
  })

  it('renderiza filtros correctamente', async () => {
    renderPage()
    expect(screen.getByText('Desde')).toBeInTheDocument()
    expect(screen.getByText('Hasta')).toBeInTheDocument()
    expect(screen.getByText('Estado')).toBeInTheDocument()
    expect(screen.getByText('Ordenar por')).toBeInTheDocument()
  })

  it('tiene botón Imprimir', async () => {
    renderPage()
    await waitFor(() => {
      const printBtn = screen.getByText('Imprimir')
      expect(printBtn).toBeInTheDocument()
    })
  })

  it('abre diálogo de impresión al hacer click en botón Imprimir', async () => {
    const windowPrintSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderPage()
    await waitFor(() => {
      const printBtn = screen.getByText('Imprimir')
      expect(printBtn).toBeInTheDocument()
      fireEvent.click(printBtn)
      expect(windowPrintSpy).toHaveBeenCalled()
    })
    windowPrintSpy.mockRestore()
  })
})
