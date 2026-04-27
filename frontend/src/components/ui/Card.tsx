import * as React from 'react'
import { cn } from '../../lib/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'subtle' | 'elevated'
  padded?: boolean
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padded = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border bg-white dark:bg-gray-900',
        variant === 'default' && 'border-gray-200 dark:border-gray-800 shadow-elev-1',
        variant === 'subtle' && 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50',
        variant === 'elevated' && 'border-gray-200 dark:border-gray-800 shadow-elev-2',
        padded && 'p-5',
        className
      )}
      {...props}
    />
  )
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1 px-5 pt-5 pb-3', className)}
      {...props}
    />
  )
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight', className)}
      {...props}
    />
  )
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm text-gray-500 dark:text-gray-400', className)}
      {...props}
    />
  )
)
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 py-4', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-800',
        className
      )}
      {...props}
    />
  )
)
CardFooter.displayName = 'CardFooter'
