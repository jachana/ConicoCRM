import { useState } from 'react'
import { X } from 'lucide-react'
import type { EmpresaListItem, Empresa } from '../types'
import EmpresaTabResumen from './EmpresaTabResumen'
import EmpresaTabFacturas from './EmpresaTabFacturas'
import EmpresaTabProductos from './EmpresaTabProductos'
import EmpresaTabCredito from './EmpresaTabCredito'

type Tab = 'resumen' | 'facturas' | 'productos' | 'credito'

const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen',   label: 'Resumen' },
  { key: 'facturas',  label: 'Facturas' },
  { key: 'productos', label: 'Productos' },
  { key: 'credito',   label: 'Crédito' },
]

interface Props {
  empresa: EmpresaListItem | null
  onClose: () => void
  onEdit: (e: Empresa) => void
}

export default function EmpresaDetailModal({ empresa, onClose, onEdit }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('resumen')

  if (!empresa) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{empresa.nombre}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {[empresa.rut, empresa.sector, empresa.prioridad ? `Prioridad ${empresa.prioridad}` : null]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mt-0.5">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400 bg-white dark:bg-gray-900'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'resumen' && (
            <EmpresaTabResumen empresa={empresa} onEdit={onEdit} />
          )}
          {activeTab === 'facturas' && (
            <EmpresaTabFacturas empresaId={empresa.id} empresaNombre={empresa.nombre} />
          )}
          {activeTab === 'productos' && (
            <EmpresaTabProductos empresaId={empresa.id} empresaNombre={empresa.nombre} />
          )}
          {activeTab === 'credito' && (
            <EmpresaTabCredito empresaId={empresa.id} />
          )}
        </div>
      </div>
    </div>
  )
}
