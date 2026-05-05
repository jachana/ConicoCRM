import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { fetchMyModulos } from '../api/modulos'
import { isModuloEnabled } from '../lib/modulos'
import type { Modulo, ModulosState } from '../lib/modulos'

export interface UseModulosResult {
  effective: ModulosState | undefined
  isLoading: boolean
  error: Error | null
}

export function useModulos(): UseModulosResult {
  const me = useAuthStore(s => s.user)

  const { data, isLoading, error } = useQuery<ModulosState, Error>({
    queryKey: ['my-modulos'],
    queryFn: fetchMyModulos,
    enabled: !!me,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  })

  return { effective: data, isLoading, error: error ?? null }
}

export function useModuloEnabled(slug: Modulo): boolean {
  const { effective } = useModulos()
  return isModuloEnabled(effective, slug)
}
