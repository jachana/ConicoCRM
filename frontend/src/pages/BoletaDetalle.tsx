import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import {
  Button, Badge, Skeleton, Card, CardContent,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

const ESTADO_VARIANT: Record<string, 'info' | 'danger' | 'neutral'> = {
  emitida: 'info',
  anulada: 'danger',
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
      toast.success('Boleta anulada')
      setShowAnular(false)
      qc.invalidateQueries({ queryKey: ['boleta', boletaId] })
      qc.invalidateQueries({ queryKey: ['boletas-list'] })
    },
  })

  const emailMut = useMutation({
    mutationFn: (email?: string) => enviarEmailBoleta(boletaId, email),
    onSuccess: () => {
      toast.success('Email enviado')
      setShowEmail(false)
      qc.invalidateQueries({ queryKey: ['boleta', boletaId] })
    },
  })

  function handleSendEmail() {
    if (boleta?.email_envio || boleta?.cliente) {
      emailMut.mutate(undefined, {
        onError: (err: unknown) => {
          const e = err as { response?: { status?: number } }
          if (e?.response?.status === 422) setShowEmail(true)
          else toast.error('Error al enviar email')
        },
      })
    } else {
      setShowEmail(true)
    }
  }

  function handleDownloadPdf() {
    openPdf(`/api/boletas/${boletaId}/pdf`).catch(() => toast.error('Error al abrir PDF'))
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (isError || !boleta) {
    return (
      <div className="p-4 md:p-6">
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

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="icon-sm" variant="ghost" onClick={() => navigate('/boletas')} aria-label="Volver a boletas">
            <ArrowLeft />
          </Button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white font-num">
            Boleta N° {String(boleta.numero).padStart(5, '0')}
          </h1>
          <span className="text-xs text-gray-500 dark:text-gray-400">Tipo {boleta.tipo_dte}</span>
          <Badge variant={ESTADO_VARIANT[boleta.estado] ?? 'neutral'} showDot>
            {boleta.estado}
          </Badge>
          <DteBadge estado={boleta.dte_estado} />
          {boleta.folio_sii != null && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Folio SII: <span className="font-num text-gray-700 dark:text-gray-300">{boleta.folio_sii}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<FileText />} onClick={handleDownloadPdf}>
            Descargar PDF
          </Button>
          <Button variant="outline" size="sm" leftIcon={<Mail />} onClick={handleSendEmail} loading={emailMut.isPending}>
            {emailMut.isPending ? 'Enviando...' : 'Enviar email'}
          </Button>
          {canAnular && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Trash2 />}
              className="border-danger-300 text-danger-600 hover:bg-danger-50 hover:border-danger-400 dark:border-danger-700 dark:text-danger-400 dark:hover:bg-danger-500/10"
              onClick={() => setShowAnular(true)}
            >
              Anular
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Receptor + líneas */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4">
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
            </CardContent>
          </Card>

          <Card className="overflow-x-auto">
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Descripción</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH className="text-right">P. Unitario</TH>
                  <TH className="text-right">Desc %</TH>
                  <TH className="text-center">Exenta</TH>
                  <TH className="text-right">Total línea</TH>
                </TR>
              </THead>
              <TBody>
                {boleta.lineas.map(l => (
                  <TR key={l.id}>
                    <TD className="text-gray-900 dark:text-white">{l.descripcion}</TD>
                    <TD className="text-right font-num">{Number(l.cantidad)}</TD>
                    <TD className="text-right font-num">{fmtMoney(l.precio_unitario)}</TD>
                    <TD className="text-right font-num">{Number(l.descuento_pct)}%</TD>
                    <TD className="text-center">{l.exenta ? 'Sí' : '—'}</TD>
                    <TD className="text-right font-medium text-gray-900 dark:text-white font-num">{fmtMoney(l.total_linea)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        {/* Totales + pago + meta */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
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
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Pago</h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-gray-500 dark:text-gray-400">Método</dt>
                <dd className="text-gray-900 dark:text-white">{METODO_LABELS[boleta.metodo_pago] ?? boleta.metodo_pago}</dd>
                <dt className="text-gray-500 dark:text-gray-400">Monto pagado</dt>
                <dd className="text-gray-900 dark:text-white font-num">{fmtMoney(boleta.monto_pagado)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
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
            </CardContent>
          </Card>
        </div>
      </div>

      <BoletaAnularModal
        isOpen={showAnular}
        boleta={toListItem(boleta)}
        onClose={() => setShowAnular(false)}
        onConfirm={(razon) => anularMut.mutate(razon)}
        isPending={anularMut.isPending}
        error={anularMut.error ? 'No se pudo anular' : null}
      />
      <BoletaEmailModal
        isOpen={showEmail}
        boleta={toListItem(boleta)}
        onClose={() => setShowEmail(false)}
        onConfirm={(email) => emailMut.mutate(email)}
        isPending={emailMut.isPending}
        error={emailMut.error ? 'No se pudo enviar' : null}
      />
    </div>
  )
}
