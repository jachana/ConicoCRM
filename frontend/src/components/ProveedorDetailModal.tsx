import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Inbox, Pencil } from 'lucide-react'
import { api } from '../lib/api'
import type { Proveedor, CompraDocItem } from '../types'
import EntityLink from './EntityLink'
import {
  Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Card, CardContent, Button, Input, Badge, EmptyState, Skeleton,
  Table, THead, TBody, TR, TH, TD,
} from './ui'

function startOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function startOfYear() {
  return `${new Date().getFullYear()}-01-01`
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtCLP(n: number | string) {
  return `$ ${Math.round(Number(n)).toLocaleString('es-CL')}`
}

type BadgeVariant = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

// Mirrors frontend/src/pages/OrdenesCompra.tsx
const OC_ESTADO_VARIANT: Record<string, BadgeVariant> = {
  borrador: 'neutral',
  enviada: 'info',
  recibida_parcial: 'warning',
  recibida_completa: 'success',
  cancelada: 'danger',
}

const OC_ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  recibida_parcial: 'Recibida parcial',
  recibida_completa: 'Recibida completa',
  cancelada: 'Cancelada',
}

const FC_ESTADO_VARIANT: Record<string, BadgeVariant> = {
  emitida: 'info',
}

const FC_ESTADO_LABELS: Record<string, string> = {
  emitida: 'Emitida',
}

type Recurso = 'ordenes-compra' | 'facturas-compra'

const RECURSO_CONFIG: Record<Recurso, {
  kind: 'oc' | 'fc'
  emptyTitle: string
  estadoVariant: Record<string, BadgeVariant>
  estadoLabels: Record<string, string>
  renderNumero: (d: CompraDocItem) => React.ReactNode
  countLabel: (n: number) => string
  showEntrega: boolean
}> = {
  'ordenes-compra': {
    kind: 'oc',
    emptyTitle: 'Sin órdenes de compra',
    estadoVariant: OC_ESTADO_VARIANT,
    estadoLabels: OC_ESTADO_LABELS,
    renderNumero: d => (
      <EntityLink kind="oc" id={d.id}>
        OC-{String(d.numero).padStart(5, '0')}
      </EntityLink>
    ),
    countLabel: n => `${n} orden${n !== 1 ? 'es' : ''} de compra`,
    showEntrega: true,
  },
  'facturas-compra': {
    kind: 'fc',
    emptyTitle: 'Sin facturas de compra',
    estadoVariant: FC_ESTADO_VARIANT,
    estadoLabels: FC_ESTADO_LABELS,
    renderNumero: d => (
      <EntityLink kind="fc" id={d.id}>
        FC-{d.numero}
      </EntityLink>
    ),
    countLabel: n => `${n} factura${n !== 1 ? 's' : ''} de compra`,
    showEntrega: false,
  },
}

