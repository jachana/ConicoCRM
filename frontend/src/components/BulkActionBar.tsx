import { X, FileSpreadsheet } from 'lucide-react'
import { Button } from './ui'

interface BulkActionBarProps {
  selectedCount: number
  onClear: () => void
  onExport: () => void
  isExporting?: boolean
}

export default function BulkActionBar({ selectedCount, onClear, onExport, isExporting }: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-xl shadow-2xl border border-gray-700">
      <span className="text-sm font-medium tabular-nums">
        {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
      </span>
      <div className="w-px h-4 bg-gray-600" />
      <Button
        size="sm"
        variant="ghost"
        className="text-white hover:bg-gray-700 gap-1.5"
        leftIcon={<FileSpreadsheet size={15} />}
        onClick={onExport}
        disabled={isExporting}
      >
        {isExporting ? 'Exportando…' : 'Exportar Excel'}
      </Button>
      <button
        onClick={onClear}
        className="ml-1 p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        aria-label="Limpiar selección"
      >
        <X size={15} />
      </button>
    </div>
  )
}
