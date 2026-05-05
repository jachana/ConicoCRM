import { it, expect, vi, describe, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../hooks/useModulos', () => ({
  useModulos: vi.fn(),
}))

// Stub out heavy chart/table deps so tests stay fast
vi.mock('recharts', () => ({
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Cell: () => null,
}))

vi.mock('../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: null }) },
}))

import { useModulos } from '../hooks/useModulos'
import Reportes from './Reportes'

const mockUseModulos = useModulos as ReturnType<typeof vi.fn>

function allOn() {
  return {
    effective: {
      facturas: true,
      cobranza: true,
      inventario: true,
      ordenes_compra: true,
    } as never,
    isLoading: false,
    error: null,
  }
}

describe('Reportes tab filtering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows all tabs when all modules enabled', () => {
    mockUseModulos.mockReturnValue(allOn())
    render(<Reportes />)
    expect(screen.getByRole('tab', { name: 'Ventas' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Cobranza' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Inventario' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Compras' })).toBeTruthy()
  })

  it('hides Cobranza tab when cobranza module is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: true, cobranza: false, inventario: true, ordenes_compra: true } as never,
      isLoading: false,
      error: null,
    })
    render(<Reportes />)
    expect(screen.queryByRole('tab', { name: 'Cobranza' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Ventas' })).toBeTruthy()
  })

  it('hides Inventario tab when inventario module is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: true, cobranza: true, inventario: false, ordenes_compra: true } as never,
      isLoading: false,
      error: null,
    })
    render(<Reportes />)
    expect(screen.queryByRole('tab', { name: 'Inventario' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Ventas' })).toBeTruthy()
  })

  it('hides Compras tab when ordenes_compra module is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: true, cobranza: true, inventario: true, ordenes_compra: false } as never,
      isLoading: false,
      error: null,
    })
    render(<Reportes />)
    expect(screen.queryByRole('tab', { name: 'Compras' })).toBeNull()
  })

  it('hides Ventas, Márgenes, Por Marca, DTE tabs when facturas module is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: false, cobranza: true, inventario: true, ordenes_compra: true } as never,
      isLoading: false,
      error: null,
    })
    render(<Reportes />)
    expect(screen.queryByRole('tab', { name: 'Ventas' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Márgenes' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Por Marca' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'DTE' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Cobranza' })).toBeTruthy()
  })
})
