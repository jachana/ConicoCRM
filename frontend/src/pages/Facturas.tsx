import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'
import { Eye, ChevronDown, X, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import type { FacturaList, FlatLine } from '../types'
import ExportPreviewPanel from '../components/ExportPreviewPanel'
import { FACTURA_COLUMN_DEFS } from '../lib/columnDefs'
import {
  Button, Input, Badge, EmptyState, Skeleton, Card, CardContent,
  Table, THead, TBody, TR, TH, TD,
  Tooltip,
} from '../components/ui'

// ── Constants ──────────────────────────────────────────────────────────────────

const ESTADO_LABELS: Record<string, string> = {
  emitida: 'Emitida',
  pagada:  'Pagada',
  parcial: 'Parcial',
  anulada: 'Anulada',
}

const ESTADO_VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  emitida: 'info',
  pagada:  'success',
  parcial: 'warning',
  anulada: 'danger',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

function MargenBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-gray-400 text-xs">—</span>
  const pct = Math.round(value * 1000) / 10
  const color = pct < 15 ? 'text-danger-600 dark:text-danger-400'
    : pct < 25 ? 'text-warning-600 dark:text-warning-400'
    : 'text-success-600 dark:text-success-400'
  return <span className={`font-medium text-sm font-num ${color}`}>{pct.toFixed(1)}%</span>
}

// ── Filter Pill ────────────────────────────────────────────────────────────────

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
            aria-label="Limpiar filtro"
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

