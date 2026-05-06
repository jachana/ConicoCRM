import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useModuloEnabled } from '../hooks/useModulos'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import ConfirmModal from '../components/ui/ConfirmModal'
import {
  Button, Input, Badge, Card, CardContent,
  Table, THead, TBody, TR, TH, TD,
  Tooltip,
} from '../components/ui'

const ESTADO_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  emitida: 'info',
  anulada: 'danger',
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
  const [confirmAnular, setConfirmAnular] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const isNotaCreditoEnabled = useModuloEnabled('nota_credito')

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
      toast.success('Emisión disparada — esperando SII')
      qc.invalidateQueries({ queryKey: ['guia-despacho', guiaId] })
    },
    onError: () => toast.error('Error al emitir DTE'),
  })

  const emailMut = useMutation({
    mutationFn: () => enviarEmailGuiaDespacho(guiaId),
    onSuccess: () => {
      toast.success('Email enviado')
      qc.invalidateQueries({ queryKey: ['guia-despacho', guiaId] })
    },
    onError: () => toast.error('Error al enviar email'),
  })

  const eliminarMut = useMutation({
    mutationFn: () => eliminarGuiaDespacho(guiaId),
    onSuccess: () => {
      toast.success('Guía eliminada')
      navigate('/guias-despacho')
    },
    onError: () => toast.error('No se pudo eliminar (¿ya emitida?)'),
  })

  const patchMut = useMutation({
    mutationFn: () => patchGuiaDespacho(guiaId, {
      direccion_destino: direccion,
      comuna_destino: comuna,
      email_envio: emailEnvio || null,
    }),
    onSuccess: () => {
      toast.success('Guía actualizada')
      setEditingMeta(false)
      qc.invalidateQueries({ queryKey: ['guia-despacho', guiaId] })
    },
    onError: () => toast.error('Error al actualizar'),
  })

  function handleAnular() {
    if (!guia) return
    setConfirmAnular(true)
  }

  function doAnular() {
    if (!guia) return
    setConfirmAnular(false)
    navigate(`/notas-credito/nueva?guia_despacho_id=${guia.id}`)
  }

  function startEdit() {
    if (!guia) return
    setDireccion(guia.direccion_destino)
    setComuna(guia.comuna_destino)
    setEmailEnvio(guia.email_envio || '')
    setEditingMeta(true)
  }

  if (isLoading) return <div className="p-6 text-gray-500 dark:text-gray-400">Cargando...</div>
  if (isError || !guia) return <div className="p-6 text-danger-600 dark:text-danger-400">Error al cargar la guía.</div>

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
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Tooltip label="Volver">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => navigate('/guias-despacho')}
            aria-label="Volver"
          >
            <ArrowLeft />
          </Button>
        </Tooltip>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          Guía de Despacho N°{String(guia.numero).padStart(5, '0')}
        </h1>
        <Badge variant={ESTADO_VARIANT[guia.estado] ?? 'neutral'} size="sm">
          {guia.estado}
        </Badge>
        <DteBadge estado={guia.dte_estado} />
      </div>

      {isAnulada && (
        <div className="mb-4 px-4 py-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-700 dark:text-danger-300">
          Guía anulada vía Nota de Crédito.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Receptor</h2>
            <div className="text-sm text-gray-900 dark:text-white">
              {guia.cliente?.nombre ?? '—'}
              {guia.cliente?.rut && <span className="text-gray-500 dark:text-gray-400 ml-1">({guia.cliente.rut})</span>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Fecha y Folio</h2>
            <div className="text-sm text-gray-900 dark:text-white font-num">{fmtDate(guia.fecha)}</div>
            {guia.folio_sii && <div className="text-xs text-gray-500 dark:text-gray-400 font-num">Folio SII: {guia.folio_sii}</div>}
            {guia.track_id && <div className="text-xs text-gray-500 dark:text-gray-400 font-num">Track ID: {guia.track_id}</div>}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Motivo + Destino</h2>
            {canEdit && !editingMeta && (
              <Button variant="link" size="xs" leftIcon={<Edit />} onClick={startEdit}>
                Editar
              </Button>
            )}
          </div>
          {!editingMeta ? (
            <div className="text-sm text-gray-900 dark:text-white space-y-1">
              <div><span className="text-gray-500 dark:text-gray-400">Motivo:</span> {motivoLabel}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Destino:</span> {guia.direccion_destino}, {guia.comuna_destino}</div>
              {guia.email_envio && <div><span className="text-gray-500 dark:text-gray-400">Email envío:</span> {guia.email_envio}</div>}
            </div>
          ) : (
            <div className="space-y-2">
              <Input size="sm" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dirección" />
              <Input size="sm" value={comuna} onChange={e => setComuna(e.target.value)} placeholder="Comuna" />
              <Input size="sm" type="email" value={emailEnvio} onChange={e => setEmailEnvio(e.target.value)} placeholder="Email envío" />
              <div className="flex gap-2">
                <Button size="xs" onClick={() => patchMut.mutate()} loading={patchMut.isPending} disabled={patchMut.isPending}>
                  Guardar
                </Button>
                <Button size="xs" variant="outline" onClick={() => setEditingMeta(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {guia.nota_venta_id && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Nota de Venta vinculada</h2>
            <button
              onClick={() => navigate(`/notas-venta/${guia.nota_venta_id}`)}
              className="text-sm text-brand-600 dark:text-brand-400 hover:underline font-num"
            >
              N°{String(guia.nota_venta?.numero ?? guia.nota_venta_id).padStart(5, '0')} →
            </button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="p-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Líneas</h2>
          <Table density="compact">
            <THead>
              <TR>
                <TH>Descripción</TH>
                <TH className="text-right">Cant</TH>
                <TH className="text-right">Precio</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {guia.lineas.map(l => (
                <TR key={l.id}>
                  <TD className="text-gray-900 dark:text-white">{l.descripcion}</TD>
                  <TD className="text-right text-gray-700 dark:text-gray-300 font-num">{l.cantidad}</TD>
                  <TD className="text-right text-gray-700 dark:text-gray-300 font-num">{fmtMoney(l.precio_unitario)}</TD>
                  <TD className="text-right text-gray-900 dark:text-white font-num">{fmtMoney(l.total_linea)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="mt-3 text-right text-sm text-gray-700 dark:text-gray-300 space-y-0.5 font-num">
            <div>Neto: {fmtMoney(guia.total_neto)}</div>
            <div>IVA: {fmtMoney(guia.total_iva)}</div>
            <div className="font-semibold text-gray-900 dark:text-white">Total: {fmtMoney(guia.total)}</div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {canEmitir && (
          <Button
            leftIcon={<Send />}
            onClick={() => emitirMut.mutate()}
            disabled={emitirMut.isPending}
            loading={emitirMut.isPending}
          >
            Emitir DTE
          </Button>
        )}
        {canRetry && (
          <Button
            variant="primary"
            leftIcon={<Send />}
            onClick={() => emitirMut.mutate()}
            disabled={emitirMut.isPending}
            loading={emitirMut.isPending}
            className="bg-warning-500 hover:bg-warning-600 focus-visible:ring-warning-500"
          >
            Reintentar emisión
          </Button>
        )}
        {canPdfEmail && (
          <>
            <Button
              variant="outline"
              leftIcon={<Download />}
              onClick={() => openPdf(`/api/guias-despacho/${guia.id}/pdf`)}
            >
              PDF
            </Button>
            <Button
              variant="outline"
              leftIcon={<Mail />}
              onClick={() => emailMut.mutate()}
              disabled={emailMut.isPending}
              loading={emailMut.isPending}
            >
              Email
            </Button>
          </>
        )}
        {isNotaCreditoEnabled && canAnular && (
          <Button variant="danger" leftIcon={<Trash2 />} onClick={handleAnular}>
            Anular
          </Button>
        )}
        {canDelete && (
          <Button
            variant="outline"
            leftIcon={<Trash2 />}
            onClick={() => {
              setConfirmEliminar(true)
            }}
            disabled={eliminarMut.isPending}
            loading={eliminarMut.isPending}
            className="border-danger-300 text-danger-600 hover:bg-danger-50 dark:border-danger-700 dark:text-danger-400 dark:hover:bg-danger-500/10"
          >
            Eliminar
          </Button>
        )}
      </div>
      <ConfirmModal
        open={confirmAnular}
        onOpenChange={setConfirmAnular}
        title={`¿Anular guía N°${guia?.numero}?`}
        description="Se creará una NC tipo 61. La guía quedará anulada solo cuando la NC sea aceptada por SII."
        confirmLabel="Crear NC y anular"
        onConfirm={doAnular}
      />
      <ConfirmModal
        open={confirmEliminar}
        onOpenChange={setConfirmEliminar}
        title="¿Eliminar guía?"
        description="Solo posible si el DTE no fue emitido."
        confirmLabel="Eliminar"
        onConfirm={() => { setConfirmEliminar(false); eliminarMut.mutate() }}
        isPending={eliminarMut.isPending}
      />
    </div>
  )
}
