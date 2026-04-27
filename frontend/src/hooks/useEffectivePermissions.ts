import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useViewAsStore } from '../stores/viewAs'
import type { Permissions, User } from '../types'

type Role = User['role']

/**
 * Returns permissions and role clamped by an optional "view as" target.
 * Admin only: target is set from Configuración. UI gates use this; route
 * guards keep using the real `useAuthStore().user.role`.
 */
export function useEffectivePermissions() {
  const me = useAuthStore(s => s.user)
  const target = useViewAsStore(s => s.targetUser)

  const isViewingAs = !!target && !!me && me.role === 'admin' && target.id !== me.id

  const { data: myPermissions } = useQuery<Permissions>({
    queryKey: ['my-permissions'],
    queryFn: () => api.get('/api/users/me/permissions').then(r => r.data),
    enabled: !!me,
    staleTime: 5 * 60_000,
  })

  const { data: targetPermissions } = useQuery<Permissions>({
    queryKey: ['user-permissions', target?.id],
    queryFn: () => api.get(`/api/users/${target!.id}/permissions`).then(r => r.data),
    enabled: isViewingAs,
    staleTime: 5 * 60_000,
  })

  const effectivePermissions: Permissions | undefined = (() => {
    if (!isViewingAs) return myPermissions
    if (!myPermissions || !targetPermissions) return undefined
    const out: Record<string, Record<string, boolean>> = {}
    for (const m of Object.keys(myPermissions) as Array<keyof Permissions>) {
      out[m as string] = {}
      const myMod = myPermissions[m] || {}
      const tgtMod = (targetPermissions as Record<string, Record<string, boolean>>)[m as string] || {}
      for (const a of Object.keys(myMod) as Array<keyof typeof myMod>) {
        out[m as string][a as string] = Boolean(myMod[a]) && Boolean(tgtMod[a as string])
      }
    }
    return out as Permissions
  })()

  const effectiveRole: Role | undefined = isViewingAs ? target!.role : me?.role

  return {
    permissions: effectivePermissions,
    role: effectiveRole,
    isViewingAs,
    targetUser: isViewingAs ? target : null,
  }
}
