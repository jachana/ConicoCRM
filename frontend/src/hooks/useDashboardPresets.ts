// frontend/src/hooks/useDashboardPresets.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { DashboardPreset, LayoutPayload } from '../types/dashboard'

export function useDashboardPresets(role: string) {
  const qc = useQueryClient()
  const key = ['dashboard-presets', role]

  const query = useQuery<DashboardPreset[]>({
    queryKey: key,
    queryFn: () => api.get(`/api/dashboard/layout/${role}`).then(r => r.data),
  })

  const create = useMutation({
    mutationFn: (body: { name: string }) =>
      api.post<DashboardPreset>(`/api/dashboard/layout/${role}`, body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const save = useMutation({
    mutationFn: ({ slot, name, layout }: { slot: number; name: string; layout: LayoutPayload }) =>
      api.put<DashboardPreset>(`/api/dashboard/layout/${role}/${slot}`, { name, layout }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const remove = useMutation({
    mutationFn: (slot: number) => api.delete(`/api/dashboard/layout/${role}/${slot}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  return { query, create, save, remove }
}
