import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, TrendingUp, TrendingDown, Search, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import type { MovimientoInventario, MovimientoListOut, Producto, StockBajoItem } from '../types'
import { useAuthStore } from '../stores/auth'
import {
  Button, Input, Textarea, FormField, Badge, EmptyState, Skeleton,
  Table, THead, TBody, TR, TH, TD,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '../components/ui'

const MOTIVO_LABELS: Record<string, string> = {
  conteo_fisico: 'Conteo físico',
  merma: 'Merma',
  correccion: 'Corrección',
  otro: 'Otro',
}

const TIPO_LABELS: Record<string, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
}

function MovimientoIcon({ tipo, signo }: { tipo: string; signo: number }) {
  if (tipo === 'entrada' || (tipo === 'ajuste' && signo === 1))
    return <TrendingUp size={14} className="text-success-500" />
  return <TrendingDown size={14} className="text-danger-500" />
}

function diasDesde(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  return `${Math.floor(ms / 86400000)}d`
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function ReferenciaCelda({ tipo, id }: { tipo: string | null; id: number | null }) {
  if (!tipo || !id) return <span className="text-gray-400">—</span>
  const map: Record<string, string> = {
    orden_compra: `/ordenes-compra/${id}`,
    nota_venta: `/notas-venta/${id}`,
  }
  const href = map[tipo]
  const label = tipo === 'orden_compra' ? `OC #${id}` : tipo === 'nota_venta' ? `NV #${id}` : `${tipo} #${id}`
  if (href) return <a href={href} className="text-brand-600 dark:text-brand-400 hover:underline text-sm">{label}</a>
  return <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
}

export default function Inventario() {
  const qc = useQueryClient()
  const isAdmin = useAuthStore(s => s.user)?.role === 'admin'
  const [tab, setTab] = useState<'stock' | 'movimientos'>('stock')
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const [soloDesactualizados, setSoloDesactualizados] = useState(false)

  const [ajusteOpen, setAjusteOpen] = useState(false)
  const [ajusteProductoId, setAjusteProductoId] = useState('')
  const [ajusteCantidad, setAjusteCantidad] = useState('1')
  const [ajusteSigno, setAjusteSigno] = useState<1 | -1>(1)
  const [ajusteMotivo, setAjusteMotivo] = useState('conteo_fisico')
  const [ajusteNota, setAjusteNota] = useState('')
  const [ajusteError, setAjusteError] = useState('')

  const { data: productos = [], isLoading: productosLoading } = useQuery<Producto[]>({
    queryKey: ['productos', busqueda],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const params = new URLSearchParams()
  if (filtroTipo) params.set('tipo', filtroTipo)
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)
  params.set('page', '1')
  params.set('page_size', '100')

  const { data: movimientos, isLoading: movimientosLoading } = useQuery<MovimientoListOut>({
    queryKey: ['movimientos', filtroTipo, fechaDesde, fechaHasta],
    queryFn: () => api.get(`/api/inventario/movimientos?${params}`).then(r => r.data),
    enabled: tab === 'movimientos',
  })

  const { data: stockBajo = [] } = useQuery<StockBajoItem[]>({
    queryKey: ['stock-bajo'],
    queryFn: () => api.get('/api/inventario/stock-bajo').then(r => r.data),
  })

  const ajusteMut = useMutation({
    mutationFn: (payload: object) => api.post('/api/inventario/ajustes', payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['movimientos'] })
      qc.invalidateQueries({ queryKey: ['stock-bajo'] })
      setAjusteOpen(false)
      setAjusteProductoId('')
      setAjusteCantidad('1')
      setAjusteSigno(1)
      setAjusteMotivo('conteo_fisico')
      setAjusteNota('')
      setAjusteError('')
    },
    onError: (e: any) => setAjusteError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  function submitAjuste(e: React.FormEvent) {
    e.preventDefault()
    if (!ajusteProductoId) { setAjusteError('Selecciona un producto'); return }
    ajusteMut.mutate({
      producto_id: parseInt(ajusteProductoId),
      cantidad: parseInt(ajusteCantidad) || 1,
      signo: ajusteSigno,
      motivo: ajusteMotivo,
      nota: ajusteNota || null,
    })
  }

  const filteredProductos = productos.filter(p => !soloDesactualizados || p.costo_desactualizado)

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Inventario</h1>
        <Button leftIcon={<Plus />} onClick={() => setAjusteOpen(true)}>
          Ajuste manual
        </Button>
      </div>

      {stockBajo.length > 0 && (
        <div className="mb-4 p-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/30 rounded-md flex items-start gap-2">
          <AlertTriangle size={16} className="text-danger-500 mt-0.5 flex-shrink-0" />
          <span className="text-sm text-danger-700 dark:text-danger-300">
            {stockBajo.length} producto{stockBajo.length > 1 ? 's' : ''} con stock crítico
          </span>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'stock' | 'movimientos')}>
        <TabsList variant="underline" className="mb-4">
          <TabsTrigger value="stock">Stock actual</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            <Input
              size="sm"
              leftAddon={<Search />}
              placeholder="Buscar por nombre o SKU..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-72"
            />
            {isAdmin && (
              <label className="text-sm flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloDesactualizados}
                  onChange={e => setSoloDesactualizados(e.target.checked)}
                  className="rounded accent-brand-500"
                />
                Solo costo desactualizado
              </label>
            )}
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-elev-1">
            {productosLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : filteredProductos.length === 0 ? (
              <EmptyState icon={<Inbox />} title="Sin productos" description="No hay productos que coincidan con los filtros." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Producto</TH>
                      <TH>SKU</TH>
                      <TH className="text-right">Stock mínimo</TH>
                      <TH className="text-right">Stock actual</TH>
                      <TH className="text-center">Estado</TH>
                      {isAdmin && <TH className="text-right">Últ. act. costo</TH>}
                    </TR>
                  </THead>
                  <TBody>
                    {filteredProductos.map(p => {
                      const critico = p.stock_actual < p.stock_minimo
                      return (
                        <TR key={p.id}>
                          <TD className="text-gray-900 dark:text-gray-100 font-medium">{p.nombre}</TD>
                          <TD className="text-gray-500 dark:text-gray-400 font-num">{p.sku ?? '—'}</TD>
                          <TD className="text-right font-num text-gray-700 dark:text-gray-300">{p.stock_minimo}</TD>
                          <TD className={`text-right font-num font-semibold ${critico ? 'text-danger-600 dark:text-danger-400' : 'text-gray-900 dark:text-gray-100'}`}>
                            {p.stock_actual}
                          </TD>
                          <TD className="text-center">
                            {critico ? (
                              <Badge variant="danger" size="sm" showDot>Crítico</Badge>
                            ) : (
                              <Badge variant="success" size="sm" showDot>OK</Badge>
                            )}
                          </TD>
                          {isAdmin && (
                            <TD className={`text-right font-num ${p.costo_desactualizado ? 'text-danger-600 dark:text-danger-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                              {diasDesde(p.precio_costo_actualizado_en)}
                            </TD>
                          )}
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="movimientos">
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <Select value={filtroTipo || 'all'} onValueChange={v => setFiltroTipo(v === 'all' ? '' : v)}>
              <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="salida">Salida</SelectItem>
                <SelectItem value="ajuste">Ajuste</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" size="sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-40" />
            <Input type="date" size="sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-40" />
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-elev-1">
            {movimientosLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : !movimientos?.items?.length ? (
              <EmptyState icon={<Inbox />} title="Sin movimientos" description="No hay movimientos que coincidan con los filtros." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Fecha</TH>
                      <TH>Producto</TH>
                      <TH>Tipo</TH>
                      <TH className="text-right">Cantidad</TH>
                      <TH>Referencia</TH>
                      <TH>Usuario</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {movimientos.items.map((m: MovimientoInventario) => (
                      <TR key={m.id}>
                        <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">{fmtFecha(m.created_at)}</TD>
                        <TD className="text-gray-900 dark:text-gray-100">{m.producto?.nombre ?? `#${m.producto_id}`}</TD>
                        <TD>
                          <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 text-sm">
                            <MovimientoIcon tipo={m.tipo} signo={m.signo} />
                            {TIPO_LABELS[m.tipo] ?? m.tipo}
                            {m.motivo && <span className="text-gray-400 dark:text-gray-500 text-xs">({MOTIVO_LABELS[m.motivo] ?? m.motivo})</span>}
                          </span>
                        </TD>
                        <TD className={`text-right font-num font-semibold ${m.signo === 1 ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'}`}>
                          {m.signo === 1 ? '+' : '-'}{m.cantidad}
                        </TD>
                        <TD><ReferenciaCelda tipo={m.referencia_tipo} id={m.referencia_id} /></TD>
                        <TD className="text-gray-500 dark:text-gray-400">{m.usuario?.name ?? '—'}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </div>
          {movimientos && movimientos.total > 100 && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Mostrando 100 de {movimientos.total} movimientos.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Ajuste manual modal */}
      <Modal open={ajusteOpen} onOpenChange={(o) => { if (!o) { setAjusteOpen(false); setAjusteError('') } }}>
        <ModalContent size="md">
          <ModalHeader>
            <ModalTitle>Ajuste manual de stock</ModalTitle>
          </ModalHeader>
          <form onSubmit={submitAjuste}>
            <ModalBody className="space-y-4">
              <FormField label="Producto" required>
                <Select value={ajusteProductoId || 'none'} onValueChange={v => setAjusteProductoId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar producto..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Seleccionar producto...</SelectItem>
                    {productos.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.nombre}{p.sku ? ` (${p.sku})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Tipo de ajuste">
                <div className="flex gap-4">
                  {([1, -1] as const).map(s => (
                    <label key={s} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="signo"
                        value={s}
                        checked={ajusteSigno === s}
                        onChange={() => setAjusteSigno(s)}
                        className="accent-brand-500"
                      />
                      {s === 1 ? 'Suma (entrada)' : 'Resta (salida)'}
                    </label>
                  ))}
                </div>
              </FormField>

              <FormField label="Cantidad">
                <Input
                  type="number"
                  min="1"
                  required
                  value={ajusteCantidad}
                  onChange={e => setAjusteCantidad(e.target.value)}
                />
              </FormField>

              <FormField label="Motivo">
                <Select value={ajusteMotivo} onValueChange={setAjusteMotivo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conteo_fisico">Conteo físico</SelectItem>
                    <SelectItem value="merma">Merma</SelectItem>
                    <SelectItem value="correccion">Corrección</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Nota (opcional)">
                <Textarea rows={2} value={ajusteNota} onChange={e => setAjusteNota(e.target.value)} />
              </FormField>

              {ajusteError && <p className="text-sm text-danger-600 dark:text-danger-400">{ajusteError}</p>}
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={() => { setAjusteOpen(false); setAjusteError('') }}>
                Cancelar
              </Button>
              <Button type="submit" loading={ajusteMut.isPending}>
                Guardar ajuste
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  )
}
