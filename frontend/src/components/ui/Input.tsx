import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const inputVariants = cva(
  [
    'w-full rounded-md border bg-white text-gray-900 placeholder:text-gray-400',
    'dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500',
    'transition-colors duration-150',
    'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
    'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-gray-800',
    'read-only:bg-gray-50 dark:read-only:bg-gray-800',
  ],
  {
    variants: {
      size: {
        sm: 'h-8 px-2.5 text-sm',
        md: 'h-9 px-3 text-sm',
        lg: 'h-11 px-4 text-base',
      },
      tone: {
        default: 'border-gray-300 dark:border-gray-700',
        error: 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20',
      },
    },
    defaultVariants: {
      size: 'md',
      tone: 'default',
    },
  }
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  leftAddon?: React.ReactNode
  rightAddon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, tone, leftAddon, rightAddon, ...props }, ref) => {
    if (leftAddon || rightAddon) {
      return (
        <div className="relative flex items-center">
          {leftAddon && (
            <span className="absolute left-3 text-gray-400 pointer-events-none [&_svg]:size-4">
              {leftAddon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              inputVariants({ size, tone }),
              leftAddon && 'pl-9',
              rightAddon && 'pr-9',
              className
            )}
            {...props}
          />
          {rightAddon && (
            <span className="absolute right-3 text-gray-400 [&_svg]:size-4">
              {rightAddon}
            </span>
          )}
        </div>
      )
    }
    return (
      <input
        ref={ref}
        className={cn(inputVariants({ size, tone }), className)}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { inputVariants }
