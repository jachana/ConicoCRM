import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EmpresaTabFacturas from './EmpresaTabFacturas'
import type { EmpresaFacturaItem } from '../types'

const FACTURAS_FIXTURE: EmpresaFacturaItem[] = [
  {
    id: 7,
    numero: 1,
    fecha: '2026-05-10',
    estado: 'emitida',
    contacto: null,
    total: 119000,
    monto_pagado: 0,
    pendiente: 119000,
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

describe('EmpresaTabFacturas', () => {
  it('renders factura numero as a link to /facturas/<id>', async () => {
    wrap(<EmpresaTabFacturas empresaId={1} empresaNombre="Constructora Solar" />)

    const link = await screen.findByRole('link', { name: 'FAC-0001' })
    expect(link.getAttribute('href')).toBe('/facturas/7')
  })
})
