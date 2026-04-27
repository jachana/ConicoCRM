import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Mail, Send, Trash2, Edit, ArrowLeft } from 'lucide-react'
import {
  getGuiaDespacho,
  emitirGuiaDespachoDte,
  enviarEmailGuiaDespacho,
  eliminarGuiaDespacho,
  patchGuiaDespacho,
  MOTIVOS_TRASLADO,
  type GuiaDespacho,
} from '../api/guiasDespacho'
import { openPdf } from '../lib/pdf'
import DteBadge from '../components/DteBadge'

const ESTADO_COLORS: Record<string, string> = {
  emitida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  anulada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

function fmtMoney(n: number | string) {
  const num = typeof n === 'string' ? Number(n) : n
  return `$ ${Math.round(num).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL')
}

export default function GuiaDespachoDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const guiaId = Number(id)
  const [editingMeta, setEditingMeta] = useState(false)
  const [direccion, setDireccion] = useState('')
  const [comuna, setComuna] = useState('')
  const [emailEnvio, setEmailEnvio] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const { data: guia, isLoading, isError } = useQuery<GuiaDespacho>({
    queryKey: ['guia-despacho', guiaId],
    queryFn: () => getGuiaDespacho(guiaId),
    enabled: !!guiaId,
    refetchInterval: (query) => {
      const d = query.state.data as GuiaDespacho | undefined
      if (d && (d.dte_estado === 'pendiente' || d.dte_estado === 'procesando')) return 10_000
      return false
    },
  })

  const emitirMut = useMutation({
    mutationFn: () => emitirGuiaDespachoDte(guiaId),
    onSuccess: () => {
      showToast('Emisión disparada — esperando SII')
      qc.invalidateQueries({ queryKey: ['guia-despacho', guiaId] })
    },
    onError: () => showToast('Error al emitir DTE', false),
  })

  const emailMut = useMutation({
    mutationFn: () => enviarEmailGuiaDespacho(guiaId),
    onSuccess: () => {
      showToast('Email enviado')
      qc.invalidateQueries({ queryKey: ['guia-despacho', guiaId] })
    },
    onError: () => showToast('Error al enviar email', false),
  })

  const eliminarMut = useMutation({
    mutationFn: () => eliminarGuiaDespacho(guiaId),
    onSuccess: () => {
      showToast('Guía eliminada')
      navigate('/guias-despacho')
    },
    onError: () => showToast('No se pudo eliminar (¿ya emitida?)', false),
  })

  const patchMut = useMutation({
    mutationFn: () => patchGuiaDespacho(guiaId, {
      direccion_destino: direccion,
      comuna_destino: comuna,
      email_envio: emailEnvio || null,
    }),
    onSuccess: () => {
      showToast('Guía actualizada')
      setEditingMeta(false)
      qc.invalidateQueries({ queryKey: ['guia-despacho', guiaId] })
    },
    onError: () => showToast('Error al actualizar', false),
  })

  function handleAnular() {
    if (!guia) return
    if (window.confirm(`¿Crear NC tipo 61 para anular la guía N°${guia.numero}? La guía quedará anulada solo cuando la NC sea aceptada por SII.`)) {
      navigate(`/notas-credito/nueva?guia_despacho_id=${guia.id}`)
    }
  }

  function startEdit() {
    if (!guia) return
    setDireccion(guia.direccion_destino)
    setComuna(guia.comuna_destino)
    setEmailEnvio(guia.email_envio || '')
    setEditingMeta(true)
  }

  if (isLoading) return <div className="p-6 text-gray-400">Cargando...</div>
  if (isError || !guia) return <div className="p-6 text-red-500">Error al cargar la guía.</div>

  const motivoLabel = MOTIVOS_TRASLADO.find(m => m.value === guia.motivo_traslado)?.label ?? '—'
  const isAnulada = guia.estado === 'anulada'
  const canEdit = guia.dte_estado === 'no_emitida' && !isAnulada
  const canEmitir = guia.dte_estado === 'no_emitida' && !isAnulada
  const canAnular = guia.dte_estado === 'aceptada' && !isAnulada
  const canRetry = guia.dte_estado === 'rechazada' && !isAnulada
  const canDelete = guia.dte_estado === 'no_emitida' && !isAnulada
  const canPdfEmail = !isAnulada || guia.dte_estado === 'aceptada'

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/guias-despacho" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          Guía de Despacho N°{String(guia.numero).padStart(5, '0')}
        </h1>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[guia.estado] ?? ''}`}>
          {guia.estado}
        </span>
        <DteBadge estado={guia.dte_estado} />
      </div>

      {isAnulada && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          Guía anulada vía Nota de Crédito.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Receptor</h2>
          <div className="text-sm text-gray-900 dark:text-white">
            {guia.cliente?.nombre ?? '—'} {guia.cliente?.rut && <span className="text-gray-500 ml-1">({guia.cliente.rut})</span>}
          </div>
        </section>
        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fecha y Folio</h2>
          <div className="text-sm text-gray-900 dark:text-white">{fmtDate(guia.fecha)}</div>
          {guia.folio_sii && <div className="text-xs text-gray-500">Folio SII: {guia.folio_sii}</div>}
          {guia.track_id && <div className="text-xs text-gray-500">Track ID: {guia.track_id}</div>}
        </section>
      </div>

      <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Motivo + Destino</h2>
          {canEdit && !editingMeta && (
            <button onClick={startEdit} className="flex items-center gap-1 text-xs text-brand-500 hover:underline">
              <Edit size={12} /> Editar
            </button>
          )}
        </div>
        {!editingMeta ? (
          <div className="text-sm text-gray-900 dark:text-white space-y-1">
            <div><span className="text-gray-500">Motivo:</span> {motivoLabel}</div>
            <div><span className="text-gray-500">Destino:</span> {guia.direccion_destino}, {guia.comuna_destino}</div>
            {guia.email_envio && <div><span className="text-gray-500">Email envío:</span> {guia.email_envio}</div>}
          </div>
        ) : (
          <div className="space-y-2">
            <input className="w-full px-2 py-1.5 text-sm border rounded" value={direccion}
              onChange={e => setDireccion(e.target.value)} placeholder="Dirección" />
            <input className="w-full px-2 py-1.5 text-sm border rounded" value={comuna}
              onChange={e => setComuna(e.target.value)} placeholder="Comuna" />
            <input className="w-full px-2 py-1.5 text-sm border rounded" value={emailEnvio}
              onChange={e => setEmailEnvio(e.target.value)} placeholder="Email envío" type="email" />
            <div className="flex gap-2">
              <button onClick={() => patchMut.mutate()} disabled={patchMut.isPending}
                className="px-3 py-1 text-xs bg-brand-500 text-white rounded">Guardar</button>
              <button onClick={() => setEditingMeta(false)}
                className="px-3 py-1 text-xs border rounded">Cancelar</button>
            </div>
          </div>
        )}
      </section>

      {guia.nota_venta_id && (
        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nota de Venta vinculada</h2>
          <Link to={`/notas-venta/${guia.nota_venta_id}`} className="text-sm text-brand-500 hover:underline">
            N°{guia.nota_venta_id} →
          </Link>
        </section>
      )}

      <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Líneas</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left py-1">Descripción</th>
              <th className="text-right py-1">Cant</th>
              <th className="text-right py-1">Precio</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {guia.lineas.map(l => (
              <tr key={l.id}>
                <td className="py-2 text-gray-900 dark:text-white">{l.descripcion}</td>
                <td className="py-2 text-right text-gray-700 dark:text-gray-300 font-num">{l.cantidad}</td>
                <td className="py-2 text-right text-gray-700 dark:text-gray-300 font-num">{fmtMoney(l.precio_unitario)}</td>
                <td className="py-2 text-right text-gray-900 dark:text-white font-num">{fmtMoney(l.total_linea)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-right text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
          <div>Neto: {fmtMoney(guia.total_neto)}</div>
          <div>IVA: {fmtMoney(guia.total_iva)}</div>
          <div className="font-semibold text-gray-900 dark:text-white">Total: {fmtMoney(guia.total)}</div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {canEmitir && (
          <button onClick={() => emitirMut.mutate()} disabled={emitirMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
            <Send size={14} /> Emitir DTE
          </button>
        )}
        {canRetry && (
          <button onClick={() => emitirMut.mutate()} disabled={emitirMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50">
            <Send size={14} /> Reintentar emisión
          </button>
        )}
        {canPdfEmail && (
          <>
            <button onClick={() => openPdf(`/api/guias-despacho/${guia.id}/pdf`)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
              <Download size={14} /> PDF
            </button>
            <button onClick={() => emailMut.mutate()} disabled={emailMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50">
              <Mail size={14} /> Email
            </button>
          </>
        )}
        {canAnular && (
          <button onClick={handleAnular}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">
            <Trash2 size={14} /> Anular
          </button>
        )}
        {canDelete && (
          <button onClick={() => {
            if (window.confirm('¿Eliminar guía? Solo posible si DTE no fue emitida.')) eliminarMut.mutate()
          }} disabled={eliminarMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
            <Trash2 size={14} /> Eliminar
          </button>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
