import React from 'react'
import { useModulos } from '../hooks/useModulos'
import type { Modulo } from '../lib/modulos'
import { Skeleton } from './ui/Skeleton'
import ModuloNoDisponible from '../pages/ModuloNoDisponible'

interface ModuloGuardProps {
  slug: Modulo
  children: React.ReactNode
  fallback?: React.ReactNode
}

function PageSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export function ModuloGuard({ slug, children, fallback }: ModuloGuardProps) {
  const { effective, isLoading } = useModulos()

  if (isLoading) return <PageSkeleton />

  if (!effective || !effective[slug]) {
    return <>{fallback ?? <ModuloNoDisponible slug={slug} />}</>
  }

  return <>{children}</>
}
