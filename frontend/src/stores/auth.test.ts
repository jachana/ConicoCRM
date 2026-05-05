import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './auth'

const fakeUser = { id: 1, email: 'a@b.cl', name: 'A', role: 'admin' as const, is_active: true, created_at: '', empresa_id: null }

describe('auth store', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
    localStorage.clear()
  })

  it('starts unauthenticated', () => {
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('setAuth stores user and tokens', () => {
    useAuthStore.getState().setAuth(fakeUser, 'access123', 'refresh456')
    expect(useAuthStore.getState().accessToken).toBe('access123')
    expect(useAuthStore.getState().user?.email).toBe('a@b.cl')
  })

  it('logout clears all state', () => {
    useAuthStore.getState().setAuth(fakeUser, 'access123', 'refresh456')
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
