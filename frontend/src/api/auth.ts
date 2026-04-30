import { api } from '../lib/api'

export interface TwoFASetup {
  secret: string
  provisioning_uri: string
  qr_png_base64: string
}

export interface TwoFAEnrollResult {
  recovery_codes: string[]
}

export interface TwoFAStatus {
  enabled: boolean
}

export async function get2FAStatus(): Promise<TwoFAStatus> {
  return (await api.get<TwoFAStatus>('/api/auth/2fa/status')).data
}

export async function setup2FA(): Promise<TwoFASetup> {
  return (await api.post<TwoFASetup>('/api/auth/2fa/setup')).data
}

export async function verify2FAEnroll(code: string): Promise<TwoFAEnrollResult> {
  return (await api.post<TwoFAEnrollResult>('/api/auth/2fa/verify', { code })).data
}

export async function disable2FA(password: string, code: string): Promise<void> {
  await api.post('/api/auth/2fa/disable', { password, code })
}

export async function regenerateRecoveryCodes(code: string): Promise<TwoFAEnrollResult> {
  return (await api.post<TwoFAEnrollResult>('/api/auth/2fa/recovery-codes/regenerate', { code })).data
}

export async function loginStep1(
  email: string,
  password: string,
): Promise<
  | { kind: 'tokens'; access_token: string; refresh_token: string }
  | { kind: 'twofa'; ticket: string }
> {
  const form = new FormData()
  form.append('username', email)
  form.append('password', password)
  const res = await api.post<{
    twofa_required?: boolean
    ticket?: string
    access_token?: string
    refresh_token?: string
  }>('/api/auth/login', form)
  if (res.data.twofa_required) {
    return { kind: 'twofa', ticket: res.data.ticket! }
  }
  return {
    kind: 'tokens',
    access_token: res.data.access_token!,
    refresh_token: res.data.refresh_token!,
  }
}

export async function loginStep2(
  ticket: string,
  code: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const res = await api.post<{ access_token: string; refresh_token: string }>(
    '/api/auth/login/2fa',
    { ticket, code },
  )
  return res.data
}

export async function passwordResetRequest(email: string): Promise<void> {
  await api.post('/api/auth/password-reset/request', { email })
}

export async function passwordResetConfirm(token: string, newPassword: string): Promise<void> {
  await api.post('/api/auth/password-reset/confirm', { token, new_password: newPassword })
}
