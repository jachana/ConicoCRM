import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ClienteTabFacturas from './ClienteTabFacturas'
import type { EmpresaFacturaItem } from '../types'

const FACTURAS_FIXTURE: EmpresaFacturaItem[] = [
  {
    id: 33,
    numero: 12,
    fecha: '2026-05-10',
    estado: 'pagada',
    contacto: null,
    total: 50000,
    monto_pagado: 50000,
    pendiente: 0,
  },
]

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation(() => Promise.resolve({ data: FACTURAS_FIXTURE })),
  },
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ClienteTabFacturas', () => {
  it('renders factura numero as a link to /facturas/<id>', async () => {
    wrap(<ClienteTabFacturas clienteId={42} />)

    const link = await screen.findByRole('link', { name: 'FAC-0012' })
    expect(link.getAttribute('href')).toBe('/facturas/33')
  })
})
