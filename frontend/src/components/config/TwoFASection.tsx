import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldCheck, Copy } from 'lucide-react'
import {
  disable2FA,
  get2FAStatus,
  regenerateRecoveryCodes,
  setup2FA,
  verify2FAEnroll,
  type TwoFASetup,
} from '../../api/auth'
import { Button, Card, FormField, Input } from '../ui'

type EnrollState =
  | { phase: 'idle' }
  | { phase: 'setup'; data: TwoFASetup; code: string; loading: boolean; error: string }
  | { phase: 'codes'; codes: string[] }

export default function TwoFASection() {
  const qc = useQueryClient()
  const { data: status, isLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: get2FAStatus,
  })
  const enabled = !!status?.enabled

  const [enroll, setEnroll] = useState<EnrollState>({ phase: 'idle' })
  const [showDisable, setShowDisable] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disableError, setDisableError] = useState('')
  const [disableLoading, setDisableLoading] = useState(false)
  const [showRegen, setShowRegen] = useState(false)
  const [regenCode, setRegenCode] = useState('')
  const [regenError, setRegenError] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)

  async function startEnroll() {
    try {
      const data = await setup2FA()
      setEnroll({ phase: 'setup', data, code: '', loading: false, error: '' })
    } catch {
      toast.error('No se pudo iniciar el setup de 2FA')
    }
  }

  async function confirmEnroll() {
    if (enroll.phase !== 'setup') return
    setEnroll({ ...enroll, loading: true, error: '' })
    try {
      const result = await verify2FAEnroll(enroll.code.trim())
      setEnroll({ phase: 'codes', codes: result.recovery_codes })
      qc.invalidateQueries({ queryKey: ['2fa-status'] })
      toast.success('2FA activado')
    } catch {
      setEnroll({ ...enroll, loading: false, error: 'Código inválido' })
    }
  }

  async function handleDisable() {
    setDisableError('')
    setDisableLoading(true)
    try {
      await disable2FA(disablePassword, disableCode.trim())
      toast.success('2FA desactivado')
      setShowDisable(false)
      setDisablePassword('')
      setDisableCode('')
      qc.invalidateQueries({ queryKey: ['2fa-status'] })
    } catch {
      setDisableError('Contraseña o código incorrecto')
    } finally {
      setDisableLoading(false)
    }
  }

  async function handleRegen() {
    setRegenError('')
    setRegenLoading(true)
    try {
      const r = await regenerateRecoveryCodes(regenCode.trim())
      setEnroll({ phase: 'codes', codes: r.recovery_codes })
      setShowRegen(false)
      setRegenCode('')
      toast.success('Nuevos códigos generados')
    } catch {
      setRegenError('Código inválido')
    } finally {
      setRegenLoading(false)
    }
  }

  function copyCodes(codes: string[]) {
    navigator.clipboard.writeText(codes.join('\n'))
    toast.success('Códigos copiados')
  }

  if (isLoading) {
    return (
      <Card padded>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Verificación en dos pasos</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Cargando...</p>
      </Card>
    )
  }

  return (
    <Card padded>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Verificación en dos pasos (2FA)
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Agrega un código de 6 dígitos generado por una app autenticadora (Google Authenticator, 1Password, Authy) al iniciar sesión.
          </p>
        </div>
        <span
          className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${
            enabled
              ? 'bg-success-100 text-success-700 dark:bg-success-950 dark:text-success-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          {enabled ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {enroll.phase === 'codes' && (
        <RecoveryCodesPanel codes={enroll.codes} onClose={() => setEnroll({ phase: 'idle' })} onCopy={copyCodes} />
      )}

      {enroll.phase === 'setup' && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Escanea este QR en tu app autenticadora y luego ingresa el código de 6 dígitos.
          </p>
          <div className="flex flex-col items-center gap-3">
            <img
              alt="QR 2FA"
              src={`data:image/png;base64,${enroll.data.qr_png_base64}`}
              className="w-44 h-44 bg-white p-2 rounded"
            />
            <div className="text-[11px] text-gray-500 dark:text-gray-400 select-all break-all max-w-full text-center">
              <span className="font-mono">{enroll.data.secret}</span>
            </div>
          </div>
          <FormField label="Código de 6 dígitos">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={enroll.code}
              onChange={e => setEnroll({ ...enroll, code: e.target.value })}
              placeholder="123456"
              autoComplete="one-time-code"
            />
          </FormField>
          {enroll.error && (
            <p role="alert" className="text-xs text-danger-600 dark:text-danger-400">{enroll.error}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setEnroll({ phase: 'idle' })}>Cancelar</Button>
            <Button onClick={confirmEnroll} disabled={enroll.loading || enroll.code.length !== 6}>
              {enroll.loading ? 'Verificando...' : 'Activar 2FA'}
            </Button>
          </div>
        </div>
      )}

      {enroll.phase === 'idle' && !enabled && (
        <Button onClick={startEnroll} size="sm">Activar 2FA</Button>
      )}

      {enroll.phase === 'idle' && enabled && !showDisable && !showRegen && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowRegen(true)}>
            Regenerar códigos de recuperación
          </Button>
          <Button size="sm" variant="danger" onClick={() => setShowDisable(true)}>
            Desactivar 2FA
          </Button>
        </div>
      )}

      {showDisable && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mt-3 space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Confirma tu contraseña y un código (6 dígitos o de recuperación).
          </p>
          <FormField label="Contraseña">
            <Input type="password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} autoComplete="current-password" />
          </FormField>
          <FormField label="Código">
            <Input type="text" value={disableCode} onChange={e => setDisableCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" />
          </FormField>
          {disableError && (
            <p role="alert" className="text-xs text-danger-600 dark:text-danger-400">{disableError}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => { setShowDisable(false); setDisableError('') }}>Cancelar</Button>
            <Button variant="danger" onClick={handleDisable} disabled={disableLoading || !disablePassword || disableCode.length < 6}>
              {disableLoading ? 'Desactivando...' : 'Desactivar'}
            </Button>
          </div>
        </div>
      )}

      {showRegen && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mt-3 space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Ingresa un código actual de tu app para generar nuevos códigos de recuperación. Los anteriores quedarán inválidos.
          </p>
          <FormField label="Código de 6 dígitos">
            <Input type="text" value={regenCode} onChange={e => setRegenCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" />
          </FormField>
          {regenError && (
            <p role="alert" className="text-xs text-danger-600 dark:text-danger-400">{regenError}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => { setShowRegen(false); setRegenError('') }}>Cancelar</Button>
            <Button onClick={handleRegen} disabled={regenLoading || regenCode.length !== 6}>
              {regenLoading ? 'Generando...' : 'Regenerar'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function RecoveryCodesPanel({
  codes,
  onClose,
  onCopy,
}: {
  codes: string[]
  onClose: () => void
  onCopy: (codes: string[]) => void
}) {
  return (
    <div className="border border-warning-300 dark:border-warning-800 bg-warning-50 dark:bg-warning-950/40 rounded-lg p-4 mb-3 space-y-3">
      <div>
        <p className="text-xs font-semibold text-warning-800 dark:text-warning-300">
          Guarda estos códigos en un lugar seguro
        </p>
        <p className="text-[11px] text-warning-700 dark:text-warning-400 mt-1">
          Cada código sólo sirve una vez. Si pierdes acceso a tu app autenticadora, podrás iniciar sesión con uno de ellos. Esta es la única vez que se mostrarán.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-gray-800 dark:text-gray-200">
        {codes.map(c => <span key={c}>{c}</span>)}
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" leftIcon={<Copy className="w-3.5 h-3.5" />} onClick={() => onCopy(codes)}>
          Copiar
        </Button>
        <Button size="sm" onClick={onClose}>He guardado los códigos</Button>
      </div>
    </div>
  )
}
