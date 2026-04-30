import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import type { User } from '../types'
import { loginStep1, loginStep2 } from '../api/auth'

export type LoginResult = { kind: 'ok' } | { kind: 'twofa'; ticket: string }

export function useAuth() {
  const { user, accessToken, setAuth, logout } = useAuthStore()

  async function fetchMeAndSet(accessToken: string, refreshToken: string): Promise<void> {
    const meRes = await api.get<User>('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    setAuth(meRes.data, accessToken, refreshToken)
  }

  async function login(email: string, password: string): Promise<LoginResult> {
    const r = await loginStep1(email, password)
    if (r.kind === 'twofa') return { kind: 'twofa', ticket: r.ticket }
    await fetchMeAndSet(r.access_token, r.refresh_token)
    return { kind: 'ok' }
  }

  async function loginWith2FA(ticket: string, code: string): Promise<void> {
    const tokens = await loginStep2(ticket, code)
    await fetchMeAndSet(tokens.access_token, tokens.refresh_token)
  }

  return { user, isAuthenticated: !!accessToken, login, loginWith2FA, logout }
}
