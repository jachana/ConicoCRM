import { it, expect, vi, describe } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModuloGuard } from './ModuloGuard'

vi.mock('../hooks/useModulos', () => ({
  useModulos: vi.fn(),
}))

import { useModulos } from '../hooks/useModulos'

const mockUseModulos = useModulos as ReturnType<typeof vi.fn>

describe('ModuloGuard', () => {
  it('shows skeleton while loading', () => {
    mockUseModulos.mockReturnValue({ effective: undefined, isLoading: true, error: null })
    render(
      <ModuloGuard slug="boletas">
        <span>Contenido boletas</span>
      </ModuloGuard>
    )
    expect(screen.queryByText('Contenido boletas')).toBeNull()
    // skeleton divs are rendered (animate-pulse class)
    expect(document.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('shows children when module is enabled', () => {
    mockUseModulos.mockReturnValue({
      effective: { boletas: true } as never,
      isLoading: false,
      error: null,
    })
    render(
      <ModuloGuard slug="boletas">
        <span>Contenido boletas</span>
      </ModuloGuard>
    )
    expect(screen.getByText('Contenido boletas')).toBeTruthy()
  })

  it('shows ModuloNoDisponible when module is disabled', () => {
    mockUseModulos.mockReturnValue({
      effective: { boletas: false } as never,
      isLoading: false,
      error: null,
    })
    render(
      <ModuloGuard slug="boletas">
        <span>Contenido boletas</span>
      </ModuloGuard>
    )
    expect(screen.queryByText('Contenido boletas')).toBeNull()
    expect(screen.getByText(/no está habilitado/i)).toBeTruthy()
  })

  it('shows custom fallback when module is disabled and fallback is provided', () => {
    mockUseModulos.mockReturnValue({
      effective: { boletas: false } as never,
      isLoading: false,
      error: null,
    })
    render(
      <ModuloGuard slug="boletas" fallback={<span>Fallback personalizado</span>}>
        <span>Contenido boletas</span>
      </ModuloGuard>
    )
    expect(screen.queryByText('Contenido boletas')).toBeNull()
    expect(screen.getByText('Fallback personalizado')).toBeTruthy()
  })

  it('shows ModuloNoDisponible when effective is undefined (not loaded)', () => {
    mockUseModulos.mockReturnValue({ effective: undefined, isLoading: false, error: null })
    render(
      <ModuloGuard slug="boletas">
        <span>Contenido boletas</span>
      </ModuloGuard>
    )
    expect(screen.queryByText('Contenido boletas')).toBeNull()
    expect(screen.getByText(/no está habilitado/i)).toBeTruthy()
  })
})