function ComprasDocTable({ proveedorId, recurso }: { proveedorId: number; recurso: Recurso }) {
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const cfg = RECURSO_CONFIG[recurso]

  const params = new URLSearchParams()
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)
  const qs = params.toString()
  const suffix = qs ? `?${qs}` : ''

  const { data: docs = [], isLoading } = useQuery<CompraDocItem[]>({
    queryKey: [`proveedor-${recurso}`, proveedorId, fechaDesde, fechaHasta],
    queryFn: () =>
      api.get(`/api/proveedores/${proveedorId}/${recurso}${suffix}`).then(r => r.data),
  })

  function applyQuickDate(from: string) {
    if (fechaDesde === from) {
      setFechaDesde('')
    } else {
      setFechaDesde(from)
      setFechaHasta('')
    }
  }

  const mesStart = startOfMonth()
  const yearStart = startOfYear()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filtros rápidos">
        <Button
          size="sm"
          variant={fechaDesde === mesStart ? 'primary' : 'outline'}
          onClick={() => applyQuickDate(mesStart)}
          aria-pressed={fechaDesde === mesStart}
        >
          Este mes
        </Button>
        <Button
          size="sm"
          variant={fechaDesde === yearStart ? 'primary' : 'outline'}
          onClick={() => applyQuickDate(yearStart)}
          aria-pressed={fechaDesde === yearStart}
        >
          Este año
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Input type="date" size="sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-40" />
        <span className="text-gray-500 dark:text-gray-400 text-sm">→</span>
        <Input type="date" size="sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-40" />
      </div>

      <section className="flex flex-col gap-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : docs.length === 0 ? (
          <EmptyState icon={<Inbox />} title={cfg.emptyTitle} description="No hay documentos que coincidan con los filtros." />
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Nº</TH>
                  <TH>Fecha</TH>
                  {cfg.showEntrega && <TH>Entrega est.</TH>}
                  <TH>Estado</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {docs.map(d => (
                  <TR key={d.id}>
                    <TD className="font-num font-medium">{cfg.renderNumero(d)}</TD>
                    <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">{fmtDate(d.fecha)}</TD>
                    {cfg.showEntrega && (
                      <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">
                        {d.fecha_entrega_esperada ? fmtDate(d.fecha_entrega_esperada) : '—'}
                      </TD>
                    )}
                    <TD>
                      <Badge variant={cfg.estadoVariant[d.estado] ?? 'neutral'} showDot>
                        {cfg.estadoLabels[d.estado] ?? d.estado}
                      </Badge>
                    </TD>
                    <TD className="text-right font-num text-gray-700 dark:text-gray-300">{fmtCLP(d.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        {docs.length > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 px-1">
            {cfg.countLabel(docs.length)}
          </div>
        )}
      </section>
    </div>
  )
}

interface Props {
  proveedor: Proveedor | null
  onClose: () => void
  onEdit?: (p: Proveedor) => void
}

export default function ProveedorDetailModal({ proveedor, onClose, onEdit }: Props) {
  if (!proveedor) return null

  const subtitle = [proveedor.rut, proveedor.contacto, proveedor.email].filter(Boolean).join(' · ')

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalContent size="2xl" className="flex flex-col max-h-[90vh] p-0">
        <ModalHeader className="px-6 pt-5 pb-3">
          <ModalTitle>{proveedor.nombre}</ModalTitle>
          {subtitle && <ModalDescription>{subtitle}</ModalDescription>}
        </ModalHeader>

        <Tabs defaultValue="datos" className="flex flex-col flex-1 overflow-hidden">
          <TabsList variant="underline" className="px-6 flex-shrink-0">
            <TabsTrigger value="datos">Datos</TabsTrigger>
            <TabsTrigger value="ordenes-compra">Órdenes de compra</TabsTrigger>
            <TabsTrigger value="facturas-compra">Facturas de compra</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <TabsContent value="datos">
              <div className="space-y-4">
                {onEdit && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} onClick={() => onEdit(proveedor)}>
                      Editar
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nombre" value={proveedor.nombre} />
                  <Field label="RUT" value={proveedor.rut ?? '—'} />
                  <Field label="Contacto" value={proveedor.contacto ?? '—'} />
                  <Field label="Email" value={proveedor.email ?? '—'} />
                  <Field label="Teléfono" value={proveedor.telefono ?? '—'} />
                  <Field label="Notas" value={proveedor.notas ?? '—'} className="col-span-2" />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="ordenes-compra">
              <ComprasDocTable proveedorId={proveedor.id} recurso="ordenes-compra" />
            </TabsContent>
            <TabsContent value="facturas-compra">
              <ComprasDocTable proveedorId={proveedor.id} recurso="facturas-compra" />
            </TabsContent>
          </div>
        </Tabs>
      </ModalContent>
    </Modal>
  )
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card variant="subtle" className={className}>
      <CardContent className="py-2.5">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{value || '—'}</div>
      </CardContent>
    </Card>
  )
}
