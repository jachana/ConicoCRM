import * as React from 'react'
import { cn } from '../../lib/cn'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: 'rect' | 'circle' | 'text'
}

export function Skeleton({ className, shape = 'rect', ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-gray-200 dark:bg-gray-800',
        shape === 'rect' && 'rounded-md',
        shape === 'circle' && 'rounded-full',
        shape === 'text' && 'rounded-sm h-4',
        className
      )}
      {...props}
    />
  )
}
