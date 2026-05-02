import { useState } from 'react'
import type { DteRecepcionRead } from '../api/dte_recepcion'

interface Props {
  dteRecepcion: DteRecepcionRead
  onCancel: () => void
  onConfirm: (motivo: string) => void
  isPending: boolean
  error: string | null
}

export default function DteRecepcionRechazarModal({
  dteRecepcion,
  onCancel,
  onConfirm,
  isPending,
  error,
}: Props) {
  const [motivo, setMotivo] = useState('')
  const canSubmit = motivo.trim().length > 0 && !isPending

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
          Rechazar DTE Folio {dteRecepcion.folio}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Especifica el motivo del rechazo. Esta acción no se puede deshacer.
        </p>
        <label
          htmlFor="dte-rechazar-motivo"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Motivo *
        </label>
        <textarea
          id="dte-rechazar-motivo"
          autoFocus
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          rows={3}
          aria-invalid={!!error}
          aria-describedby={error ? 'dte-rechazar-motivo-error' : undefined}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="Ej: Datos incorrectos, documentación incompleta, etc."
        />
        {error && (
          <p id="dte-rechazar-motivo-error" className="text-sm text-danger-500 mt-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(motivo.trim())}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-sm bg-danger-600 hover:bg-danger-700 text-white rounded-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
          >
            {isPending ? 'Rechazando...' : 'Rechazar'}
          </button>
        </div>
      </div>
    </div>
  )
}
