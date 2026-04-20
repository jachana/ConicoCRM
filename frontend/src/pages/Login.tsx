import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('Credenciales incorrectas. Intenta de nuevo.')
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
          <h2 className="text-base font-semibold text-white mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="usuario@conico.cl"
                className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm
                           placeholder-gray-700 transition-colors
                           focus:outline-none focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm
                           placeholder-gray-700 transition-colors
                           focus:outline-none focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2.5">
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-1 bg-brand-500 hover:bg-brand-400 active:bg-brand-600
                         text-gray-900 font-semibold text-sm rounded-xl tracking-wide
                         disabled:opacity-50 transition-all duration-150"
            >
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-700">
          Conico &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
