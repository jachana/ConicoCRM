import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, X } from 'lucide-react'
import { api } from '../lib/api'

interface ProductoMin { id: number; nombre: string; sku: string | null }

interface Props {
  busqueda: string
  onBusquedaChange: (v: string) => void
  sector: string | null
  onSectorChange: (v: string | null) => void
  productoIds: number[]
  productoNombres: string[]
  onProductosChange: (ids: number[], nombres: string[]) => void
  filterConDeuda: boolean
  onFilterConDeudaChange: (v: boolean) => void
  totalCount: number
}

type OpenPill = 'sector' | 'productos' | null

export default function EmpresaFilters({
  busqueda, onBusquedaChange,
  sector, onSectorChange,
  productoIds, productoNombres, onProductosChange,
  filterConDeuda, onFilterConDeudaChange,
  totalCount,
}: Props) {
  const [openPill, setOpenPill] = useState<OpenPill>(null)
  const [productoSearch, setProductoSearch] = useState('')
  const pillRef = useRef<HTMLDivElement>(null)

  const { data: sectores = [] } = useQuery<string[]>({
    queryKey: ['empresas-sectores'],
    queryFn: () => api.get('/api/empresas/sectores').then(r => r.data),
  })

  const { data: productos = [] } = useQuery<ProductoMin[]>({
    queryKey: ['productos-min', productoSearch],
    queryFn: () =>
      api.get(`/api/productos/?q=${encodeURIComponent(productoSearch)}&limit=50`).then(r =>
        Array.isArray(r.data) ? r.data : r.data.items ?? []
      ),
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setOpenPill(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function togglePill(pill: OpenPill) {
    setOpenPill(prev => prev === pill ? null : pill)
  }

  function toggleProducto(p: ProductoMin) {
    if (productoIds.includes(p.id)) {
      onProductosChange(
        productoIds.filter(id => id !== p.id),
        productoNombres.filter((_, i) => productoIds[i] !== p.id),
      )
    } else {
      onProductosChange([...productoIds, p.id], [...productoNombres, p.nombre])
    }
  }

  const pillBase = 'flex items-center rounded-full border text-sm transition-colors'
  const pillInactive = 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
  const pillActive = 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300'

  return (
    <div className="flex gap-2 flex-wrap items-center px-4 py-2 border-b border-gray-200 dark:border-gray-800" ref={pillRef}>
      {/* Text search */}
      <input
        value={busqueda}
        onChange={e => onBusquedaChange(e.target.value)}
        placeholder="Buscar nombre / RUT..."
        className="bg-gray-100 dark:bg-gray-800 text-sm rounded-full px-3 py-1.5 text-gray-700 dark:text-gray-300 placeholder-gray-400 border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-brand-400 min-w-[180px]"
      />

      {/* Sector pill */}
      <div className="relative flex-shrink-0">
        <div className={`${pillBase} ${sector ? pillActive : pillInactive}`}>
          <button onClick={() => togglePill('sector')} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5">
            <span className="whitespace-nowrap">{sector ? `Sector: ${sector}` : 'Sector'}</span>
            <ChevronDown size={13} className={`transition-transform ${openPill === 'sector' ? 'rotate-180' : ''} text-gray-400`} />
          </button>
          {sector && (
            <button onClick={e => { e.stopPropagation(); onSectorChange(null) }}
              aria-label="Limpiar sector"
              className="pr-2 pl-0.5 py-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <X size={13} />
            </button>
          )}
        </div>
        {openPill === 'sector' && (
          <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 min-w-[180px]">
            {sectores.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">Sin sectores</div>
            )}
            {sectores.map(s => (
              <button key={s} onClick={() => { onSectorChange(s === sector ? null : s); setOpenPill(null) }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 ${sector === s ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Productos multi-select pill */}
      <div className="relative flex-shrink-0">
        <div className={`${pillBase} ${productoIds.length > 0 ? pillActive : pillInactive}`}>
          <button onClick={() => togglePill('productos')} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5">
            <span className="whitespace-nowrap">
              {productoIds.length > 0
                ? `Productos (${productoIds.length})`
                : 'Productos'}
            </span>
            <ChevronDown size={13} className={`transition-transform ${openPill === 'productos' ? 'rotate-180' : ''} text-gray-400`} />
          </button>
          {productoIds.length > 0 && (
            <button onClick={e => { e.stopPropagation(); onProductosChange([], []) }}
              aria-label="Limpiar productos"
              className="pr-2 pl-0.5 py-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <X size={13} />
            </button>
          )}
        </div>
        {openPill === 'productos' && (
          <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 w-72">
            <div className="px-3 pb-2">
              <input
                value={productoSearch}
                onChange={e => setProductoSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full bg-gray-100 dark:bg-gray-700 text-sm rounded px-2 py-1 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none"
                autoFocus
              />
            </div>
            {productoIds.length > 0 && (
              <>
                <div className="px-3 py-1 text-xs font-medium text-gray-400 uppercase tracking-wide">Seleccionados</div>
                {productoIds.map((id, idx) => (
                  <button key={id}
                    onClick={() => toggleProducto({ id, nombre: productoNombres[idx], sku: null })}
                    className="flex items-center justify-between w-full px-3 py-1.5 text-sm text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/30">
                    <span>{productoNombres[idx]}</span>
                    <X size={11} />
                  </button>
                ))}
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
              </>
            )}
            <div className="px-3 py-1 text-xs font-medium text-gray-400 uppercase tracking-wide">Productos</div>
            {productos
              .filter(p => !productoIds.includes(p.id))
              .slice(0, 20)
              .map(p => (
                <button key={p.id} onClick={() => toggleProducto(p)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-left">
                  {p.sku && <span className="text-gray-400 text-xs font-mono">{p.sku}</span>}
                  <span>{p.nombre}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Con Deuda toggle */}
      <button onClick={() => onFilterConDeudaChange(!filterConDeuda)}
        className={`${pillBase} px-3 py-1.5 ${filterConDeuda ? pillActive : pillInactive}`}>
        Con Deuda
      </button>

      <span className="ml-auto text-xs text-gray-400">{totalCount} empresa{totalCount !== 1 ? 's' : ''}</span>
    </div>
  )
}
