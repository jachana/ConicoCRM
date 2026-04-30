import { useState, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { passwordResetConfirm } from '../api/auth'
import { Button, Input } from '../components/ui'

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (pwd.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (pwd !== pwd2) { setError('Las contraseñas no coinciden.'); return }
    if (!token) { setError('Enlace inválido.'); return }
    setLoading(true)
    try {
      await passwordResetConfirm(token, pwd)
      setDone(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch {
      setError('Enlace inválido o expirado. Solicita uno nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090E1A] relative overflow-hidden px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_60%,rgba(245,158,11,0.06),transparent)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center select-none">
          <div className="inline-flex items-baseline">
            <span className="text-[2.75rem] font-bold text-white tracking-tight leading-none">CO</span>
            <span className="text-[2.75rem] font-bold text-brand-400 tracking-tight leading-none">NI</span>
            <span className="text-[2.75rem] font-bold text-white tracking-tight leading-none">CO</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-white/8 rounded-2xl p-8 shadow-2xl shadow-black/60">
          <h2 className="text-base font-semibold text-white mb-2">Nueva contraseña</h2>
          {done ? (
            <p className="text-xs text-gray-400">
              Contraseña actualizada. Redirigiendo al inicio de sesión...
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="reset-pwd"
                  className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase"
                >
                  Contraseña nueva
                </label>
                <Input
                  id="reset-pwd"
                  type="password"
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  size="lg"
                  className="bg-[#0B1120] border-white/10 text-white rounded-xl placeholder:text-gray-700
                             hover:border-white/20
                             focus:border-brand-500/60 focus:ring-brand-500/20
                             dark:bg-[#0B1120] dark:border-white/10 dark:text-white dark:placeholder:text-gray-700"
                />
              </div>
              <div>
                <label
                  htmlFor="reset-pwd2"
                  className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase"
                >
                  Confirmar
                </label>
                <Input
                  id="reset-pwd2"
                  type="password"
                  value={pwd2}
                  onChange={e => setPwd2(e.target.value)}
                  required
                  autoComplete="new-password"
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
                className="mt-1 rounded-xl bg-brand-500 text-gray-900 font-semibold tracking-wide
                           hover:bg-brand-400 hover:text-gray-900
                           focus-visible:ring-brand-500 focus-visible:ring-offset-[#111827]"
              >
                {loading ? 'Guardando...' : 'Guardar contraseña'}
              </Button>

              <Link
                to="/login"
                className="block text-center text-[11px] text-gray-500 hover:text-gray-300 mt-1"
              >
                Volver
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
