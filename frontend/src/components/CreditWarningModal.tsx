import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export interface CreditoInfo {
  limite_credito: number
  credito_usado: number
  credito_disponible: number
}

export interface AprobacionPayload {
  empresa_id: number
  total: number
  origen: 'cotizacion' | 'directa'
  cotizacion_id?: number
  nv_payload?: object
}

interface CreditWarningModalProps {
  mode: 'warning' | 'request'
  empresaNombre: string
  credito: CreditoInfo
  saleTotal: number
  // warning mode only:
  onConfirm?: () => void
  // request mode only:
  aprobacionPayload?: AprobacionPayload
  onApproved?: (nvId: number) => void
  onDenied?: () => void
  // both modes:
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
  aprobacionPayload,
  onApproved,
  onDenied,
  onCancel,
}: CreditWarningModalProps) {
  const [requestState, setRequestState] = useState<'form' | 'waiting'>('form')
  const [aprobacionId, setAprobacionId] = useState<number | null>(null)
  const [nota, setNota] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (requestState !== 'waiting' || !aprobacionId) return
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/aprobaciones/${aprobacionId}`)
        const { estado, nv_id } = res.data
        if (estado === 'aprobada' && nv_id) {
          clearInterval(interval)
          onApproved?.(nv_id)
        } else if (estado === 'denegada') {
          clearInterval(interval)
          onDenied?.()
        }
      } catch {
        // ignore poll errors, keep waiting
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [requestState, aprobacionId, onApproved, onDenied])

  async function handleSolicitar() {
    if (!aprobacionPayload) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await api.post('/api/aprobaciones/', {
        ...aprobacionPayload,
        nota: nota || null,
      })
      setAprobacionId(res.data.id)
      setRequestState('waiting')
    } catch (err: any) {
      setSubmitError(err?.response?.data?.detail || 'Error al enviar solicitud')
    } finally {
      setSubmitting(false)
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

        {mode === 'warning' && (
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
        )}

        {mode === 'request' && requestState === 'form' && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Se enviará una solicitud de aprobación al administrador.
            </p>
            <textarea
              placeholder="Nota opcional para el administrador..."
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
            />
            {submitError && (
              <p className="text-xs text-red-600 dark:text-red-400 mb-2">{submitError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSolicitar}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                {submitting ? 'Enviando...' : 'Solicitar Aprobación'}
              </button>
            </div>
          </div>
        )}

        {mode === 'request' && requestState === 'waiting' && (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
              <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Esperando aprobación del administrador...
            </div>
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
