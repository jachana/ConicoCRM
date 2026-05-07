import { useCallback, useEffect, useMemo, useState } from 'react'

export interface ColumnDef {
  key: string
  label: string
  alwaysVisible?: boolean
  defaultHidden?: boolean
}

const STORAGE_PREFIX = 'col-vis:'

function loadHidden(tableKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + tableKey)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed.map(String))
    return new Set()
  } catch {
    return new Set()
  }
}

function saveHidden(tableKey: string, hidden: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + tableKey, JSON.stringify(Array.from(hidden)))
  } catch {
    // ignore quota errors
  }
}

export function useColumnVisibility(tableKey: string, columns: ColumnDef[]) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    const stored = loadHidden(tableKey)
    if (stored.size > 0) return stored
    const initial = new Set<string>()
    columns.forEach(c => { if (c.defaultHidden && !c.alwaysVisible) initial.add(c.key) })
    return initial
  })

  useEffect(() => { saveHidden(tableKey, hidden) }, [tableKey, hidden])

  const isVisible = useCallback(
    (key: string) => !hidden.has(key),
    [hidden]
  )

  const toggle = useCallback((key: string) => {
    setHidden(prev => {
      const col = columns.find(c => c.key === key)
      if (col?.alwaysVisible) return prev
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [columns])

  const reset = useCallback(() => {
    const initial = new Set<string>()
    columns.forEach(c => { if (c.defaultHidden && !c.alwaysVisible) initial.add(c.key) })
    setHidden(initial)
  }, [columns])

  const visibleKeys = useMemo(
    () => columns.filter(c => !hidden.has(c.key)).map(c => c.key),
    [columns, hidden]
  )

  return { isVisible, toggle, reset, hidden, visibleKeys, columns }
}

export type ColumnVisibilityApi = ReturnType<typeof useColumnVisibility>
