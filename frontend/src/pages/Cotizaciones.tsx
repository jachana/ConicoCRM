import { openPdf } from '../lib/pdf'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, FileText, Mail, Trash2, Eye, ChevronDown, X, Download, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import type { Cotizacion } from '../types'
import ExportPreviewPanel from '../components/ExportPreviewPanel'
import { COTIZACION_COLUMN_DEFS } from '../lib/columnDefs'
import type { FlatLine } from '../types'
import {
  Button, Input, Badge, EmptyState, Skeleton, Card, CardContent,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription,
  Tooltip,
} from '../components/ui'

const ESTADO_LABELS: Record<string, string> = {
  no_definido: 'Sin definir',
  abierta: 'Abierta',
  aprobada: 'Aprobada',
  cerrada_fv: 'Cerrada (FV)',
  rechazada: 'Rechazada',
}

const ESTADO_VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'danger'> = {
  no_definido: 'neutral',
  abierta: 'info',
  aprobada: 'success',
  cerrada_fv: 'success',
  rechazada: 'danger',
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function MargenBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-gray-400 text-xs">—</span>
  const pct = Math.round(value * 1000) / 10
  const color = pct < 15 ? 'text-danger-600 dark:text-danger-400'
    : pct < 25 ? 'text-warning-600 dark:text-warning-400'
    : 'text-success-600 dark:text-success-400'
  return <span className={`font-medium text-sm font-num ${color}`}>{pct.toFixed(1)}%</span>
}

interface PillProps {
  label: string
  active: boolean
  summary?: string
  isOpen: boolean
  onToggle: () => void
  onClear: () => void
  children: React.ReactNode
  wide?: boolean
}

