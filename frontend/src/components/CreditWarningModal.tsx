import { useState } from 'react'
import { api } from '../lib/api'

export interface CreditoInfo {
  limite_credito: number
  credito_usado: number
  credito_disponible: number
}

interface CreditWarningModalProps {
  mode: 'warning' | 'block'
  empresaNombre: string
  credito: CreditoInfo
  saleTotal: number
  onConfirm: () => void
  onCancel: () => void
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

export default function CreditWarningModal({
  mode,
  empresaNombre,
  credito,
  saleTotal,
  onConfirm,
  onCancel,
}: CreditWarningModalProps) {
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [verifying, setVerifying] = useState(false)

  async function handleAuthorize() {
    setVerifying(true)
    setAuthError('')
    try {
      await api.post('/api/auth/verify-admin', { password })
      onConfirm()
    } catch (err: any) {
      setAuthError(err?.response?.data?.detail || 'Error al verificar')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 text-xl font-bold">
            !
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">Límite de crédito excedido</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{empresaNombre}</p>
          </div>
        </div>

        <div className="space-y-2 mb-5 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Límite de crédito</span>
            <span className="font-medium text-gray-900 dark:text-white">{fmtMoney(credito.limite_credito)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Crédito usado</span>
            <span className="font-medium text-red-600 dark:text-red-400">{fmtMoney(credito.credito_usado)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Disponible</span>
            <span className="font-medium text-gray-900 dark:text-white">{fmtMoney(credito.credito_disponible)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
            <span className="text-gray-600 dark:text-gray-400">Esta venta</span>
            <span className="font-semibold text-gray-900 dark:text-white">{fmtMoney(saleTotal)}</span>
          </div>
        </div>

        {mode === 'warning' ? (
          <div className="flex gap-2 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium"
            >
              Guardar de todas formas
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Se requiere autorización de administrador para continuar.
            </p>
            <div className="mb-3">
              <input
                type="password"
                placeholder="Contraseña de administrador"
                value={password}
                onChange={e => { setPassword(e.target.value); setAuthError('') }}
                onKeyDown={e => e.key === 'Enter' && !verifying && password && handleAuthorize()}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              {authError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{authError}</p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAuthorize}
                disabled={verifying || !password}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                {verifying ? 'Verificando...' : 'Autorizar (Admin)'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
