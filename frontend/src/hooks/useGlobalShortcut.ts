import { useEffect } from 'react'
import type { AtajoBusqueda } from '../api/preferencias'

interface ShortcutDef {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
}

const MAP: Record<AtajoBusqueda, ShortcutDef> = {
  ctrl_k:        { key: 'k', ctrl: true, meta: true },
  ctrl_p:        { key: 'p', ctrl: true, meta: true },
  ctrl_shift_f:  { key: 'f', ctrl: true, meta: true, shift: true },
  alt_s:         { key: 's', alt: true },
}

function matches(ev: KeyboardEvent, def: ShortcutDef): boolean {
  if (ev.key.toLowerCase() !== def.key) return false
  const isCtrlOrMeta = ev.ctrlKey || ev.metaKey
  if ((def.ctrl || def.meta) && !isCtrlOrMeta) return false
  if (!def.ctrl && !def.meta && isCtrlOrMeta) return false
  if (!!def.shift !== ev.shiftKey) return false
  if (!!def.alt !== ev.altKey) return false
  return true
}

export function useGlobalShortcut(atajo: AtajoBusqueda, onTrigger: () => void): void {
  useEffect(() => {
    const def = MAP[atajo]
    function handler(ev: KeyboardEvent) {
      if (matches(ev, def)) {
        ev.preventDefault()
        onTrigger()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [atajo, onTrigger])
}
