import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { passwordResetRequest } from '../api/auth'
import { Button, Input } from '../components/ui'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await passwordResetRequest(email.trim())
    } catch {
      // Always treat as success — server returns 204 even for unknown emails.
    } finally {
      setLoading(false)
      setSubmitted(true)
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
          <h2 className="text-base font-semibold text-white mb-2">Restablecer contraseña</h2>
          {submitted ? (
            <>
              <p className="text-xs text-gray-400 mb-5">
                Si la dirección está registrada, recibirás un correo con un enlace para crear una nueva contraseña.
              </p>
              <Link
                to="/login"
                className="block text-center text-xs text-brand-400 hover:text-brand-300"
              >
                Volver al inicio de sesión
              </Link>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-5">
                Ingresa tu correo y te enviaremos un enlace para restablecer la contraseña.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase"
                  >
                    Email
                  </label>
                  <Input
                    id="forgot-email"
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
                <Button
                  type="submit"
                  loading={loading}
                  fullWidth
                  size="lg"
                  className="mt-1 rounded-xl bg-brand-500 text-gray-900 font-semibold tracking-wide
                             hover:bg-brand-400 hover:text-gray-900
                             focus-visible:ring-brand-500 focus-visible:ring-offset-[#111827]"
                >
                  {loading ? 'Enviando...' : 'Enviar enlace'}
                </Button>
                <Link
                  to="/login"
                  className="block text-center text-[11px] text-gray-500 hover:text-gray-300 mt-1"
                >
                  Volver
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
