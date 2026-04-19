// frontend/src/hooks/useDashboardLayout.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { DashboardLayoutOut, LayoutPayload } from '../types/dashboard'

export function useDashboardLayout(role: string) {
  const qc = useQueryClient()

  const query = useQuery<DashboardLayoutOut>({
    queryKey: ['dashboard-layout', role],
    queryFn: () => api.get(`/api/dashboard/layout/${role}`).then(r => r.data),
  })

  const save = useMutation({
    mutationFn: (payload: LayoutPayload) =>
      api.put<DashboardLayoutOut>(`/api/dashboard/layout/${role}`, payload).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['dashboard-layout', role], data)
    },
  })

  return { query, save }
}
