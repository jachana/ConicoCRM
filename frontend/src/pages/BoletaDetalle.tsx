import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileText, Mail, Trash2 } from 'lucide-react'
import {
  getBoleta,
  enviarEmailBoleta,
  anularBoleta,
  type Boleta,
  type BoletaListItem,
} from '../api/boletas'
import { openPdf } from '../lib/pdf'
import DteBadge from '../components/DteBadge'
import BoletaAnularModal from '../components/BoletaAnularModal'
import BoletaEmailModal from '../components/BoletaEmailModal'

const ESTADO_COLORS: Record<string, string> = {
  emitida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  anulada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  otro: 'Otro',
}

function fmtMoney(n: number | string | null | undefined) {
  return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  // Accepts both date-only and full ISO timestamps
  const d = iso.length <= 10 ? new Date(iso + 'T00:00:00') : new Date(iso)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function toListItem(b: Boleta): BoletaListItem {
  return {
    id: b.id, numero: b.numero, fecha: b.fecha, tipo_dte: b.tipo_dte,
    cliente_id: b.cliente_id ?? null, nombre_receptor: b.nombre_receptor ?? null,
    patente_vehiculo: b.patente_vehiculo ?? null, metodo_pago: b.metodo_pago,
    total: b.total, estado: b.estado, dte_estado: b.dte_estado,
    cliente: b.cliente ?? null, vendedor: b.vendedor ?? null,
  }
}

export default function BoletaDetalle() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [showAnular, setShowAnular] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const boletaId = id ? Number(id) : 0

  const { data: boleta, isLoading, isError } = useQuery<Boleta>({
    queryKey: ['boleta', boletaId],
    queryFn: () => getBoleta(boletaId),
    enabled: !!boletaId,
    refetchInterval: (query) => {
      const d = query.state.data as Boleta | undefined
      if (d && (d.dte_estado === 'pendiente' || d.dte_estado === 'procesando')) return 10_000
      return false
    },
  })

  const anularMut = useMutation({
    mutationFn: (razon: string) => anularBoleta(boletaId, razon),
    onSuccess: () => {
      showToast('Boleta anulada')
      setShowAnular(false)
      qc.invalidateQueries({ queryKey: ['boleta', boletaId] })
      qc.invalidateQueries({ queryKey: ['boletas-list'] })
    },
  })

  const emailMut = useMutation({
    mutationFn: (email?: string) => enviarEmailBoleta(boletaId, email),
    onSuccess: () => {
      showToast('Email enviado')
      setShowEmail(false)
      qc.invalidateQueries({ queryKey: ['boleta', boletaId] })
    },
  })

  function handleSendEmail() {
    // If there's an associated email, just send; otherwise prompt via modal.
    if (boleta?.email_envio || boleta?.cliente) {
      emailMut.mutate(undefined, {
        onError: (err: unknown) => {
          const e = err as { response?: { status?: number } }
          if (e?.response?.status === 422) setShowEmail(true)
          else showToast('Error al enviar email', false)
        },
      })
    } else {
      setShowEmail(true)
    }
  }

  function handleDownloadPdf() {
    openPdf(`/api/boletas/${boletaId}/pdf`).catch(() => showToast('Error al abrir PDF', false))
  }

  if (isLoading) {
    return <div className="p-6 text-gray-400 text-sm">Cargando...</div>
  }

  if (isError || !boleta) {
    return (
      <div className="p-6">
        <Link to="/boletas" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mb-4">
          <ArrowLeft size={16} /> Volver a boletas
        </Link>
        <div className="text-gray-400 text-sm">No se encontró la boleta</div>
      </div>
    )
  }

  const receptorNombre = boleta.cliente?.nombre ?? boleta.nombre_receptor ?? 'Consumidor Final'
  const receptorRut = boleta.cliente?.rut ?? boleta.rut_receptor ?? null
  const canAnular = boleta.estado !== 'anulada'
  // TODO: backend does not expose per-boleta XML; add "Ver XML raw" drawer when endpoint is available.

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => navigate('/boletas')}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Boleta N° {String(boleta.numero).padStart(5, '0')}
          </h1>
          <span className="text-xs text-gray-500 dark:text-gray-400">Tipo {boleta.tipo_dte}</span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_COLORS[boleta.estado] ?? 'bg-gray-100 text-gray-700'}`}>
            {boleta.estado}
          </span>
          <DteBadge estado={boleta.dte_estado} />
          {boleta.folio_sii != null && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Folio SII: <span className="font-num text-gray-700 dark:text-gray-300">{boleta.folio_sii}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownloadPdf}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <FileText size={15} /> Descargar PDF
          </button>
          <button onClick={handleSendEmail} disabled={emailMut.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
            <Mail size={15} /> {emailMut.isPending ? 'Enviando...' : 'Enviar email'}
          </button>
          {canAnular && (
            <button onClick={() => setShowAnular(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-red-300 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <Trash2 size={15} /> Anular
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Receptor + líneas */}
        <div className="lg:col-span-2 space-y-4">
          {/* Receptor */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Receptor</h2>
            <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
              <dt className="text-gray-500 dark:text-gray-400">Nombre</dt>
              <dd className="text-gray-900 dark:text-white">{receptorNombre}</dd>
              <dt className="text-gray-500 dark:text-gray-400">RUT</dt>
              <dd className="text-gray-900 dark:text-white">{receptorRut ?? '—'}</dd>
              {boleta.patente_vehiculo && (
                <>
                  <dt className="text-gray-500 dark:text-gray-400">Patente vehículo</dt>
                  <dd className="text-gray-900 dark:text-white font-num">{boleta.patente_vehiculo}</dd>
                </>
              )}
              {boleta.email_envio && (
                <>
                  <dt className="text-gray-500 dark:text-gray-400">Email envío</dt>
                  <dd className="text-gray-900 dark:text-white">{boleta.email_envio}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Líneas */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-3 font-medium">Descripción</th>
                  <th className="text-right px-3 py-3 font-medium">Cantidad</th>
                  <th className="text-right px-3 py-3 font-medium">P. Unitario</th>
                  <th className="text-right px-3 py-3 font-medium">Desc %</th>
                  <th className="text-center px-3 py-3 font-medium">Exenta</th>
                  <th className="text-right px-3 py-3 font-medium">Total línea</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {boleta.lineas.map(l => (
                  <tr key={l.id}>
                    <td className="px-3 py-3 text-gray-900 dark:text-white">{l.descripcion}</td>
                    <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300 font-num">{Number(l.cantidad)}</td>
                    <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300 font-num">{fmtMoney(l.precio_unitario)}</td>
                    <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300 font-num">{Number(l.descuento_pct)}%</td>
                    <td className="px-3 py-3 text-center text-gray-700 dark:text-gray-300">{l.exenta ? 'Sí' : '—'}</td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900 dark:text-white font-num">{fmtMoney(l.total_linea)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totales + pago + meta */}
        <div className="space-y-4">
          {/* Totales */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Totales</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Neto</dt>
                <dd className="text-gray-900 dark:text-white font-num">{fmtMoney(boleta.total_neto)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">IVA {boleta.tipo_dte === '39' ? '19%' : '(exenta)'}</dt>
                <dd className="text-gray-900 dark:text-white font-num">{fmtMoney(boleta.total_iva)}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                <dt className="font-semibold text-gray-900 dark:text-white">Total</dt>
                <dd className="font-semibold text-gray-900 dark:text-white font-num">{fmtMoney(boleta.total)}</dd>
              </div>
            </dl>
          </div>

          {/* Pago */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Pago</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-gray-500 dark:text-gray-400">Método</dt>
              <dd className="text-gray-900 dark:text-white">{METODO_LABELS[boleta.metodo_pago] ?? boleta.metodo_pago}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Monto pagado</dt>
              <dd className="text-gray-900 dark:text-white font-num">{fmtMoney(boleta.monto_pagado)}</dd>
            </dl>
          </div>

          {/* Metadata */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Información</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-gray-500 dark:text-gray-400">Fecha</dt>
              <dd className="text-gray-900 dark:text-white">{fmtDate(boleta.fecha)}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Vendedor</dt>
              <dd className="text-gray-900 dark:text-white">{boleta.vendedor?.name ?? '—'}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Creada</dt>
              <dd className="text-gray-900 dark:text-white">{fmtDateTime(boleta.created_at)}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Email enviado</dt>
              <dd className="text-gray-900 dark:text-white">{fmtDateTime(boleta.email_enviado_at)}</dd>
            </dl>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAnular && (
        <BoletaAnularModal
          boleta={toListItem(boleta)}
          onCancel={() => setShowAnular(false)}
          onConfirm={(razon) => anularMut.mutate(razon)}
          isPending={anularMut.isPending}
          error={anularMut.error ? 'No se pudo anular' : null}
        />
      )}
      {showEmail && (
        <BoletaEmailModal
          boleta={toListItem(boleta)}
          onCancel={() => setShowEmail(false)}
          onConfirm={(email) => emailMut.mutate(email)}
          isPending={emailMut.isPending}
          error={emailMut.error ? 'No se pudo enviar' : null}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
