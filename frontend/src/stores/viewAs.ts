import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User } from '../types'

interface ViewAsState {
  targetUser: User | null
  setTarget: (user: User | null) => void
  clear: () => void
}

export const useViewAsStore = create<ViewAsState>()(
  persist(
    (set) => ({
      targetUser: null,
      setTarget: (targetUser) => set({ targetUser }),
      clear: () => set({ targetUser: null }),
    }),
    {
      name: 'conico-view-as',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
