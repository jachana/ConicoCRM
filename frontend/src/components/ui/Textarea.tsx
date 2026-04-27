import * as React from 'react'
import { cn } from '../../lib/cn'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  tone?: 'default' | 'error'
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, tone = 'default', rows = 3, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          'w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400',
          'dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500',
          'transition-colors duration-150 resize-y',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
          'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-gray-800',
          tone === 'error'
            ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20'
            : 'border-gray-300 dark:border-gray-700',
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'
