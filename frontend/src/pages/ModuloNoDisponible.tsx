import { Lock } from 'lucide-react'
import { MODULO_META } from '../lib/modulos'
import type { Modulo } from '../lib/modulos'

interface Props {
  slug?: Modulo
}

export default function ModuloNoDisponible({ slug }: Props) {
  const label = slug ? MODULO_META[slug]?.label : undefined

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center p-8">
      <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-4">
        <Lock className="h-8 w-8 text-gray-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {label ? `Módulo "${label}" no disponible` : 'Módulo no disponible'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          Este módulo no está habilitado para tu empresa. Contacta al administrador para activarlo.
        </p>
      </div>
    </div>
  )
}
