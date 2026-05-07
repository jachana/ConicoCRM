import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { CobranzaDashboard, RecordatorioItem, Factura, ImportXMLResult } from '../types'
import {
  Button, Input, Textarea, FormField, Badge, EmptyState, Skeleton,
  Card, CardContent,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '../components/ui'
import EntityLink from '../components/EntityLink'

type Tab = 'dashboard' | 'facturas' | 'recordatorios'

const ESTADO_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  emitida: 'info',
  parcial: 'warning',
  pagada: 'success',
  anulada: 'neutral',
}

const fmt = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

const fmtDate = (s: string | null) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('es-CL') : '—'

export default function Cobranza() {
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Cobranza</h1>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList variant="underline">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="facturas">Facturas</TabsTrigger>
          <TabsTrigger value="recordatorios">Recordatorios</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="facturas"><FacturasTab /></TabsContent>
        <TabsContent value="recordatorios"><RecordatoriosTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardTab() {
  const { data, isLoading, error } = useQuery<CobranzaDashboard>({
    queryKey: ['cobranza-dashboard'],
    queryFn: () => api.get('/api/cobranza/dashboard').then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="px-3 py-2 bg-danger-500/10 border border-danger-500/30 rounded-md text-sm text-danger-600 dark:text-danger-400">
        Error al cargar dashboard
      </div>
    )
  }

  const aging = data.aging
  const agingRows = [
    { label: '0 – 30 días', ...aging.d_0_30 },
    { label: '31 – 60 días', ...aging.d_31_60 },
    { label: '61 – 90 días', ...aging.d_61_90 },
    { label: '90+ días', ...aging.d_90_plus },
  ]

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total por cobrar</p>
            <p className="text-2xl font-bold text-info-600 dark:text-info-400 font-num">{fmt(data.total_por_cobrar)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total vencido</p>
            <p className="text-2xl font-bold text-danger-600 dark:text-danger-400 font-num">{fmt(data.total_vencido)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Próximas a vencer (≤7 días)</p>
            <p className="text-2xl font-bold text-warning-600 dark:text-warning-400 font-num">{fmt(data.proximas_a_vencer)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging */}
      <div>
        <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Aging</h2>
        <Card>
          <Table density="compact">
            <THead>
              <TR>
                <TH>Período</TH>
                <TH className="text-right">Cantidad</TH>
                <TH className="text-right">Monto</TH>
              </TR>
            </THead>
            <TBody>
              {agingRows.map(r => (
                <TR key={r.label}>
                  <TD>{r.label}</TD>
                  <TD className="text-right font-num">{r.count}</TD>
                  <TD className="text-right font-num">{fmt(r.monto)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      {/* Por empresa */}
      <div>
        <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Por empresa</h2>
        <Card>
          <Table density="compact">
            <THead>
              <TR>
                <TH>Empresa</TH>
                <TH className="text-right">Total pendiente</TH>
                <TH className="text-right">Vencido</TH>
              </TR>
            </THead>
            <TBody>
              {data.por_empresa.map(e => (
                <TR key={e.empresa_id}>
                  <TD>
                    {e.empresa_id ? (
                      <EntityLink kind="empresa" id={e.empresa_id}>{e.empresa_nombre}</EntityLink>
                    ) : e.empresa_nombre}
                  </TD>
                  <TD className="text-right font-num">{fmt(e.total)}</TD>
                  <TD className="text-right text-danger-600 dark:text-danger-400 font-num">{fmt(e.vencido)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}

// ─── Facturas ─────────────────────────────────────────────────────────────────

function FacturasTab() {
  const [estado, setEstado] = useState('pendientes')
  const [showImport, setShowImport] = useState(false)

  const { data: facturas = [], isLoading } = useQuery<Factura[]>({
    queryKey: ['cobranza-facturas', estado],
    queryFn: () => {
      if (estado === 'pendientes') {
        return api.get('/api/facturas/', { params: { estado: ['emitida', 'parcial'] }, paramsSerializer: { indexes: null } }).then(r => r.data)
      }
      return api.get('/api/facturas/', { params: estado ? { estado } : {} }).then(r => r.data)
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <Select
            value={estado}
            onValueChange={(v) => setEstado(v)}
          >
            <SelectTrigger size="sm" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendientes">Pendientes</SelectItem>
              <SelectItem value="emitida">Emitida</SelectItem>
              <SelectItem value="parcial">Parcial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setShowImport(true)}>Importar XML</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : facturas.length === 0 ? (
        <Card padded>
          <EmptyState title="No hay facturas" />
        </Card>
      ) : (
        <Card>
          <Table density="compact">
            <THead>
              <TR>
                <TH>N°</TH>
                <TH>Fecha</TH>
                <TH>Vencimiento</TH>
                <TH>Empresa</TH>
                <TH>Estado</TH>
                <TH>Origen</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {facturas.map(f => (
                <TR key={f.id} interactive>
                  <TD className="font-num font-medium text-gray-900 dark:text-gray-100">
                    <EntityLink kind="factura" id={f.id}>{f.numero.toString().padStart(5, '0')}</EntityLink>
                  </TD>
                  <TD className="font-num">{fmtDate(f.fecha)}</TD>
                  <TD className="font-num">{fmtDate(f.fecha_vencimiento)}</TD>
                  <TD>
                    {f.empresa?.id ? (
                      <EntityLink kind="empresa" id={f.empresa.id}>{f.empresa.nombre}</EntityLink>
                    ) : (f.empresa?.nombre ?? '—')}
                  </TD>
                  <TD>
                    <Badge variant={ESTADO_VARIANT[f.estado] ?? 'neutral'} className="capitalize">{f.estado}</Badge>
                  </TD>
                  <TD>
                    <Badge variant="neutral">{f.origen}</Badge>
                  </TD>
                  <TD className="text-right font-num">{fmt(f.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ImportXMLResult | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (inputRef.current && e.dataTransfer.files.length > 0) {
      const dt = new DataTransfer()
      Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f))
      inputRef.current.files = dt.files
    }
  }

  const handleUpload = async () => {
    const files = inputRef.current?.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const form = new FormData()
      Array.from(files).forEach(f => form.append('files', f))
      const r = await api.post('/api/facturas/import/xml/bulk', form)
      setResult(r.data)
      qc.invalidateQueries({ queryKey: ['cobranza-facturas'] })
      qc.invalidateQueries({ queryKey: ['cobranza-dashboard'] })
    } catch (e: any) {
      setResult({ creadas: 0, actualizadas: 0, errores: [{ filename: 'upload', message: e.message }] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Importar XML DTE</ModalTitle>
        </ModalHeader>
        <ModalBody>
          {!result ? (
            <>
              <div
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-brand-400 mb-4"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <p className="text-gray-500 dark:text-gray-400 text-sm">Arrastra archivos XML aquí o haz clic para seleccionar</p>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">Se pueden seleccionar múltiples archivos</p>
              </div>
              <input ref={inputRef} type="file" accept=".xml" multiple className="hidden" />
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-success-700 dark:text-success-400">✓ {result.creadas} creadas, {result.actualizadas} actualizadas</p>
              {result.errores.length > 0 && (
                <div>
                  <p className="text-sm text-danger-600 dark:text-danger-400 font-medium">{result.errores.length} error(es):</p>
                  {result.errores.map((e, i) => (
                    <div key={i} className="text-xs text-danger-500 dark:text-danger-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{e.filename}: {e.message}</span>
                      {e.empresa_data && (
                        <Link
                          to={`/empresas?create=true&rut=${encodeURIComponent(e.empresa_data.rut)}&nombre=${encodeURIComponent(e.empresa_data.nombre)}&email=${encodeURIComponent(e.empresa_data.email)}`}
                          className="text-info-600 dark:text-info-400 hover:underline whitespace-nowrap"
                        >
                          Crear empresa →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleUpload} disabled={uploading} loading={uploading}>
                {uploading ? 'Importando…' : 'Importar'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>Cerrar</Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

// ─── Recordatorios ────────────────────────────────────────────────────────────

function RecordatoriosTab() {
  const qc = useQueryClient()
  const [modalItem, setModalItem] = useState<RecordatorioItem | null>(null)

  const { data: items = [], isLoading } = useQuery<RecordatorioItem[]>({
    queryKey: ['cobranza-recordatorios'],
    queryFn: () => api.get('/api/cobranza/recordatorios').then(r => r.data),
  })

  const enviarMut = useMutation({
    mutationFn: ({ id, to, subject, body }: { id: number; to: string; subject: string; body: string }) =>
      api.post(`/api/facturas/${id}/recordatorio`, { to, subject, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobranza-recordatorios'] })
      setModalItem(null)
      toast.success('Recordatorio enviado')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al enviar recordatorio')
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Card padded>
        <EmptyState title="No hay facturas pendientes de recordatorio." />
      </Card>
    )
  }

  return (
    <div>
      <Card>
        <Table density="compact">
          <THead>
            <TR>
              <TH>N°</TH>
              <TH>Empresa</TH>
              <TH className="text-right">Saldo</TH>
              <TH className="text-right">Días vencida</TH>
              <TH>Último recordatorio</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {items.map(item => (
              <TR key={item.id} interactive>
                <TD className="font-num font-medium text-gray-900 dark:text-gray-100">
                  <EntityLink kind="factura" id={item.id}>{item.numero.toString().padStart(5, '0')}</EntityLink>
                </TD>
                <TD>
                  {item.empresa_id ? (
                    <EntityLink kind="empresa" id={item.empresa_id}>{item.empresa_nombre ?? '—'}</EntityLink>
                  ) : (item.empresa_nombre ?? item.cliente_nombre ?? '—')}
                </TD>
                <TD className="text-right font-num">{fmt(item.saldo)}</TD>
                <TD className="text-right text-danger-600 dark:text-danger-400 font-medium font-num">{item.dias_vencida}</TD>
                <TD className="font-num">{item.ultimo_recordatorio ? fmtDate(item.ultimo_recordatorio) : 'Nunca'}</TD>
                <TD className="text-right">
                  <Button size="sm" onClick={() => setModalItem(item)}>Enviar</Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {modalItem && (
        <RecordatorioModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onSend={(to, subject, body) =>
            enviarMut.mutate({ id: modalItem.id, to, subject, body })
          }
          sending={enviarMut.isPending}
          error={enviarMut.error ? String(enviarMut.error) : null}
        />
      )}
    </div>
  )
}

function RecordatorioModal({
  item,
  onClose,
  onSend,
  sending,
  error,
}: {
  item: RecordatorioItem
  onClose: () => void
  onSend: (to: string, subject: string, body: string) => void
  sending: boolean
  error: string | null
}) {
  const numStr = item.numero.toString().padStart(5, '0')
  const [to, setTo] = useState(item.correo_enviar ?? '')
  const [subject, setSubject] = useState(`Recordatorio de pago — Factura N°${numStr}`)
  const [body, setBody] = useState(
    `Estimado/a ${item.empresa_nombre ?? item.cliente_nombre ?? 'cliente'},\n\n` +
    `Le recordamos que la factura N°${numStr} por un monto de $${Math.round(item.total).toLocaleString('es-CL')} ` +
    `con fecha de vencimiento ${item.fecha_vencimiento ? fmtDate(item.fecha_vencimiento) : 'no especificada'} ` +
    `se encuentra pendiente de pago.\n\n` +
    `Han transcurrido ${item.dias_vencida} día(s) desde su vencimiento.\n\n` +
    `Le rogamos proceder con el pago a la brevedad posible.\n\n` +
    `Saludos,\nConico`
  )

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>Enviar recordatorio — Factura N°{numStr}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-3">
            <FormField label="Para">
              <Input value={to} onChange={e => setTo(e.target.value)} />
            </FormField>
            <FormField label="Asunto">
              <Input value={subject} onChange={e => setSubject(e.target.value)} />
            </FormField>
            <FormField label="Mensaje">
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                className="h-40 resize-none"
              />
            </FormField>
            {error && <p className="text-sm text-danger-600 dark:text-danger-400">{error}</p>}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => onSend(to, subject, body)}
            disabled={sending || !to}
            loading={sending}
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
