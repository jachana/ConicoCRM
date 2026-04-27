// frontend/src/components/CreditWarningModal.tsx
import { useState } from 'react'
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
  onConfirm?: () => void
  aprobacionPayload?: AprobacionPayload
  onSubmitted?: () => void
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
  onSubmitted,
  onCancel,
}: CreditWarningModalProps) {
  const [nota, setNota] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleSolicitar() {
    if (!aprobacionPayload) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await api.post('/api/aprobaciones/', { ...aprobacionPayload, nota: nota || null })
      onSubmitted?.()
      onCancel()
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
          <div className="w-10 h-10 rounded-full bg-danger-100 dark:bg-danger-900/30 flex items-center justify-center text-danger-600 dark:text-danger-400 text-xl font-bold">
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
            <span className="font-medium text-danger-600 dark:text-danger-400">{fmtMoney(credito.credito_usado)}</span>
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
            <button onClick={onCancel}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancelar
            </button>
            <button onClick={onConfirm}
              className="px-4 py-2 text-sm bg-warning-500 hover:bg-warning-600 text-white rounded-lg transition-colors font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              Guardar de todas formas
            </button>
          </div>
        )}

        {mode === 'request' && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Se enviará una solicitud de aprobación al administrador. Podrás revisar el estado desde esta cotización.
            </p>
            <textarea
              placeholder="Nota opcional para el administrador..."
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-info-500 resize-none mb-3"
            />
            {submitError && <p className="text-xs text-danger-600 dark:text-danger-400 mb-2">{submitError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={onCancel}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSolicitar} disabled={submitting}
                className="px-4 py-2 text-sm bg-info-600 hover:bg-info-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                {submitting ? 'Enviando...' : 'Solicitar Aprobación'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
