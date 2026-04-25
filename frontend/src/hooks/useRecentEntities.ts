import { useState, useCallback } from 'react'

export type RecentTipo =
  | 'producto' | 'cliente' | 'empresa'
  | 'cotizacion' | 'nota_venta' | 'factura' | 'orden_compra'
  | 'empleado'

export interface RecentEntity {
  tipo: RecentTipo
  id: number
  titulo: string
  subtitulo?: string
  estado?: string
  addedAt: string
}

const STORAGE_KEY = 'conico:recientes'
const MAX = 5

function readSafe(): RecentEntity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (it): it is RecentEntity =>
        it && typeof it.tipo === 'string' && typeof it.id === 'number' && typeof it.titulo === 'string'
    )
  } catch {
    return []
  }
}

export function useRecentEntities() {
  const [items, setItems] = useState<RecentEntity[]>(readSafe)

  const push = useCallback((entry: Omit<RecentEntity, 'addedAt'>) => {
    setItems(prev => {
      const filtered = prev.filter(p => !(p.tipo === entry.tipo && p.id === entry.id))
      const next = [{ ...entry, addedAt: new Date().toISOString() }, ...filtered].slice(0, MAX)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* quota / disabled */ }
      return next
    })
  }, [])

  return { recientes: items, push }
}
