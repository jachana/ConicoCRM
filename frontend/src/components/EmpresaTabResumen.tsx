import { useRef } from 'react'
import { Pencil, Upload } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { EmpresaListItem, Empresa } from '../types'
import { Button, Card, CardContent } from './ui'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'

interface Props {
  empresa: EmpresaListItem
  onEdit: (e: Empresa) => void
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card variant="subtle">
      <CardContent className="py-2.5">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
        <div className={`text-sm font-medium ${highlight ? 'text-brand-600 dark:text-brand-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {value || '—'}
        </div>
      </CardContent>
    </Card>
  )
}

export default function EmpresaTabResumen({ empresa, onEdit }: Props) {
  const user = useAuthStore(s => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'subadmin'
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const subirLogo = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post(`/api/empresas/${empresa.id}/logo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa', empresa.id] })
      qc.invalidateQueries({ queryKey: ['empresas'] })
    },
    onError: (e: any) => alert(e?.response?.data?.detail ?? 'Error al subir logo'),
  })

  const eliminarLogo = useMutation({
    mutationFn: () => api.delete(`/api/empresas/${empresa.id}/logo`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa', empresa.id] })
      qc.invalidateQueries({ queryKey: ['empresas'] })
    },
    onError: (e: any) => alert(e?.response?.data?.detail ?? 'Error al quitar logo'),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 mb-4">
        {empresa.has_logo ? (
          <img
            src={`/api/empresas/${empresa.id}/logo`}
            alt="Logo empresa"
            className="h-14 max-w-[140px] object-contain rounded border border-gray-200 dark:border-gray-700 bg-white p-1"
          />
        ) : (
          <div className="h-14 w-[140px] flex items-center justify-center rounded border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-400">
            Sin logo
          </div>
        )}
        {canEdit && (
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Subir logo de empresa"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) subirLogo.mutate(file)
                e.target.value = ''
              }}
            />
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Upload className="w-3.5 h-3.5" />}
              onClick={() => fileRef.current?.click()}
              disabled={subirLogo.isPending || eliminarLogo.isPending}
            >
              {subirLogo.isPending ? 'Subiendo...' : empresa.has_logo ? 'Cambiar logo' : 'Subir logo'}
            </Button>
            {empresa.has_logo && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => eliminarLogo.mutate()}
                disabled={subirLogo.isPending || eliminarLogo.isPending}
                className="text-red-500 hover:text-red-700 dark:text-red-400"
              >
                Quitar logo
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <Field label="RUT" value={empresa.rut ?? '—'} />
          {empresa.rut_no_oficial && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 mt-1">
              RUT no oficial
            </span>
          )}
        </div>
        <Field label="Razón Social" value={empresa.razon_social ?? '—'} />
        <Field label="Sector" value={empresa.sector ?? '—'} />
        <Field label="Plazo de Crédito" value={empresa.plazo_credito ?? '—'} />
        <Field label="Línea de Crédito" value={fmtMoney(empresa.linea_credito)} />
        <Field label="Última Compra" value={fmtDate(empresa.ultima_compra)} highlight />
        <Field label="Email" value={empresa.email ?? '—'} />
        <Field label="Ubicación" value={empresa.ubicacion ?? '—'} />
      </div>
      {empresa.nota_cobranza && (
        <Card variant="subtle">
          <CardContent className="py-2.5">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Nota de Cobranza</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 break-words whitespace-pre-wrap">{empresa.nota_cobranza}</div>
          </CardContent>
        </Card>
      )}
      <div>
        <Button leftIcon={<Pencil />} onClick={() => onEdit(empresa)}>
          Editar empresa
        </Button>
      </div>
    </div>
  )
}
