import { Search } from 'lucide-react'
import { usePreferencesStore } from '../../stores/preferences'
import type { AtajoBusqueda } from '../../api/preferencias'

const LABELS_WIN: Record<AtajoBusqueda, string> = {
  ctrl_k: 'Ctrl+K',
  ctrl_p: 'Ctrl+P',
  ctrl_shift_f: 'Ctrl+Shift+F',
  alt_s: 'Alt+S',
}

const LABELS_MAC: Record<AtajoBusqueda, string> = {
  ctrl_k: '⌘K',
  ctrl_p: '⌘P',
  ctrl_shift_f: '⌘⇧F',
  alt_s: '⌥S',
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toUpperCase().includes('MAC')
}

export function atajoLabel(atajo: AtajoBusqueda): string {
  return (isMac() ? LABELS_MAC : LABELS_WIN)[atajo]
}

interface Props {
  onClick: () => void
}

export default function SearchButton({ onClick }: Props) {
  const prefs = usePreferencesStore(s => s.preferencias)
  if (!prefs.busqueda_boton_visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors"
      aria-label="Búsqueda global"
    >
      <Search size={14} />
      <span className="hidden sm:inline">Buscar</span>
      <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400">
        {atajoLabel(prefs.busqueda_atajo)}
      </kbd>
    </button>
  )
}
