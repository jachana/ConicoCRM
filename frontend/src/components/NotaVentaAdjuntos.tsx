import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { NotaVentaAdjunto } from '../types'

const MAX_DOCS = 10
const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

export default function NotaVentaAdjuntos({ nvId, disabled = false }: { nvId: number; disabled?: boolean }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null)

  const { data: docs = [], isLoading } = useQuery<NotaVentaAdjunto[]>({
    queryKey: ['nv-adjuntos', nvId],
    queryFn: () => api.get(`/api/nota_ventas/${nvId}/adjuntos/`).then(r => r.data),
  })

  const subir = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post(`/api/nota_ventas/${nvId}/adjuntos/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nv-adjuntos', nvId] }),
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error al subir'),
  })

  const eliminar = useMutation({
    mutationFn: (docId: number) => api.delete(`/api/nota_ventas/${nvId}/adjuntos/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nv-adjuntos', nvId] }),
  })

  function descargar(doc: NotaVentaAdjunto) {
    api.get(`/api/nota_ventas/${nvId}/adjuntos/${doc.id}/download`, { responseType: 'blob' })
      .then(r => {
        const url = URL.createObjectURL(r.data)
        const a = document.createElement('a')
        a.href = url; a.download = doc.nombre; a.click()
        URL.revokeObjectURL(url)
      })
  }

  if (isLoading) return <div className="text-sm text-gray-400">Cargando adjuntos…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{docs.length}/{MAX_DOCS} adjuntos</span>
        {!disabled && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={docs.length >= MAX_DOCS}
            className="px-3 py-1.5 text-xs bg-info-600 hover:bg-info-700 disabled:opacity-40 text-white rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Subir archivo
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) subir.mutate(f); e.target.value = '' }}
        />
      </div>
      {docs.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Sin adjuntos</p>
      )}
      <ul className="space-y-2">
        {docs.map(doc => (
          <li key={doc.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
            <div className="min-w-0 flex-1 pr-3">
              <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{doc.nombre}</div>
              <div className="text-xs text-gray-400">
                {new Date(doc.subido_en).toLocaleDateString('es-CL')} · {doc.mime_type}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => descargar(doc)} className="text-info-600 hover:underline text-xs">Descargar</button>
              {!disabled && (confirmandoId === doc.id ? (
                <span className="flex items-center gap-1 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>
                  <button onClick={() => { eliminar.mutate(doc.id); setConfirmandoId(null) }} className="text-danger-500 hover:underline">Sí</button>
                  <button onClick={() => setConfirmandoId(null)} className="text-gray-500 hover:underline">No</button>
                </span>
              ) : (
                <button onClick={() => setConfirmandoId(doc.id)} className="text-danger-500 hover:underline text-xs">Eliminar</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
