import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  saving?: boolean
  onSaveAndContinue: () => void
  onDiscardAndContinue: () => void
  onCancel: () => void
  docType?: 'cotizacion' | 'nv'
}

export default function UnsavedChangesModal({
  open, saving, onSaveAndContinue, onDiscardAndContinue, onCancel, docType = 'cotizacion'
}: Props) {
  if (!open) return null
  const label = docType === 'nv' ? 'La nota de venta' : 'La cotización'
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Cambios sin guardar
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {label} tiene cambios que no han sido guardados.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveAndContinue}
            disabled={saving}
            className="w-full px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar y continuar'}
          </button>
          <button
            onClick={onDiscardAndContinue}
            disabled={saving}
            className="w-full px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            Descartar cambios
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
