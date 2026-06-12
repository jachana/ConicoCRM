import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VentasTab from './VentasTab'
import type { VentaDocItem } from '../types'

const COTIZACIONES_FIXTURE: VentaDocItem[] = [
  { id: 11, numero: 5, fecha: '2026-05-12', estado: 'abierta', total: 250000 },
]

const NVS_FIXTURE: VentaDocItem[] = [
  { id: 33, numero: 9, fecha: '2026-05-15', estado: 'pendiente', total: 119000 },
  { id: 34, numero: null, fecha: '2026-05-16', estado: 'facturada', total: 45000 },
]

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/cotizaciones')) return Promise.resolve({ data: COTIZACIONES_FIXTURE })
      if (url.includes('/nota-ventas')) return Promise.resolve({ data: NVS_FIXTURE })
      return Promise.resolve({ data: [] })
    }),
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

describe('VentasTab', () => {
  it('renders cotizacion row with link to /cotizaciones/<id>', async () => {
    wrap(<VentasTab scope="empresas" entityId={1} />)

    const link = await screen.findByRole('link', { name: 'COT-0005' })
    expect(link.getAttribute('href')).toBe('/cotizaciones/11')
  })

  it('renders NV row with link to /notas-venta/<id>', async () => {
    wrap(<VentasTab scope="clientes" entityId={42} />)

    const link = await screen.findByRole('link', { name: 'NV-0009' })
    expect(link.getAttribute('href')).toBe('/notas-venta/33')
  })

  it('renders NV with null numero as "NV s/n" still linked by id', async () => {
    wrap(<VentasTab scope="clientes" entityId={42} />)

    const link = await screen.findByRole('link', { name: 'NV s/n' })
    expect(link.getAttribute('href')).toBe('/notas-venta/34')
  })

  it('renders totals formatted with es-CL money format', async () => {
    wrap(<VentasTab scope="empresas" entityId={1} />)

    await screen.findByRole('link', { name: 'COT-0005' })
    expect(screen.getByText(`$ ${(250000).toLocaleString('es-CL')}`)).toBeTruthy()
    expect(screen.getByText(`$ ${(119000).toLocaleString('es-CL')}`)).toBeTruthy()
  })

  it('renders section counts in footers', async () => {
    wrap(<VentasTab scope="empresas" entityId={1} />)

    expect(await screen.findByText('1 cotización')).toBeTruthy()
    expect(await screen.findByText('2 notas de venta')).toBeTruthy()
  })
})
