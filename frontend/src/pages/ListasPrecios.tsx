import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ListaPrecios, ListaPreciosUploadResult } from '../types'

type ListPage = { items: ListaPrecios[]; total: number; page: number; page_size: number }

export default function ListasPrecios() {
  const qc = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadResult, setUploadResult] = useState<ListaPreciosUploadResult | null>(null)

  const { data } = useQuery<ListPage>({
    queryKey: ['listas-precios'],
    queryFn: () => api.get('/api/listas-precios/').then(r => r.data),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/listas-precios/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['listas-precios'] }),
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Listas de precios</h1>
        <button
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          onClick={() => setUploadOpen(true)}
        >
          Subir nueva lista
        </button>
      </div>

      {uploadResult && (
        <div className="border rounded p-3 bg-green-50 dark:bg-green-900/20 text-sm">
          <div>Lista {uploadResult.lista_id} subida — {uploadResult.productos_actualizados} productos actualizados.</div>
          {uploadResult.skus_sin_producto.length > 0 && (
            <div className="mt-1 text-yellow-800 dark:text-yellow-300">
              SKUs sin producto en sistema: {uploadResult.skus_sin_producto.join(', ')}
            </div>
          )}
          <div className="text-gray-600 dark:text-gray-400">
            Productos no incluidos: {uploadResult.productos_no_incluidos_count}. Filas inválidas: {uploadResult.filas_invalidas}.
          </div>
          <button className="text-blue-600 underline text-xs mt-1" onClick={() => setUploadResult(null)}>cerrar</button>
        </div>
      )}

      <table className="min-w-full text-sm border border-gray-200 dark:border-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-left">Archivo</th>
            <th className="px-3 py-2 text-right">Items</th>
            <th className="px-3 py-2 text-left">Subida por</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map(lp => (
            <tr key={lp.id} className="border-t border-gray-200 dark:border-gray-700">
              <td className="px-3 py-2">{new Date(lp.fecha_subida).toLocaleString('es-CL')}</td>
              <td className="px-3 py-2">{lp.nombre_archivo}</td>
              <td className="px-3 py-2 text-right">{lp.total_items}</td>
              <td className="px-3 py-2">{lp.subida_por?.nombre ?? '—'}</td>
              <td className="px-3 py-2 text-center">
                {lp.activa
                  ? <span className="px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 text-xs">Activa</span>
                  : <span className="text-gray-500 text-xs">archivada</span>
                }
              </td>
              <td className="px-3 py-2 space-x-2 text-right">
                <a
                  className="text-blue-600 hover:underline text-xs"
                  href={`/api/listas-precios/${lp.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Descargar
                </a>
                {!lp.activa && (
                  <button
                    className="text-red-600 hover:underline text-xs"
                    onClick={() => { if (confirm('Eliminar lista?')) eliminar.mutate(lp.id) }}
                  >
                    Eliminar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSuccess={(res) => {
            setUploadResult(res)
            setUploadOpen(false)
            qc.invalidateQueries({ queryKey: ['listas-precios'] })
          }}
        />
      )}
    </div>
  )
}

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (res: ListaPreciosUploadResult) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [columnaSku, setColumnaSku] = useState('sku')
  const [columnaCosto, setColumnaCosto] = useState('costo')
  const [error, setError] = useState<string | null>(null)

  const subir = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Seleccione un archivo')
      const fd = new FormData()
      fd.append('archivo', file)
      fd.append('columna_sku', columnaSku)
      fd.append('columna_costo', columnaCosto)
      const r = await api.post('/api/listas-precios/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      return r.data as ListaPreciosUploadResult
    },
    onSuccess,
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail ?? String(e))
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-xl max-w-md w-full space-y-3">
        <h2 className="text-lg font-semibold">Subir lista de precios</h2>
        <input
          type="file"
          accept=".xlsx,.csv"
          className="text-sm"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm flex flex-col gap-1">
            Columna SKU
            <input
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              value={columnaSku}
              onChange={e => setColumnaSku(e.target.value)}
            />
          </label>
          <label className="text-sm flex flex-col gap-1">
            Columna Costo
            <input
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              value={columnaCosto}
              onChange={e => setColumnaCosto(e.target.value)}
            />
          </label>
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            disabled={!file || subir.isPending}
            onClick={() => subir.mutate()}
          >
            {subir.isPending ? 'Subiendo...' : 'Subir'}
          </button>
        </div>
      </div>
    </div>
  )
}
