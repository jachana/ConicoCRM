import { create } from 'zustand'
import type { Preferencias, AtajoBusqueda } from '../api/preferencias'

interface State {
  preferencias: Preferencias
  hydrated: boolean
  setAll: (p: Preferencias) => void
  setAtajo: (a: AtajoBusqueda) => void
  setBotonVisible: (v: boolean) => void
  setSidebarHidden: (hidden: string[]) => void
}

const DEFAULTS: Preferencias = {
  busqueda_boton_visible: true,
  busqueda_atajo: 'ctrl_k',
  sidebar_hidden: [],
}

export const usePreferencesStore = create<State>(set => ({
  preferencias: DEFAULTS,
  hydrated: false,
  setAll: p => set({ preferencias: p, hydrated: true }),
  setAtajo: a => set(s => ({ preferencias: { ...s.preferencias, busqueda_atajo: a } })),
  setBotonVisible: v => set(s => ({ preferencias: { ...s.preferencias, busqueda_boton_visible: v } })),
  setSidebarHidden: hidden => set(s => ({ preferencias: { ...s.preferencias, sidebar_hidden: hidden } })),
}))
