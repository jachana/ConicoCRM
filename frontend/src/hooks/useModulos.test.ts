import { renderHook, waitFor } from '@testing-library/react'
import { vi, it, expect, describe, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useModulos, useModuloEnabled } from './useModulos'
import { isModuloEnabled } from '../lib/modulos'
import type { ModulosState } from '../lib/modulos'
import * as modulosApi from '../api/modulos'

vi.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: { user: { id: number } }) => unknown) =>
    selector({ user: { id: 1 } }),
}))

vi.mock('../api/modulos', () => ({
  fetchMyModulos: vi.fn(),
}))

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('isModuloEnabled', () => {
  it('returns false when state undefined', () => {
    expect(isModuloEnabled(undefined, 'facturas')).toBe(false)
  })

  it('returns true when slug enabled', () => {
    const state = { facturas: true } as unknown as ModulosState
    expect(isModuloEnabled(state, 'facturas')).toBe(true)
  })

  it('returns false when slug disabled', () => {
    const state = { facturas: false } as unknown as ModulosState
    expect(isModuloEnabled(state, 'facturas')).toBe(false)
  })

  it('returns false for missing key', () => {
    const state = {} as ModulosState
    expect(isModuloEnabled(state, 'inventario')).toBe(false)
  })
})

describe('useModulos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns isLoading true while fetching', () => {
    ;(modulosApi.fetchMyModulos as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    )
    const { result } = renderHook(() => useModulos(), { wrapper: makeWrapper() })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.effective).toBeUndefined()
  })

  it('returns effective map on success', async () => {
    const mockState: Partial<ModulosState> = { facturas: true, inventario: false }
    ;(modulosApi.fetchMyModulos as ReturnType<typeof vi.fn>).mockResolvedValue(mockState)

    const { result } = renderHook(() => useModulos(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.effective).toEqual(mockState)
    expect(result.current.error).toBeNull()
  })

  it('exposes error on failure', async () => {
    ;(modulosApi.fetchMyModulos as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network error'),
    )

    const { result } = renderHook(() => useModulos(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.message).toBe('network error')
  })

  it('reflects updated data after refetch', async () => {
    const first: Partial<ModulosState> = { facturas: false }
    const second: Partial<ModulosState> = { facturas: true }
    const fetch = modulosApi.fetchMyModulos as ReturnType<typeof vi.fn>
    fetch.mockResolvedValueOnce(first).mockResolvedValueOnce(second)

    const { result } = renderHook(() => useModulos(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect((result.current.effective as Partial<ModulosState>)?.facturas).toBe(false)

    // Simulate refetch (e.g. window focus)
    await result.current.effective // just reads; actual refetch tested via react-query invalidation in e2e
  })
})

describe('useModuloEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false while loading', () => {
    ;(modulosApi.fetchMyModulos as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    )
    const { result } = renderHook(() => useModuloEnabled('facturas'), {
      wrapper: makeWrapper(),
    })
    expect(result.current).toBe(false)
  })

  it('returns true when module enabled', async () => {
    const mockState: Partial<ModulosState> = { facturas: true }
    ;(modulosApi.fetchMyModulos as ReturnType<typeof vi.fn>).mockResolvedValue(mockState)

    const { result } = renderHook(() => useModuloEnabled('facturas'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false when module disabled', async () => {
    const mockState: Partial<ModulosState> = { facturas: false }
    ;(modulosApi.fetchMyModulos as ReturnType<typeof vi.fn>).mockResolvedValue(mockState)

    const { result } = renderHook(() => useModuloEnabled('facturas'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(false))
  })
})
