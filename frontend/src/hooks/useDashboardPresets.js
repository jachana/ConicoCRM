// frontend/src/hooks/useDashboardPresets.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
export function useDashboardPresets(role) {
    const qc = useQueryClient();
    const key = ['dashboard-presets', role];
    const query = useQuery({
        queryKey: key,
        queryFn: () => api.get(`/api/dashboard/layout/${role}`).then(r => r.data),
    });
    const create = useMutation({
        mutationFn: (body) => api.post(`/api/dashboard/layout/${role}`, body).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    });
    const save = useMutation({
        mutationFn: ({ slot, name, layout }) => api.put(`/api/dashboard/layout/${role}/${slot}`, { name, layout }).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    });
    const remove = useMutation({
        mutationFn: (slot) => api.delete(`/api/dashboard/layout/${role}/${slot}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    });
    return { query, create, save, remove };
}
