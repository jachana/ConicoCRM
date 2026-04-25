import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listarAuditoria, exportarAuditoriaCsvUrl, type AuditLog, type AuditFiltros } from '../api/auditoria'
import { useAuthStore } from '../stores/auth'

const ENTITY_OPTIONS = [
  '', 'Cotizacion', 'NotaVenta', 'Factura', 'NotaCredito', 'NotaDebito',
  'Producto', 'ListaPrecios', 'Empresa', 'Cliente', 'User',
  'PermissionOverride', 'SystemConfig',
]
const ACTION_OPTIONS = ['', 'create', 'update', 'delete']

const PAGE_SIZE = 50

function fmtDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AdminAuditoria() {
  const accessToken = useAuthStore(s => s.accessToken)
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'
  const [filtros, setFiltros] = useState<AuditFiltros>({ limit: PAGE_SIZE, offset: 0 })
  const [diffViewing, setDiffViewing] = useState<AuditLog | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['auditoria', filtros],
    queryFn: () => listarAuditoria(filtros),
    enabled: isAdmin,
  })

  const items: AuditLog[] = data?.items ?? []
  const total = data?.total ?? 0
  const errorMsg = isError
    ? (() => {
        const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
        return typeof detail === 'string' ? detail : 'Error al cargar auditoría'
      })()
    : null

  function setFiltro<K extends keyof AuditFiltros>(k: K, v: AuditFiltros[K]) {
    setFiltros(prev => ({ ...prev, [k]: v, offset: 0 }))
  }

  function descargarCsv() {
    const url = exportarAuditoriaCsvUrl({
      ...filtros,
      limit: undefined,
      offset: undefined,
    })
    // Download via fetch + blob to attach Bearer token.
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.blob())
      .then(b => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(b)
        link.download = 'auditoria.csv'
        link.click()
        URL.revokeObjectURL(link.href)
      })
  }

  const offset = filtros.offset ?? 0
  const limit = filtros.limit ?? PAGE_SIZE
  const lastPageOffset = Math.max(0, Math.floor((total - 1) / limit) * limit)

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Auditoría</h1>
        <div className="bg-red-100 text-red-700 p-3 rounded">
          No tienes permiso para acceder a esta sección.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Auditoría</h1>
        <button
          onClick={descargarCsv}
          className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded"
        >
          Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <select
          value={filtros.entity_type ?? ''}
          onChange={e => setFiltro('entity_type', e.target.value || undefined)}
          className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800"
          aria-label="Entidad"
        >
          {ENTITY_OPTIONS.map(o => (
            <option key={o} value={o}>{o || 'Todas las entidades'}</option>
          ))}
        </select>

        <select
          value={filtros.action ?? ''}
          onChange={e => setFiltro('action', e.target.value || undefined)}
          className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800"
          aria-label="Acción"
        >
          {ACTION_OPTIONS.map(o => (
            <option key={o} value={o}>{o || 'Todas las acciones'}</option>
          ))}
        </select>

        <input
          type="number"
          placeholder="user_id"
          value={filtros.user_id ?? ''}
          onChange={e => setFiltro('user_id', e.target.value ? Number(e.target.value) : undefined)}
          className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800"
          aria-label="Usuario"
        />

        <input
          type="text"
          placeholder="entity_id"
          value={filtros.entity_id ?? ''}
          onChange={e => setFiltro('entity_id', e.target.value || undefined)}
          className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800"
          aria-label="ID de entidad"
        />

        <input
          type="date"
          value={filtros.from_date ?? ''}
          onChange={e => setFiltro('from_date', e.target.value || undefined)}
          className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800"
          aria-label="Desde"
        />
        <input
          type="date"
          value={filtros.to_date ?? ''}
          onChange={e => setFiltro('to_date', e.target.value || undefined)}
          className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800"
          aria-label="Hasta"
        />
      </div>

      {errorMsg && <div className="bg-red-100 text-red-700 p-2 rounded mb-3">{errorMsg}</div>}

      {/* Tabla */}
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/40">
            <tr>
              <th className="text-left px-3 py-2">Timestamp</th>
              <th className="text-left px-3 py-2">Usuario</th>
              <th className="text-left px-3 py-2">Acción</th>
              <th className="text-left px-3 py-2">Entidad</th>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">IP</th>
              <th className="text-left px-3 py-2">Diff</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">Cargando…</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">Sin registros</td></tr>
            )}
            {items.map(it => (
              <tr key={it.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(it.created_at)}</td>
                <td className="px-3 py-2">{it.user_name ?? (it.user_id ? `#${it.user_id}` : 'Sistema')}</td>
                <td className="px-3 py-2">{it.action}</td>
                <td className="px-3 py-2">{it.entity_type}</td>
                <td className="px-3 py-2">{it.entity_id}</td>
                <td className="px-3 py-2">{it.ip ?? ''}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => setDiffViewing(it)}
                    className="text-brand-600 hover:underline text-xs"
                  >
                    Ver diff
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between mt-3 text-sm">
        <span className="text-gray-500">
          {total} registros · página {Math.floor(offset / limit) + 1} de {Math.max(1, Math.floor(lastPageOffset / limit) + 1)}
        </span>
        <div className="flex gap-2">
          <button
            disabled={offset <= 0}
            onClick={() => setFiltros(f => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - limit) }))}
            className="px-2 py-1 border rounded disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            disabled={offset + limit >= total}
            onClick={() => setFiltros(f => ({ ...f, offset: (f.offset ?? 0) + limit }))}
            className="px-2 py-1 border rounded disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* Modal diff */}
      {diffViewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDiffViewing(null)}>
          <div
            className="bg-white dark:bg-gray-900 rounded p-4 max-w-3xl max-h-[80vh] overflow-auto w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">
                Diff · {diffViewing.entity_type} #{diffViewing.entity_id} · {diffViewing.action}
              </h2>
              <button onClick={() => setDiffViewing(null)} className="text-gray-500 hover:text-gray-700">Cerrar</button>
            </div>
            <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto whitespace-pre-wrap">
              {JSON.stringify(diffViewing.diff_json, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