function FilterPill({ label, active, summary, isOpen, onToggle, onClear, children, wide }: PillProps) {
  return (
    <div className="relative flex-shrink-0">
      <div className={`flex items-center rounded-full border text-sm transition-colors
        ${active
          ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300'
          : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
        }`}
      >
        <button onClick={onToggle} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5">
          <span className="whitespace-nowrap">{active && summary ? summary : label}</span>
          <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''} text-gray-400`} />
        </button>
        {active && (
          <button onClick={(e) => { e.stopPropagation(); onClear() }}
            className="pr-2 pl-0.5 py-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={13} />
          </button>
        )}
      </div>
      {isOpen && (
        <div className={`absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-elev-3 py-2 ${wide ? 'w-80' : 'min-w-[200px]'}`}>
          {children}
        </div>
      )}
    </div>
  )
}

interface UserMin { id: number; name: string }
interface EmpresaMin { id: number; nombre: string }
interface ProductoMin { id: number; nombre: string; sku: string | null }

function buildListParams(
  estados: string[],
  emisorId: number | null,
  empresaId: number | null,
  fechaDesde: string,
  fechaHasta: string,
  montoMin: string,
  montoMax: string,
  productos: { id: number }[],
): URLSearchParams {
  const p = new URLSearchParams()
  estados.forEach(e => p.append('estado', e))
  if (emisorId) p.append('vendedor_id', String(emisorId))
  if (empresaId) p.append('empresa_id', String(empresaId))
  if (fechaDesde) p.append('fecha_desde', fechaDesde)
  if (fechaHasta) p.append('fecha_hasta', fechaHasta)
  if (montoMin) p.append('monto_min', montoMin)
  if (montoMax) p.append('monto_max', montoMax)
  productos.forEach(p2 => p.append('producto_id', String(p2.id)))
  return p
}

export default function Cotizaciones() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [estados, setEstados] = useState<string[]>([])
  const [emisorId, setEmisorId] = useState<number | null>(null)
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [montoMin, setMontoMin] = useState('')
  const [montoMax, setMontoMax] = useState('')
  const [productos, setProductos] = useState<ProductoMin[]>([])
  const [productoSearch, setProductoSearch] = useState('')

  const [openPill, setOpenPill] = useState<string | null>(null)
  const filterBarRef = useRef<HTMLDivElement>(null)

  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [showExportModal, setShowExportModal] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterBarRef.current && !filterBarRef.current.contains(e.target as Node))
        setOpenPill(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const togglePill = useCallback((name: string) =>
    setOpenPill(prev => prev === name ? null : name), [])

  const { data: users = [] } = useQuery<UserMin[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/api/users').then(r => r.data),
    staleTime: 5 * 60_000,
  })
  const { data: empresas = [] } = useQuery<EmpresaMin[]>({
    queryKey: ['empresas-list'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
    staleTime: 5 * 60_000,
  })
  const { data: productoResults = [] } = useQuery<ProductoMin[]>({
    queryKey: ['productos-search', productoSearch],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(productoSearch)}`).then(r => r.data),
    enabled: productoSearch.length >= 1,
    staleTime: 30_000,
  })

  const params = useMemo(
    () => buildListParams(estados, emisorId, empresaId, fechaDesde, fechaHasta, montoMin, montoMax, productos),
    [estados, emisorId, empresaId, fechaDesde, fechaHasta, montoMin, montoMax, productos],
  )

  const hasFilters = estados.length > 0 || !!emisorId || !!empresaId ||
    !!fechaDesde || !!fechaHasta || !!montoMin || !!montoMax || productos.length > 0

  function clearAll() {
    setEstados([]); setEmisorId(null); setEmpresaId(null)
    setFechaDesde(''); setFechaHasta('')
    setMontoMin(''); setMontoMax('')
    setProductos([]); setProductoSearch('')
  }

  const { data: cotizaciones = [], isLoading } = useQuery<Cotizacion[]>({
    queryKey: ['cotizaciones', estados, emisorId, empresaId, fechaDesde, fechaHasta, montoMin, montoMax, productos.map(p => p.id)],
    queryFn: () => api.get(`/api/cotizaciones/?${params.toString()}`).then(r => r.data),
  })

  const flatLines = useMemo<FlatLine[]>(() =>
    cotizaciones.flatMap(c =>
      (c.lineas ?? []).map(l => ({
        numero: c.numero,
        fecha: c.fecha,
        estado: c.estado,
        cliente_nombre: c.cliente?.nombre ?? '',
        empresa_nombre: c.empresa?.nombre ?? '',
        encargado: c.vendedor?.name ?? '',
        contacto: c.contacto ?? '',
        sku: l.sku ?? '',
        descripcion: l.descripcion,
        formato: l.formato ?? '',
        cantidad: l.cantidad,
        precio_unit: Number(l.valor_neto),
        total_neto: Number(l.total_neto),
        margen: l.margen ?? null,
        fecha_vencimiento: '',
        monto_pagado: null,
        metodo_pago: '',
        fecha_pago: '',
      }))
    ), [cotizaciones])

  const exportBaseUrl = useMemo(() => {
    const qs = buildListParams(estados, emisorId, empresaId, fechaDesde, fechaHasta, montoMin, montoMax, productos).toString()
    return `/api/cotizaciones/export/excel${qs ? '?' + qs : ''}`
  }, [estados, emisorId, empresaId, fechaDesde, fechaHasta, montoMin, montoMax, productos])

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/cotizaciones/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cotizaciones'] }); setDeleteId(null); setDeleteError('') },
    onError: (err: any) => setDeleteError(err?.response?.data?.detail || 'Error al eliminar'),
  })

  const emailMut = useMutation({
    mutationFn: (id: number) => api.post(`/api/cotizaciones/${id}/email`),
    onSuccess: () => toast.success('Email enviado correctamente'),
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al enviar email'),
  })

  const emisorName = users.find(u => u.id === emisorId)?.name
  const empresaNombre = empresas.find(e => e.id === empresaId)?.nombre

  const fechaSummary = fechaDesde && fechaHasta ? `${fmtDate(fechaDesde)} – ${fmtDate(fechaHasta)}`
    : fechaDesde ? `Desde ${fmtDate(fechaDesde)}`
    : `Hasta ${fmtDate(fechaHasta)}`

  const montoSummary = montoMin && montoMax ? `$${Number(montoMin).toLocaleString()} – $${Number(montoMax).toLocaleString()}`
    : montoMin ? `Mín $${Number(montoMin).toLocaleString()}`
    : `Máx $${Number(montoMax).toLocaleString()}`

  const exportFilename = useMemo(
    () => `cotizaciones-${new Date().toISOString().split('T')[0]}.xlsx`,
    [],
  )

  const checkboxCls = 'flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-sm text-gray-800 dark:text-gray-200'

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5 gap-2">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Cotizaciones</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<Download />} onClick={() => setShowExportModal(true)}>
            <span className="hidden sm:inline">Exportar</span>
          </Button>
          <Button leftIcon={<Plus />} onClick={() => navigate('/cotizaciones/nueva')}>
            <span className="hidden sm:inline">Nueva cotización</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </div>
      </div>

      <div ref={filterBarRef} className="mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <FilterPill
            label="Estado" active={estados.length > 0}
            summary={estados.length === 1 ? ESTADO_LABELS[estados[0]] : `${estados.length} estados`}
            isOpen={openPill === 'estado'} onToggle={() => togglePill('estado')}
            onClear={() => setEstados([])}
          >
            {Object.entries(ESTADO_LABELS).map(([value, lbl]) => (
              <label key={value} className={checkboxCls}>
                <input type="checkbox" className="rounded border-gray-300 accent-brand-500"
                  checked={estados.includes(value)}
                  onChange={e => setEstados(prev => e.target.checked ? [...prev, value] : prev.filter(v => v !== value))} />
                {lbl}
              </label>
            ))}
          </FilterPill>

          <FilterPill
            label="Emisor" active={!!emisorId} summary={emisorName}
            isOpen={openPill === 'emisor'} onToggle={() => togglePill('emisor')}
            onClear={() => setEmisorId(null)}
          >
            <div className="max-h-56 overflow-y-auto">
              {users.map(u => (
                <button key={u.id} onClick={() => { setEmisorId(u.id); setOpenPill(null) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors
                    ${emisorId === u.id ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                  {u.name}
                </button>
              ))}
            </div>
          </FilterPill>

          <FilterPill
            label="Empresa" active={!!empresaId} summary={empresaNombre}
            isOpen={openPill === 'empresa'} onToggle={() => togglePill('empresa')}
            onClear={() => setEmpresaId(null)}
          >
            <div className="max-h-56 overflow-y-auto">
              {empresas.map(e => (
                <button key={e.id} onClick={() => { setEmpresaId(e.id); setOpenPill(null) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors
                    ${empresaId === e.id ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                  {e.nombre}
                </button>
              ))}
            </div>
          </FilterPill>

          <FilterPill
            label="Fechas" active={!!(fechaDesde || fechaHasta)} summary={fechaSummary}
            isOpen={openPill === 'fechas'} onToggle={() => togglePill('fechas')}
            onClear={() => { setFechaDesde(''); setFechaHasta('') }}
            wide
          >
            <div className="px-3 py-2 space-y-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Desde</p>
                <Input type="date" size="sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Hasta</p>
                <Input type="date" size="sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
              </div>
            </div>
          </FilterPill>

          <FilterPill
            label="Monto" active={!!(montoMin || montoMax)} summary={montoSummary}
            isOpen={openPill === 'monto'} onToggle={() => togglePill('monto')}
            onClear={() => { setMontoMin(''); setMontoMax('') }}
            wide
          >
            <div className="px-3 py-2 space-y-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Mínimo</p>
                <Input type="number" size="sm" placeholder="0" value={montoMin} onChange={e => setMontoMin(e.target.value)} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Máximo</p>
                <Input type="number" size="sm" placeholder="∞" value={montoMax} onChange={e => setMontoMax(e.target.value)} />
              </div>
            </div>
          </FilterPill>

          <FilterPill
            label="Productos" active={productos.length > 0}
            summary={productos.length === 1 ? productos[0].nombre : `${productos.length} productos`}
            isOpen={openPill === 'productos'} onToggle={() => togglePill('productos')}
            onClear={() => { setProductos([]); setProductoSearch('') }}
            wide
          >
            <div className="px-3 pt-2 pb-1">
              <Input
                autoFocus
                size="sm"
                placeholder="Buscar producto..."
                value={productoSearch}
                onChange={e => setProductoSearch(e.target.value)}
              />
            </div>
            {productos.length > 0 && (
              <div className="px-3 py-1 flex flex-wrap gap-1">
                {productos.map(p => (
                  <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-500/15 text-brand-700 dark:text-brand-300 rounded-full text-xs">
                    {p.nombre}
                    <button onClick={() => setProductos(prev => prev.filter(x => x.id !== p.id))}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {productoResults.length > 0 && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-800 mt-1" />
                <div className="max-h-48 overflow-y-auto py-1">
                  {productoResults
                    .filter(r => !productos.some(p => p.id === r.id))
                    .map(r => (
                      <button key={r.id}
                        onClick={() => setProductos(prev => [...prev, r])}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-800 dark:text-gray-200 flex items-center justify-between gap-2">
                        <span className="truncate">{r.nombre}</span>
                        {r.sku && <span className="text-xs text-gray-400 flex-shrink-0 font-num">{r.sku}</span>}
                      </button>
                    ))}
                </div>
              </>
            )}
            {productoSearch.length >= 1 && productoResults.filter(r => !productos.some(p => p.id === r.id)).length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
            )}
          </FilterPill>

          {hasFilters && (
            <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1 underline underline-offset-2 flex-shrink-0">
              Limpiar todo
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : cotizaciones.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="Sin cotizaciones"
          description="No hay cotizaciones que coincidan con los filtros seleccionados."
          action={<Button leftIcon={<Plus />} onClick={() => navigate('/cotizaciones/nueva')}>Crear primera cotización</Button>}
        />
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {cotizaciones.map(c => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-num">COT-{String(c.numero).padStart(5, '0')}</span>
                      <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight mt-0.5">{c.cliente?.nombre ?? '—'}</p>
                      {c.empresa?.nombre && <p className="text-xs text-gray-400 leading-tight">{c.empresa.nombre}</p>}
                    </div>
                    <Badge variant={ESTADO_VARIANT[c.estado] ?? 'neutral'} size="sm">
                      {ESTADO_LABELS[c.estado] ?? c.estado}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-x-2 font-num">
                      <span>{fmtDate(c.fecha)}</span>
                      {c.vendedor?.name && <span>· {c.vendedor.name}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <MargenBadge value={c.margen_total} />
                      <span className="font-semibold text-gray-900 dark:text-white text-sm font-num">{fmtMoney(c.total)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <Button size="xs" variant="ghost" leftIcon={<Eye />} className="flex-1" onClick={() => navigate(`/cotizaciones/${c.id}`)}>Ver</Button>
                    <Button size="xs" variant="ghost" leftIcon={<FileText />} className="flex-1" onClick={() => openPdf(`/api/cotizaciones/${c.id}/pdf`)}>PDF</Button>
                    <Button size="xs" variant="ghost" leftIcon={<Mail />} className="flex-1" onClick={() => emailMut.mutate(c.id)} disabled={emailMut.isPending}>Email</Button>
                    {c.estado === 'no_definido' && (
                      <Button
                        size="xs"
                        variant="ghost"
                        leftIcon={<Trash2 />}
                        className="flex-1 text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                        onClick={() => { setDeleteId(c.id); setDeleteError('') }}
                      >Borrar</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="hidden md:block">
            <Card className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Nº</TH>
                    <TH>Fecha</TH>
                    <TH>Cliente / Empresa</TH>
                    <TH className="text-right">Total</TH>
                    <TH className="text-right">Margen</TH>
                    <TH>Estado</TH>
                    <TH>Encargado</TH>
                    <TH className="text-right">Acciones</TH>
                  </TR>
                </THead>
                <TBody>
                  {cotizaciones.map(c => (
                    <TR key={c.id} interactive onClick={() => navigate(`/cotizaciones/${c.id}`)}>
                      <TD className="font-medium text-gray-900 dark:text-white font-num">
                        COT-{String(c.numero).padStart(5, '0')}
                      </TD>
                      <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">{fmtDate(c.fecha)}</TD>
                      <TD>
                        <div className="text-gray-900 dark:text-white leading-tight">{c.cliente?.nombre ?? '-'}</div>
                        {c.empresa?.nombre && <div className="text-xs text-gray-400 leading-tight">{c.empresa.nombre}</div>}
                      </TD>
                      <TD className="font-medium text-gray-900 dark:text-white whitespace-nowrap text-right font-num">{fmtMoney(c.total)}</TD>
                      <TD className="text-right"><MargenBadge value={c.margen_total} /></TD>
                      <TD>
                        <Badge variant={ESTADO_VARIANT[c.estado] ?? 'neutral'} showDot>
                          {ESTADO_LABELS[c.estado] ?? c.estado}
                        </Badge>
                      </TD>
                      <TD className="text-gray-500 dark:text-gray-400">{c.vendedor?.name ?? '-'}</TD>
                      <TD onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <Tooltip label="Ver / Editar">
                            <Button size="icon-xs" variant="ghost" onClick={() => navigate(`/cotizaciones/${c.id}`)}>
                              <Eye />
                            </Button>
                          </Tooltip>
                          <Tooltip label="PDF">
                            <Button size="icon-xs" variant="ghost" onClick={() => openPdf(`/api/cotizaciones/${c.id}/pdf`)}>
                              <FileText />
                            </Button>
                          </Tooltip>
                          <Tooltip label="Enviar email">
                            <Button size="icon-xs" variant="ghost" onClick={() => emailMut.mutate(c.id)} disabled={emailMut.isPending}>
                              <Mail />
                            </Button>
                          </Tooltip>
                          {c.estado === 'no_definido' && (
                            <Tooltip label="Eliminar">
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                                onClick={() => { setDeleteId(c.id); setDeleteError('') }}
                              >
                                <Trash2 />
                              </Button>
                            </Tooltip>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>
        </>
      )}

      <Modal open={deleteId !== null} onOpenChange={(o) => { if (!o) { setDeleteId(null); setDeleteError('') } }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>¿Eliminar cotización?</ModalTitle>
            <ModalDescription>Esta acción no se puede deshacer.</ModalDescription>
          </ModalHeader>
          <ModalBody>
            {deleteError && <p className="text-sm text-danger-600 dark:text-danger-400">{deleteError}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => { setDeleteId(null); setDeleteError('') }}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() => deleteId !== null && deleteMut.mutate(deleteId)}
            >
              Eliminar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal open={showExportModal} onOpenChange={(o) => { if (!o) setShowDiscardConfirm(true) }}>
        <ModalContent size="2xl" className="max-h-[90vh] flex flex-col">
          <ModalHeader>
            <ModalTitle>Exportar cotizaciones</ModalTitle>
          </ModalHeader>
          <div className="px-6 pb-5 overflow-y-auto">
            <ExportPreviewPanel
              lines={flatLines}
              availableColumns={COTIZACION_COLUMN_DEFS}
              isLoading={isLoading}
              exportBaseUrl={exportBaseUrl}
              storageKey="cotizaciones-preview-cols"
              filename={exportFilename}
            />
          </div>
        </ModalContent>
      </Modal>

      <Modal open={showDiscardConfirm} onOpenChange={(o) => { if (!o) setShowDiscardConfirm(false) }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>¿Descartar exportación?</ModalTitle>
            <ModalDescription>Volverás a la lista de cotizaciones.</ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowDiscardConfirm(false)}>Cancelar</Button>
            <Button variant="danger" onClick={() => { setShowDiscardConfirm(false); setShowExportModal(false) }}>
              Descartar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
