import { useState } from 'react'
import type { BoletaListItem } from '../api/boletas'

interface Props {
  boleta: BoletaListItem
  onCancel: () => void
  onConfirm: (email: string) => void
  isPending: boolean
  error: string | null
}

export default function BoletaEmailModal({ boleta, onCancel, onConfirm, isPending, error }: Props) {
  const [email, setEmail] = useState('')
  const canSubmit = /\S+@\S+\.\S+/.test(email) && !isPending
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
          Enviar boleta {String(boleta.numero).padStart(5, '0')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No hay email asociado. Ingresa el destinatario.</p>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
        <input
          autoFocus
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(email)}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50"
          >
            {isPending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
