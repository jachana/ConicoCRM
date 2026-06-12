import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../lib/pdf', () => ({ openPdf: vi.fn() }))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '../lib/api'
import NotaCreditoDetalle from './NotaCreditoDetalle'
import type { NotaCredito } from '../types'

const mockGet = api.get as ReturnType<typeof vi.fn>

function makeNc(overrides: Partial<NotaCredito> = {}): NotaCredito {
  return {
    id: 9,
    numero: 12,
    fecha: '2026-06-01',
    cliente_id: 7,
    razon: 'Devolución de producto',
    monto_neto: '10000',
    monto_iva: '1900',
    monto_total: '11900',
    dte_estado: 'no_emitida',
    created_at: '2026-06-01T10:00:00Z',
    lineas: [
      { id: 1, orden: 0, descripcion: 'Item devuelto', cantidad: '1', precio_unitario: '10000', subtotal: '10000' },
    ],
    boleta_id: null,
    guia_despacho_id: null,
    factura_id: null,
    boleta_numero: null,
    guia_despacho_numero: null,
    factura_numero: null,
    ...overrides,
  }
}

function renderPage(id = 9) {
  return render(
    <MemoryRouter initialEntries={[`/notas-credito/${id}`]}>
      <Routes>
        <Route path="/notas-credito/:id" element={<NotaCreditoDetalle />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotaCreditoDetalle', () => {
  it('renders header, razón y totales', async () => {
    mockGet.mockResolvedValue({ data: makeNc() })
    renderPage()
    await waitFor(() => expect(screen.getByText('NC-12')).toBeInTheDocument())
    expect(screen.getByText('Devolución de producto')).toBeInTheDocument()
    expect(screen.getByText('Item devuelto')).toBeInTheDocument()
  })

  it('muestra link "Rectifica" a la boleta cuando hay boleta_id', async () => {
    mockGet.mockResolvedValue({ data: makeNc({ boleta_id: 33, boleta_numero: 55 }) })
    renderPage()
    await waitFor(() => expect(screen.getByText('Rectifica')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /Boleta N° 55/ })
    expect(link).toHaveAttribute('href', '/boletas/33')
  })

  it('muestra link "Rectifica" a la guía de despacho cuando hay guia_despacho_id', async () => {
    mockGet.mockResolvedValue({ data: makeNc({ guia_despacho_id: 4, guia_despacho_numero: 120 }) })
    renderPage()
    await waitFor(() => expect(screen.getByText('Rectifica')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /Guía de despacho N° 120/ })
    expect(link).toHaveAttribute('href', '/guias-despacho/4')
  })

  it('muestra link "Rectifica" a la factura cuando hay factura_id', async () => {
    mockGet.mockResolvedValue({ data: makeNc({ factura_id: 17, factura_numero: 230 }) })
    renderPage()
    await waitFor(() => expect(screen.getByText('Rectifica')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /Factura N° 230/ })
    expect(link).toHaveAttribute('href', '/facturas/17')
  })

  it('usa factura_id como fallback cuando factura_numero es null', async () => {
    mockGet.mockResolvedValue({ data: makeNc({ factura_id: 17, factura_numero: null }) })
    renderPage()
    await waitFor(() => expect(screen.getByText('Rectifica')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /Factura N° 17/ })
    expect(link).toHaveAttribute('href', '/facturas/17')
  })

  it('no muestra fila "Rectifica" cuando la NC no referencia documento', async () => {
    mockGet.mockResolvedValue({ data: makeNc() })
    renderPage()
    await waitFor(() => expect(screen.getByText('NC-12')).toBeInTheDocument())
    expect(screen.queryByText('Rectifica')).not.toBeInTheDocument()
  })
})
