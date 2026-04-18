import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import type { User } from '../types'

export function useAuth() {
  const { user, accessToken, setAuth, logout } = useAuthStore()

  async function login(email: string, password: string): Promise<void> {
    const form = new FormData()
    form.append('username', email)
    form.append('password', password)
    const tokenRes = await api.post<{ access_token: string; refresh_token: string }>('/api/auth/login', form)
    const meRes = await api.get<User>('/api/auth/me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    })
    setAuth(meRes.data, tokenRes.data.access_token, tokenRes.data.refresh_token)
  }

  return { user, isAuthenticated: !!accessToken, login, logout }
}