const checkboxCls = 'flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-sm text-gray-800 dark:text-gray-200'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProductoMin { id: number; nombre: string; sku: string | null }

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Facturas() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const { role: effectiveRole } = useEffectivePermissions()
  const isVendedor = (effectiveRole ?? user?.role) === 'vendedor'

  // Filter state
  const [estados, setEstados] = useState<string[]>([])
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [empresaNombre, setEmpresaNombre] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [montoMin, setMontoMin] = useState('')
  const [montoMax, setMontoMax] = useState('')
  const [productos, setProductos] = useState<ProductoMin[]>([])
  const [productoSearch, setProductoSearch] = useState('')
  const [openPill, setOpenPill] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'preview'>('list')
  const filterBarRef = useRef<HTMLDivElement>(null)

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

  // Reference data queries
  const { data: empresas = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['empresas-list'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
    staleTime: 5 * 60_000,
  })
  const { data: clientes = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['clientes-min'],
    queryFn: () => api.get('/api/clientes/').then(r => r.data),
    staleTime: 5 * 60_000,
  })
  const { data: productoResults = [] } = useQuery<ProductoMin[]>({
    queryKey: ['productos-search', productoSearch],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(productoSearch)}`).then(r => r.data),
    enabled: productoSearch.length >= 1,
    staleTime: 30_000,
  })

  // Build list params
  const listParams = useMemo(() => {
    const p = new URLSearchParams()
    estados.forEach(e => p.append('estado', e))
    if (clienteId) p.append('cliente_id', String(clienteId))
    if (empresaId) p.append('empresa_id', String(empresaId))
    if (fechaDesde) p.append('fecha_desde', fechaDesde)
    if (fechaHasta) p.append('fecha_hasta', fechaHasta)
    if (montoMin) p.append('monto_min', montoMin)
    if (montoMax) p.append('monto_max', montoMax)
    productos.forEach(prod => p.append('producto_id', String(prod.id)))
    return p.toString()
  }, [estados, clienteId, empresaId, fechaDesde, fechaHasta, montoMin, montoMax, productos])

  const { data: facturas = [], isLoading } = useQuery<FacturaList[]>({
    queryKey: ['facturas-list', listParams],
    queryFn: () => api.get(`/api/facturas/${listParams ? '?' + listParams : ''}`).then(r => r.data),
  })

  const exportBaseUrl = useMemo(() => {
    return `/api/facturas/export/excel${listParams ? '?' + listParams : ''}`
  }, [listParams])

  const flatLines = useMemo<FlatLine[]>(() =>
    facturas.flatMap(f =>
      f.lineas.map(l => ({
        numero: f.numero,
        fecha: f.fecha,
        estado: f.estado,
        cliente_nombre: f.cliente?.nombre ?? '',
        empresa_nombre: f.empresa?.nombre ?? '',
        encargado: f.vendedor?.name ?? '',
        contacto: f.contacto ?? '',
        sku: l.sku ?? '',
        descripcion: l.descripcion,
        formato: l.formato ?? '',
        cantidad: l.cantidad,
        precio_unit: Number(l.valor_neto),
        total_neto: Number(l.total_neto),
        margen: l.margen ?? null,
        fecha_vencimiento: f.fecha_vencimiento ?? '',
        monto_pagado: f.monto_pagado ?? null,
        metodo_pago: f.metodo_pago ?? '',
        fecha_pago: f.fecha_pago ?? '',
      }))
    ), [facturas])

  const exportFilename = useMemo(
    () => `facturas-${new Date().toISOString().split('T')[0]}.xlsx`,
    [],
  )

  const hasFilters = estados.length > 0 || !!clienteId || !!empresaId ||
    !!fechaDesde || !!fechaHasta || !!montoMin || !!montoMax || productos.length > 0

  function clearAll() {
    setEstados([]); setClienteId(null); setClienteNombre('')
    setEmpresaId(null); setEmpresaNombre(''); setFechaDesde(''); setFechaHasta('')
    setMontoMin(''); setMontoMax(''); setProductos([]); setProductoSearch('')
  }

  const fechaSummary = fechaDesde && fechaHasta
    ? `${fmtDate(fechaDesde)} – ${fmtDate(fechaHasta)}`
    : fechaDesde ? `Desde ${fmtDate(fechaDesde)}`
    : `Hasta ${fmtDate(fechaHasta)}`

  const montoSummary = montoMin && montoMax
    ? `$${Number(montoMin).toLocaleString()} – $${Number(montoMax).toLocaleString()}`
    : montoMin ? `Mín $${Number(montoMin).toLocaleString()}`
    : `Máx $${Number(montoMax).toLocaleString()}`

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Facturas</h1>
      </div>

      {/* Filter bar */}
      <div ref={filterBarRef} className="mb-4">
        <div className="flex flex-wrap gap-2 items-center">

          {/* Estado */}
          <FilterPill label="Estado" active={estados.length > 0}
            summary={estados.length === 1 ? ESTADO_LABELS[estados[0]] ?? estados[0] : estados.length > 1 ? `${estados.length} estados` : undefined}
            isOpen={openPill === 'estado'} onToggle={() => togglePill('estado')}
            onClear={() => setEstados([])}>
            {Object.entries(ESTADO_LABELS).map(([value, lbl]) => (
              <label key={value} className={checkboxCls}>
                <input type="checkbox" className="rounded border-gray-300 accent-brand-500"
                  checked={estados.includes(value)}
                  onChange={ev => setEstados(prev => ev.target.checked ? [...prev, value] : prev.filter(v => v !== value))} />
                {lbl}
              </label>
            ))}
          </FilterPill>

          {/* Empresa */}
          <FilterPill label="Empresa" active={!!empresaId} summary={empresaNombre}
            isOpen={openPill === 'empresa'} onToggle={() => togglePill('empresa')}
            onClear={() => { setEmpresaId(null); setEmpresaNombre('') }}>
            <div className="max-h-56 overflow-y-auto">
              {empresas.map(e => (
                <button key={e.id} onClick={() => { setEmpresaId(e.id); setEmpresaNombre(e.nombre); setOpenPill(null) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors
                    ${empresaId === e.id ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                  {e.nombre}
                </button>
              ))}
            </div>
          </FilterPill>

          {/* Cliente */}
          <FilterPill label="Cliente" active={!!clienteId} summary={clienteNombre}
            isOpen={openPill === 'cliente'} onToggle={() => togglePill('cliente')}
            onClear={() => { setClienteId(null); setClienteNombre('') }}>
            <div className="max-h-56 overflow-y-auto">
              {clientes.map(c => (
                <button key={c.id} onClick={() => { setClienteId(c.id); setClienteNombre(c.nombre); setOpenPill(null) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors
                    ${clienteId === c.id ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                  {c.nombre}
                </button>
              ))}
            </div>
          </FilterPill>

          {/* Fechas */}
          <FilterPill label="Fechas" active={!!(fechaDesde || fechaHasta)} summary={fechaSummary}
            isOpen={openPill === 'fechas'} onToggle={() => togglePill('fechas')}
            onClear={() => { setFechaDesde(''); setFechaHasta('') }} wide>
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

          {/* Monto */}
          <FilterPill label="Monto" active={!!(montoMin || montoMax)} summary={montoSummary}
            isOpen={openPill === 'monto'} onToggle={() => togglePill('monto')}
            onClear={() => { setMontoMin(''); setMontoMax('') }} wide>
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

          {/* Productos */}
          <FilterPill label="Productos" active={productos.length > 0}
            summary={productos.length === 1 ? (productos[0].sku ?? productos[0].nombre) : productos.length > 1 ? `${productos.length} productos` : ''}
            isOpen={openPill === 'productos'} onToggle={() => togglePill('productos')}
            onClear={() => { setProductos([]); setProductoSearch('') }} wide>
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
                    {p.sku ?? p.nombre}
                    <button
                      onClick={() => setProductos(prev => prev.filter(x => x.id !== p.id))}
                      aria-label="Quitar producto"
                    >
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
            <button onClick={clearAll}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1 underline underline-offset-2 flex-shrink-0">
              Limpiar todo
            </button>
          )}
        </div>
      </div>

      {/* Mobile tab toggle */}
      <div className="lg:hidden flex gap-0 mb-4 border-b border-gray-200 dark:border-gray-800">
        {(['list', 'preview'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 dark:text-gray-400'
            }`}>
            {tab === 'list' ? 'Lista' : 'Vista previa'}
          </button>
        ))}
      </div>

      {/* Split layout */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">

        {/* Left: list */}
        <div className={activeTab === 'list' ? '' : 'hidden lg:block'}>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : facturas.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="Sin facturas"
              description="No hay facturas que coincidan con los filtros seleccionados."
            />
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {facturas.map(f => (
                  <Card key={f.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-num">FAC-{String(f.numero).padStart(5, '0')}</span>
                          <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight mt-0.5">{f.cliente?.nombre ?? '—'}</p>
                          {f.empresa?.nombre && <p className="text-xs text-gray-400 leading-tight">{f.empresa.nombre}</p>}
                        </div>
                        <Badge variant={ESTADO_VARIANT[f.estado] ?? 'neutral'} size="sm">
                          {ESTADO_LABELS[f.estado] ?? f.estado}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-num">{fmtDate(f.fecha)}</span>
                        <div className="flex items-center gap-3">
                          {!isVendedor && <MargenBadge value={f.margen_total} />}
                          <span className="font-semibold text-gray-900 dark:text-white text-sm font-num">{fmtMoney(f.total)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <Button size="xs" variant="ghost" leftIcon={<Eye />} className="flex-1" onClick={() => navigate(`/facturas/${f.id}`)}>
                          Ver
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <Card className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Nº</TH>
                        <TH>Fecha</TH>
                        <TH>Cliente / Empresa</TH>
                        <TH className="text-right">Total</TH>
                        {!isVendedor && <TH className="text-right">Margen</TH>}
                        <TH>Estado</TH>
                        <TH className="text-right">Acciones</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {facturas.map(f => (
                        <TR key={f.id} interactive onClick={() => navigate(`/facturas/${f.id}`)}>
                          <TD className="font-medium text-gray-900 dark:text-white font-num">
                            FAC-{String(f.numero).padStart(5, '0')}
                          </TD>
                          <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">{fmtDate(f.fecha)}</TD>
                          <TD>
                            <div className="text-gray-900 dark:text-white leading-tight">{f.cliente?.nombre ?? '—'}</div>
                            {f.empresa?.nombre && <div className="text-xs text-gray-400 leading-tight">{f.empresa.nombre}</div>}
                          </TD>
                          <TD className="font-medium text-gray-900 dark:text-white whitespace-nowrap text-right font-num">{fmtMoney(f.total)}</TD>
                          {!isVendedor && <TD className="text-right"><MargenBadge value={f.margen_total} /></TD>}
                          <TD>
                            <Badge variant={ESTADO_VARIANT[f.estado] ?? 'neutral'} showDot>
                              {ESTADO_LABELS[f.estado] ?? f.estado}
                            </Badge>
                          </TD>
                          <TD onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              <Tooltip label="Ver">
                                <Button size="icon-xs" variant="ghost" onClick={() => navigate(`/facturas/${f.id}`)} aria-label="Ver factura">
                                  <Eye />
                                </Button>
                              </Tooltip>
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
        </div>

        {/* Right: preview panel */}
        <div className={activeTab === 'preview' ? '' : 'hidden lg:block'}>
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Vista previa exportación
              </h2>
              <ExportPreviewPanel
                lines={flatLines}
                availableColumns={FACTURA_COLUMN_DEFS}
                isLoading={isLoading}
                exportBaseUrl={exportBaseUrl}
                storageKey="facturas-preview-cols"
                filename={exportFilename}
              />
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
