import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap',
    'rounded-md transition-all duration-150 ease-out-expo',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
    'disabled:pointer-events-none disabled:opacity-50',
    'select-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-brand-500 text-white shadow-elev-1',
          'hover:bg-brand-600 hover:shadow-elev-2',
          'active:bg-brand-700 active:shadow-elev-1',
          'focus-visible:ring-brand-500',
        ],
        secondary: [
          'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
          'hover:bg-gray-200 dark:hover:bg-gray-700',
          'active:bg-gray-300 dark:active:bg-gray-600',
          'focus-visible:ring-gray-400',
        ],
        outline: [
          'border border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200',
          'hover:bg-gray-50 hover:border-gray-400 dark:hover:bg-gray-800 dark:hover:border-gray-600',
          'focus-visible:ring-brand-500',
        ],
        ghost: [
          'bg-transparent text-gray-700 dark:text-gray-300',
          'hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100',
          'focus-visible:ring-gray-400',
        ],
        danger: [
          'bg-danger-600 text-white shadow-elev-1',
          'hover:bg-danger-700 hover:shadow-elev-2',
          'active:bg-danger-800',
          'focus-visible:ring-danger-500',
        ],
        success: [
          'bg-success-600 text-white shadow-elev-1',
          'hover:bg-success-700 hover:shadow-elev-2',
          'active:bg-success-800',
          'focus-visible:ring-success-500',
        ],
        link: [
          'bg-transparent text-brand-600 dark:text-brand-400 underline-offset-4',
          'hover:underline hover:text-brand-700 dark:hover:text-brand-300',
          'focus-visible:ring-brand-500',
        ],
      },
      size: {
        xs: 'h-7 px-2.5 text-xs gap-1.5 [&_svg]:size-3.5',
        sm: 'h-8 px-3 text-sm gap-1.5 [&_svg]:size-4',
        md: 'h-9 px-4 text-sm [&_svg]:size-4',
        lg: 'h-11 px-6 text-base [&_svg]:size-5',
        icon: 'h-9 w-9 [&_svg]:size-4',
        'icon-sm': 'h-8 w-8 [&_svg]:size-4',
        'icon-xs': 'h-7 w-7 [&_svg]:size-3.5',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, fullWidth, loading, leftIcon, rightIcon, children, disabled, type = 'button', ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { buttonVariants }
