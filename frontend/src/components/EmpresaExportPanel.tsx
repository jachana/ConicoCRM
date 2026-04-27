import { useState, useMemo, useEffect } from 'react'
import { Download, Mail, MessageCircle } from 'lucide-react'
import { api } from '../lib/api'
import type { GenericColDef } from '../types'

interface Props<T> {
  rows: T[]
  colDefs: GenericColDef<T>[]
  isLoading: boolean
  exportBaseUrl: string
  storageKey: string
  filename: string
}

const PREVIEW_CAP = 200

export default function EmpresaExportPanel<T>({
  rows, colDefs, isLoading, exportBaseUrl, storageKey, filename,
}: Props<T>) {
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        const valid = new Set(colDefs.map(c => c.key))
        const filtered = parsed.filter(k => valid.has(k))
        if (filtered.length > 0) return filtered
      }
    } catch {}
    return colDefs.filter(c => c.defaultVisible).map(c => c.key)
  })

  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  function toggleKey(key: string) {
    setVisibleKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  // Persist visible keys to localStorage whenever they change
  // (outside state updater to avoid double-writes in StrictMode)
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleKeys))
  }, [storageKey, visibleKeys])

  const visibleCols = useMemo(() => colDefs.filter(c => visibleKeys.includes(c.key)), [colDefs, visibleKeys])
  const displayRows = useMemo(() => rows.slice(0, PREVIEW_CAP), [rows])

  async function handleExport(format: 'xlsx' | 'csv' | 'pdf') {
    setExportError(null)
    setIsExporting(true)
    try {
      const colParams = visibleKeys.map(k => `columns=${encodeURIComponent(k)}`).join('&')
      const sep = exportBaseUrl.includes('?') ? '&' : '?'
      const url = `${exportBaseUrl}${sep}format=${format}&${colParams}`
      const mimeTypes = {
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv',
        pdf: 'application/pdf',
      }
      const resp = await api.get(url, { responseType: 'blob' })
      const ext = format
      const blob = new Blob([resp.data], { type: mimeTypes[format] })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename.replace(/\.[^.]+$/, '') + '.' + ext
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Column picker */}
      <div className="flex flex-wrap gap-1.5">
        {colDefs.map(col => {
          const active = visibleKeys.includes(col.key)
          return (
            <button key={col.key} onClick={() => toggleKey(col.key)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                active
                  ? 'bg-info-100 dark:bg-info-900/40 text-info-700 dark:text-info-300 border-info-300 dark:border-info-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}>
              {active ? '✓ ' : ''}{col.label}
            </button>
          )
        })}
      </div>

      {/* Preview table */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-6 text-center">Cargando...</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-400 text-sm py-6 text-center">Sin datos</div>
      ) : visibleCols.length === 0 ? (
        <div className="text-gray-400 text-sm py-6 text-center">Selecciona al menos una columna</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="text-xs w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <tr>
                {visibleCols.map(col => (
                  <th key={col.key} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {displayRows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {visibleCols.map(col => (
                    <td key={col.key} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {col.getValue(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <span className="text-xs text-gray-400">
          {rows.length > PREVIEW_CAP
            ? `Mostrando ${PREVIEW_CAP} de ${rows.length} filas — exporta todas`
            : `${rows.length} fila${rows.length !== 1 ? 's' : ''}`}
        </span>
        <div className="flex flex-col items-end gap-1">
          {exportError && <span className="text-xs text-danger-500">{exportError}</span>}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => handleExport('xlsx')}
              disabled={isExporting || visibleKeys.length === 0 || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-success-600 hover:bg-success-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
              <Download size={13} />
              Excel
            </button>
            <button onClick={() => handleExport('csv')}
              disabled={isExporting || visibleKeys.length === 0 || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-info-600 hover:bg-info-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
              <Download size={13} />
              CSV
            </button>
            <button onClick={() => handleExport('pdf')}
              disabled={isExporting || visibleKeys.length === 0 || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-danger-600 hover:bg-danger-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
              <Download size={13} />
              PDF
            </button>
            <button disabled title="Pendiente de implementación"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-300 dark:bg-gray-700 opacity-50 text-gray-500 dark:text-gray-400 text-xs font-semibold rounded-lg cursor-not-allowed">
              <Mail size={13} />
              Email
            </button>
            <button disabled title="Pendiente de implementación"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-300 dark:bg-gray-700 opacity-50 text-gray-500 dark:text-gray-400 text-xs font-semibold rounded-lg cursor-not-allowed">
              <MessageCircle size={13} />
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
