import { openPdf } from '../lib/pdf'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Mail, Trash2, Eye, ChevronDown, X } from 'lucide-react'
import { api } from '../lib/api'
import type { Cotizacion } from '../types'
import ExportPreviewPanel from '../components/ExportPreviewPanel'
import { COTIZACION_COLUMN_DEFS } from '../lib/columnDefs'
import type { FlatLine } from '../types'

// ── Constants ──────────────────────────────────────────────────────────────────

const ESTADO_LABELS: Record<string, string> = {
  no_definido: 'Sin definir',
  abierta: 'Abierta',
  aprobada: 'Aprobada',
  cerrada_fv: 'Cerrada (FV)',
  rechazada: 'Rechazada',
}

const ESTADO_COLORS: Record<string, string> = {
  no_definido: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  abierta: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  aprobada: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cerrada_fv: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rechazada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function MargenBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-gray-400 text-xs">—</span>
  const pct = Math.round(value * 1000) / 10
  const color = pct < 15 ? 'text-red-600 dark:text-red-400'
    : pct < 25 ? 'text-orange-500 dark:text-orange-400'
    : 'text-green-600 dark:text-green-400'
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
          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
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
        <div className={`absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 ${wide ? 'w-80' : 'min-w-[200px]'}`}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserMin { id: number; name: string }
interface EmpresaMin { id: number; nombre: string }
interface ProductoMin { id: number; nombre: string; sku: string | null }

// ── Module-level helpers ───────────────────────────────────────────────────────

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

// ── Main component ─────────────────────────────────────────────────────────────

export default function Cotizaciones() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [estados, setEstados] = useState<string[]>([])
  const [emisorId, setEmisorId] = useState<number | null>(null)
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [montoMin, setMontoMin] = useState('')
  const [montoMax, setMontoMax] = useState('')
  const [productos, setProductos] = useState<ProductoMin[]>([])   // OR list
  const [productoSearch, setProductoSearch] = useState('')

  // ── Popover state ─────────────────────────────────────────────────────────────
  const [openPill, setOpenPill] = useState<string | null>(null)
  const filterBarRef = useRef<HTMLDivElement>(null)

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'preview'>('list')

  // Close popovers on outside click
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

  // ── Reference data ────────────────────────────────────────────────────────────
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

  // ── Build query params ────────────────────────────────────────────────────────
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

  // ── Data ──────────────────────────────────────────────────────────────────────
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
    onSuccess: () => { setEmailToast({ msg: 'Email enviado correctamente', ok: true }); setTimeout(() => setEmailToast(null), 3500) },
    onError: (err: any) => { setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false }); setTimeout(() => setEmailToast(null), 4000) },
  })

  // ── Filter pill helpers ────────────────────────────────────────────────────────
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

  const checkboxCls = 'flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-800 dark:text-gray-200'

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Cotizaciones</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/cotizaciones/nueva')}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-500 hover:bg-brand-400 text-gray-900 text-sm font-semibold rounded-lg transition-colors">
            <Plus size={16} />
            <span className="hidden sm:inline">Nueva cotización</span>
            <span className="sm:hidden">Nueva</span>
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div ref={filterBarRef} className="mb-4">
        <div className="flex flex-wrap gap-2 items-center">

          {/* Estado */}
          <FilterPill
            label="Estado" active={estados.length > 0}
            summary={estados.length === 1 ? ESTADO_LABELS[estados[0]] : `${estados.length} estados`}
            isOpen={openPill === 'estado'} onToggle={() => togglePill('estado')}
            onClear={() => setEstados([])}
          >
            {Object.entries(ESTADO_LABELS).map(([value, lbl]) => (
              <label key={value} className={checkboxCls}>
                <input type="checkbox" className="rounded border-gray-300"
                  checked={estados.includes(value)}
                  onChange={e => setEstados(prev => e.target.checked ? [...prev, value] : prev.filter(v => v !== value))} />
                {lbl}
              </label>
            ))}
          </FilterPill>

          {/* Emisor */}
          <FilterPill
            label="Emisor" active={!!emisorId} summary={emisorName}
            isOpen={openPill === 'emisor'} onToggle={() => togglePill('emisor')}
            onClear={() => setEmisorId(null)}
          >
            <div className="max-h-56 overflow-y-auto">
              {users.map(u => (
                <button key={u.id} onClick={() => { setEmisorId(u.id); setOpenPill(null) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                    ${emisorId === u.id ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                  {u.name}
                </button>
              ))}
            </div>
          </FilterPill>

          {/* Empresa */}
          <FilterPill
            label="Empresa" active={!!empresaId} summary={empresaNombre}
            isOpen={openPill === 'empresa'} onToggle={() => togglePill('empresa')}
            onClear={() => setEmpresaId(null)}
          >
            <div className="max-h-56 overflow-y-auto">
              {empresas.map(e => (
                <button key={e.id} onClick={() => { setEmpresaId(e.id); setOpenPill(null) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                    ${empresaId === e.id ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                  {e.nombre}
                </button>
              ))}
            </div>
          </FilterPill>

          {/* Fechas */}
          <FilterPill
            label="Fechas" active={!!(fechaDesde || fechaHasta)} summary={fechaSummary}
            isOpen={openPill === 'fechas'} onToggle={() => togglePill('fechas')}
            onClear={() => { setFechaDesde(''); setFechaHasta('') }}
            wide
          >
            <div className="px-3 py-2 space-y-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Desde</p>
                <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Hasta</p>
                <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
            </div>
          </FilterPill>

          {/* Monto */}
          <FilterPill
            label="Monto" active={!!(montoMin || montoMax)} summary={montoSummary}
            isOpen={openPill === 'monto'} onToggle={() => togglePill('monto')}
            onClear={() => { setMontoMin(''); setMontoMax('') }}
            wide
          >
            <div className="px-3 py-2 space-y-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Mínimo</p>
                <input type="number" placeholder="0" value={montoMin} onChange={e => setMontoMin(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Máximo</p>
                <input type="number" placeholder="∞" value={montoMax} onChange={e => setMontoMax(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
            </div>
          </FilterPill>

          {/* Productos */}
          <FilterPill
            label="Productos" active={productos.length > 0}
            summary={productos.length === 1 ? productos[0].nombre : `${productos.length} productos`}
            isOpen={openPill === 'productos'} onToggle={() => togglePill('productos')}
            onClear={() => { setProductos([]); setProductoSearch('') }}
            wide
          >
            <div className="px-3 pt-2 pb-1">
              <input
                autoFocus
                type="text"
                placeholder="Buscar producto..."
                value={productoSearch}
                onChange={e => setProductoSearch(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            {/* Selected chips */}
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
            {/* Search results */}
            {productoResults.length > 0 && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-700 mt-1" />
                <div className="max-h-48 overflow-y-auto py-1">
                  {productoResults
                    .filter(r => !productos.some(p => p.id === r.id))
                    .map(r => (
                      <button key={r.id}
                        onClick={() => setProductos(prev => [...prev, r])}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-800 dark:text-gray-200 flex items-center justify-between gap-2">
                        <span className="truncate">{r.nombre}</span>
                        {r.sku && <span className="text-xs text-gray-400 flex-shrink-0">{r.sku}</span>}
                      </button>
                    ))}
                </div>
              </>
            )}
            {productoSearch.length >= 1 && productoResults.filter(r => !productos.some(p => p.id === r.id)).length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
            )}
          </FilterPill>

          {/* Clear all */}
          {hasFilters && (
            <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1 underline underline-offset-2 flex-shrink-0">
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
            <div className="text-gray-400 py-12 text-center text-sm">Cargando...</div>
          ) : cotizaciones.length === 0 ? (
            <div className="text-gray-400 py-12 text-center text-sm">Sin cotizaciones</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {cotizaciones.map(c => (
                  <div key={c.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-num">COT-{String(c.numero).padStart(5, '0')}</span>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight mt-0.5">{c.cliente?.nombre ?? '—'}</p>
                        {c.empresa?.nombre && <p className="text-xs text-gray-400 leading-tight">{c.empresa.nombre}</p>}
                      </div>
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[c.estado] ?? ''}`}>
                        {ESTADO_LABELS[c.estado] ?? c.estado}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 dark:text-gray-400 space-x-2">
                        <span>{fmtDate(c.fecha)}</span>
                        {c.vendedor?.name && <span>· {c.vendedor.name}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <MargenBadge value={c.margen_total} />
                        <span className="font-semibold text-gray-900 dark:text-white text-sm font-num">{fmtMoney(c.total)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <button onClick={() => navigate(`/cotizaciones/${c.id}`)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                        <Eye size={14} /> Ver
                      </button>
                      <button onClick={() => openPdf(`/api/cotizaciones/${c.id}/pdf`)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-orange-600 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
                        <FileText size={14} /> PDF
                      </button>
                      <button onClick={() => emailMut.mutate(c.id)} disabled={emailMut.isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                        <Mail size={14} /> Email
                      </button>
                      {c.estado === 'no_definido' && (
                        <button onClick={() => { setDeleteId(c.id); setDeleteError('') }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <Trash2 size={14} /> Borrar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                    <tr>
                      {['Nº', 'Fecha', 'Cliente / Empresa', 'Total', 'Margen', 'Estado', 'Encargado', 'Acciones'].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {cotizaciones.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white font-num">
                          COT-{String(c.numero).padStart(5, '0')}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(c.fecha)}</td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900 dark:text-white leading-tight">{c.cliente?.nombre ?? '-'}</div>
                          {c.empresa?.nombre && <div className="text-xs text-gray-400 leading-tight">{c.empresa.nombre}</div>}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap font-num">{fmtMoney(c.total)}</td>
                        <td className="px-4 py-3"><MargenBadge value={c.margen_total} /></td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[c.estado] ?? ''}`}>
                            {ESTADO_LABELS[c.estado] ?? c.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.vendedor?.name ?? '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => navigate(`/cotizaciones/${c.id}`)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Ver/Editar">
                              <Eye size={15} />
                            </button>
                            <button onClick={() => openPdf(`/api/cotizaciones/${c.id}/pdf`)}
                              className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors" title="PDF">
                              <FileText size={15} />
                            </button>
                            <button onClick={() => emailMut.mutate(c.id)} disabled={emailMut.isPending}
                              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors" title="Enviar email">
                              <Mail size={15} />
                            </button>
                            {c.estado === 'no_definido' && (
                              <button onClick={() => { setDeleteId(c.id); setDeleteError('') }}
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Eliminar">
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Right: preview panel */}
        <div className={activeTab === 'preview' ? '' : 'hidden lg:block'}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Vista previa exportación
            </h2>
            <ExportPreviewPanel
              lines={flatLines}
              availableColumns={COTIZACION_COLUMN_DEFS}
              isLoading={isLoading}
              exportBaseUrl={exportBaseUrl}
              storageKey="cotizaciones-preview-cols"
              filename={exportFilename}
            />
          </div>
        </div>

      </div>

      {/* Delete modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">¿Eliminar cotización?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Esta acción no se puede deshacer.</p>
            {deleteError && <p className="text-sm text-red-500 mb-3">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDeleteId(null); setDeleteError('') }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Cancelar
              </button>
              <button onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                {deleteMut.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {emailToast && (
        <div className={`fixed bottom-20 md:bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${emailToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {emailToast.msg}
        </div>
      )}
    </div>
  )
}
