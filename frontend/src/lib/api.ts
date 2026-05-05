import axios from 'axios'
import { useAuthStore } from '../stores/auth'

export const api = axios.create({ baseURL: '' })

/** Extract a human-readable message from an Axios error.
 * Handles both string detail and structured {error,slug,label} objects. */
export function extractApiError(error: unknown, fallback = 'Error desconocido'): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'label' in detail) return String((detail as { label: unknown }).label)
  if (error instanceof Error) return error.message
  return fallback
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const { refreshToken, setAccessToken, logout } = useAuthStore.getState()
      if (!refreshToken) { logout(); return Promise.reject(error) }
      try {
        const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken })
        setAccessToken(res.data.access_token)
        original.headers.Authorization = `Bearer ${res.data.access_token}`
        return api(original)
      } catch {
        logout()
        return Promise.reject(error)
      }
    }
    return Promise.reject(error)
  }
)
