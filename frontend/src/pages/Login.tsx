import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getPreferencias } from '../api/preferencias'
import { usePreferencesStore } from '../stores/preferences'
import { Button, Input } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [twofaTicket, setTwofaTicket] = useState<string | null>(null)
  const [twofaCode, setTwofaCode] = useState('')
  const { login, loginWith2FA } = useAuth()
  const navigate = useNavigate()

  async function loadPreferencesThenGo() {
    try {
      const prefs = await getPreferencias()
      usePreferencesStore.getState().setAll(prefs)
    } catch {
      // keep defaults
    }
    navigate('/')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const r = await login(email, password)
      if (r.kind === 'twofa') {
        setTwofaTicket(r.ticket)
        setTwofaCode('')
      } else {
        await loadPreferencesThenGo()
      }
    } catch {
      setError('Credenciales incorrectas. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function handle2FASubmit(e: FormEvent) {
    e.preventDefault()
    if (!twofaTicket) return
    setError('')
    setLoading(true)
    try {
      await loginWith2FA(twofaTicket, twofaCode.trim())
      await loadPreferencesThenGo()
    } catch {
      setError('Código inválido. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090E1A] relative overflow-hidden px-4">

      {/* Subtle amber grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(245,158,11,1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(245,158,11,1) 1px, transparent 1px)
          `,
          backgroundSize: '56px 56px',
        }}
      />

      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_60%,rgba(245,158,11,0.06),transparent)]" />

      <div className="relative w-full max-w-sm">

        {/* Brand mark */}
        <div className="mb-8 text-center select-none">
          <div className="inline-flex items-baseline">
            <span className="text-[2.75rem] font-bold text-white tracking-tight leading-none">CO</span>
            <span className="text-[2.75rem] font-bold text-brand-400 tracking-tight leading-none">NI</span>
            <span className="text-[2.75rem] font-bold text-white tracking-tight leading-none">CO</span>
          </div>
          <p className="mt-2 text-[11px] text-gray-600 tracking-[0.3em] uppercase font-medium">
            Sistema de Gestión
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#111827] border border-white/8 rounded-2xl p-8 shadow-2xl shadow-black/60">
          {twofaTicket ? (
            <>
              <h2 className="text-base font-semibold text-white mb-2">Verificación en dos pasos</h2>
              <p className="text-xs text-gray-500 mb-5">
                Ingresa el código de 6 dígitos de tu app autenticadora, o uno de tus códigos de recuperación.
              </p>
              <form onSubmit={handle2FASubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="twofa-code"
                    className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase"
                  >
                    Código
                  </label>
                  <Input
                    id="twofa-code"
                    type="text"
                    inputMode="text"
                    autoComplete="one-time-code"
                    value={twofaCode}
                    onChange={e => setTwofaCode(e.target.value)}
                    required
                    placeholder="123456"
                    size="lg"
                    autoFocus
                    className="bg-[#0B1120] border-white/10 text-white rounded-xl placeholder:text-gray-700
                               hover:border-white/20
                               focus:border-brand-500/60 focus:ring-brand-500/20
                               dark:bg-[#0B1120] dark:border-white/10 dark:text-white dark:placeholder:text-gray-700
                               tracking-widest text-center"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 text-xs text-danger-400 bg-danger-950/40 border border-danger-900/50 rounded-lg px-3 py-2.5"
                  >
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  loading={loading}
                  fullWidth
                  size="lg"
                  className="mt-1 rounded-xl bg-brand-500 text-gray-900 font-semibold tracking-wide shadow-none
                             hover:bg-brand-400 hover:text-gray-900 hover:shadow-none
                             active:bg-brand-600 active:text-gray-900
                             focus-visible:ring-brand-500 focus-visible:ring-offset-[#111827] dark:focus-visible:ring-offset-[#111827]"
                >
                  {loading ? 'Verificando...' : 'Verificar'}
                </Button>

                <button
                  type="button"
                  onClick={() => { setTwofaTicket(null); setTwofaCode(''); setError('') }}
                  className="block w-full text-center text-[11px] text-gray-500 hover:text-gray-300 mt-1"
                >
                  Volver
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-white mb-6">Iniciar sesión</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase"
                  >
                    Email
                  </label>
                  <Input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="usuario@conico.cl"
                    size="lg"
                    className="bg-[#0B1120] border-white/10 text-white rounded-xl placeholder:text-gray-700
                               hover:border-white/20
                               focus:border-brand-500/60 focus:ring-brand-500/20
                               dark:bg-[#0B1120] dark:border-white/10 dark:text-white dark:placeholder:text-gray-700"
                  />
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase"
                  >
                    Contraseña
                  </label>
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    size="lg"
                    className="bg-[#0B1120] border-white/10 text-white rounded-xl placeholder:text-gray-700
                               hover:border-white/20
                               focus:border-brand-500/60 focus:ring-brand-500/20
                               dark:bg-[#0B1120] dark:border-white/10 dark:text-white dark:placeholder:text-gray-700"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 text-xs text-danger-400 bg-danger-950/40 border border-danger-900/50 rounded-lg px-3 py-2.5"
                  >
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  loading={loading}
                  fullWidth
                  size="lg"
                  className="mt-1 rounded-xl bg-brand-500 text-gray-900 font-semibold tracking-wide shadow-none
                             hover:bg-brand-400 hover:text-gray-900 hover:shadow-none
                             active:bg-brand-600 active:text-gray-900
                             focus-visible:ring-brand-500 focus-visible:ring-offset-[#111827] dark:focus-visible:ring-offset-[#111827]"
                >
                  {loading ? 'Verificando...' : 'Ingresar'}
                </Button>

                <Link
                  to="/forgot-password"
                  className="block text-center text-[11px] text-gray-500 hover:text-gray-300 mt-1"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-700">
          Conico &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
