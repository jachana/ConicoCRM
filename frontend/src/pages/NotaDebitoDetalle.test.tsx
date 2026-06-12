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
import NotaDebitoDetalle from './NotaDebitoDetalle'
import type { NotaDebito } from '../types'

const mockGet = api.get as ReturnType<typeof vi.fn>

function makeNd(overrides: Partial<NotaDebito> = {}): NotaDebito {
  return {
    id: 3,
    numero: 8,
    fecha: '2026-06-02',
    cliente_id: 7,
    razon: 'Intereses por mora',
    monto_neto: '5000',
    monto_iva: '950',
    monto_total: '5950',
    dte_estado: 'no_emitida',
    created_at: '2026-06-02T10:00:00Z',
    lineas: [
      { id: 1, orden: 0, descripcion: 'Interés', cantidad: '1', precio_unitario: '5000', subtotal: '5000' },
    ],
    factura_id: null,
    factura_numero: null,
    ...overrides,
  }
}

function renderPage(id = 3) {
  return render(
    <MemoryRouter initialEntries={[`/notas-debito/${id}`]}>
      <Routes>
        <Route path="/notas-debito/:id" element={<NotaDebitoDetalle />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotaDebitoDetalle', () => {
  it('renders header, razón y líneas', async () => {
    mockGet.mockResolvedValue({ data: makeNd() })
    renderPage()
    await waitFor(() => expect(screen.getByText('ND-8')).toBeInTheDocument())
    expect(screen.getByText('Intereses por mora')).toBeInTheDocument()
    expect(screen.getByText('Interés')).toBeInTheDocument()
  })

  it('muestra link "Rectifica" a la factura cuando hay factura_id', async () => {
    mockGet.mockResolvedValue({ data: makeNd({ factura_id: 21, factura_numero: 340 }) })
    renderPage()
    await waitFor(() => expect(screen.getByText('Rectifica')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /Factura N° 340/ })
    expect(link).toHaveAttribute('href', '/facturas/21')
  })

  it('usa factura_id como fallback cuando factura_numero es null', async () => {
    mockGet.mockResolvedValue({ data: makeNd({ factura_id: 21, factura_numero: null }) })
    renderPage()
    await waitFor(() => expect(screen.getByText('Rectifica')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /Factura N° 21/ })
    expect(link).toHaveAttribute('href', '/facturas/21')
  })

  it('no muestra fila "Rectifica" cuando la ND no referencia factura', async () => {
    mockGet.mockResolvedValue({ data: makeNd() })
    renderPage()
    await waitFor(() => expect(screen.getByText('ND-8')).toBeInTheDocument())
    expect(screen.queryByText('Rectifica')).not.toBeInTheDocument()
  })

  it('muestra botón Emitir DTE cuando dte_estado=no_emitida', async () => {
    mockGet.mockResolvedValue({ data: makeNd({ dte_estado: 'no_emitida' }) })
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /emitir dte/i })).toBeInTheDocument())
  })
})
