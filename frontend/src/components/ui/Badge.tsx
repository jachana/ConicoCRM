import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        brand:   'bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300',
        success: 'bg-success-100 text-success-800 dark:bg-success-500/15 dark:text-success-300',
        warning: 'bg-warning-100 text-warning-800 dark:bg-warning-500/15 dark:text-warning-300',
        danger:  'bg-danger-100 text-danger-800 dark:bg-danger-500/15 dark:text-danger-300',
        info:    'bg-info-100 text-info-800 dark:bg-info-500/15 dark:text-info-300',
        outline: 'border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-[10px]',
        md: 'px-2 py-0.5 text-xs',
        lg: 'px-2.5 py-1 text-sm',
      },
      dot: {
        true: 'pl-1.5',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'md',
    },
  }
)

const dotColorMap = {
  neutral: 'bg-gray-500',
  brand:   'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger:  'bg-danger-500',
  info:    'bg-info-500',
  outline: 'bg-gray-500',
} as const

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  showDot?: boolean
}

export function Badge({ className, variant = 'neutral', size, showDot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size, dot: showDot }), className)} {...props}>
      {showDot && (
        <span className={cn('size-1.5 rounded-full flex-shrink-0', dotColorMap[variant ?? 'neutral'])} />
      )}
      {children}
    </span>
  )
}

export { badgeVariants }
