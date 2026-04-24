import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ProductoDocumento } from '../types'

const MAX_DOCS = 5

export default function ProductoDocumentos({ productoId }: { productoId: number }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null)

  const { data: docs = [], isLoading } = useQuery<ProductoDocumento[]>({
    queryKey: ['producto-documentos', productoId],
    queryFn: () => api.get(`/api/productos/${productoId}/documentos/`).then(r => r.data),
  })

  const subir = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post(`/api/productos/${productoId}/documentos/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['producto-documentos', productoId] }),
    onError: (e: any) => alert(e?.response?.data?.detail ?? 'Error al subir'),
  })

  const eliminar = useMutation({
    mutationFn: (docId: number) => api.delete(`/api/productos/${productoId}/documentos/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['producto-documentos', productoId] }),
  })

  function descargar(doc: ProductoDocumento) {
    api.get(`/api/productos/${productoId}/documentos/${doc.id}/download`, { responseType: 'blob' })
      .then(r => {
        const url = URL.createObjectURL(r.data)
        const a = document.createElement('a')
        a.href = url; a.download = doc.nombre; a.click()
        URL.revokeObjectURL(url)
      })
  }

  if (isLoading) return <div className="text-sm text-gray-400">Cargando...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{docs.length}/{MAX_DOCS} documentos</span>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={docs.length >= MAX_DOCS}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg"
        >
          Subir PDF
        </button>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) subir.mutate(f); e.target.value = '' }} />
      </div>
      {docs.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Sin documentos adjuntos</p>
      )}
      <ul className="space-y-2">
        {docs.map(doc => (
          <li key={doc.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
            <div>
              <div className="font-medium text-gray-800 dark:text-gray-200">{doc.nombre}</div>
              <div className="text-xs text-gray-400">{new Date(doc.subido_en).toLocaleDateString('es-CL')}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => descargar(doc)} className="text-blue-600 hover:underline text-xs">Descargar</button>
              {confirmandoId === doc.id ? (
                <span className="flex items-center gap-1 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>
                  <button onClick={() => { eliminar.mutate(doc.id); setConfirmandoId(null) }} className="text-red-500 hover:underline">Sí</button>
                  <button onClick={() => setConfirmandoId(null)} className="text-gray-500 hover:underline">No</button>
                </span>
              ) : (
                <button onClick={() => setConfirmandoId(doc.id)} className="text-red-500 hover:underline text-xs">Eliminar</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
