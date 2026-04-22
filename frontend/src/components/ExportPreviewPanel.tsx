import { useState, useMemo } from 'react'
import { Download } from 'lucide-react'
import { api } from '../lib/api'
import type { FlatLine, ColDef } from '../types'

interface Props {
  lines: FlatLine[]
  availableColumns: ColDef[]
  isLoading: boolean
  exportBaseUrl: string
  storageKey: string
  filename: string
}

const PREVIEW_CAP = 200

export default function ExportPreviewPanel({
  lines, availableColumns, isLoading, exportBaseUrl, storageKey, filename,
}: Props) {
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        const valid = new Set(availableColumns.map(c => c.key))
        const filtered = parsed.filter(k => valid.has(k))
        if (filtered.length > 0) return filtered
      }
    } catch {}
    return availableColumns.filter(c => c.defaultVisible).map(c => c.key)
  })

  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  function toggleKey(key: string) {
    setVisibleKeys(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }

  const visibleCols = useMemo(
    () => availableColumns.filter(c => visibleKeys.includes(c.key)),
    [availableColumns, visibleKeys],
  )
  const displayRows = useMemo(() => lines.slice(0, PREVIEW_CAP), [lines])

  const docCount = useMemo(() => new Set(lines.map(l => l.numero)).size, [lines])
  const totalNeto = useMemo(() => lines.reduce((s, l) => s + l.total_neto, 0), [lines])
  const margenProm = useMemo(() => {
    const withMargen = lines.filter(l => l.margen != null)
    const base = withMargen.reduce((s, l) => s + l.total_neto, 0)
    if (!base) return null
    return withMargen.reduce((s, l) => s + l.total_neto * l.margen!, 0) / base
  }, [lines])

  async function handleExport() {
    setExportError(null)
    setIsExporting(true)
    try {
      const colParams = visibleKeys.map(k => `columns=${encodeURIComponent(k)}`).join('&')
      const sep = exportBaseUrl.includes('?') ? '&' : '?'
      const url = `${exportBaseUrl}${sep}${colParams}`
      const resp = await api.get(url, { responseType: 'blob' })
      const blob = new Blob([resp.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(a.href), 100)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Documentos', value: String(docCount) },
          { label: 'Líneas',     value: String(lines.length) },
          { label: 'Total neto', value: `$ ${Math.round(totalNeto).toLocaleString('es-CL')}` },
          { label: 'Margen prom.', value: margenProm != null ? `${(margenProm * 100).toFixed(1)}%` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white font-num">{value}</div>
          </div>
        ))}
      </div>

      {/* Column picker */}
      <div className="flex flex-wrap gap-1.5">
        {availableColumns.map(col => {
          const active = visibleKeys.includes(col.key)
          return (
            <button key={col.key} onClick={() => toggleKey(col.key)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                active
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}>
              {active ? '✓ ' : ''}{col.label}
            </button>
          )
        })}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : lines.length === 0 ? (
        <div className="text-gray-400 text-sm py-8 text-center">Sin líneas</div>
      ) : visibleCols.length === 0 ? (
        <div className="text-gray-400 text-sm py-8 text-center">Selecciona al menos una columna</div>
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

      {/* Footer + export */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-gray-400">
          {lines.length > PREVIEW_CAP
            ? `Mostrando ${PREVIEW_CAP} de ${lines.length} líneas — exporta todas`
            : `${lines.length} línea${lines.length !== 1 ? 's' : ''}`}
        </span>
        <div className="flex flex-col items-end gap-1">
          {exportError && (
            <span className="text-xs text-red-500">{exportError}</span>
          )}
          <button onClick={handleExport}
            disabled={isExporting || visibleKeys.length === 0 || lines.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
            <Download size={15} />
            {isExporting ? 'Exportando...' : 'Exportar Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}
