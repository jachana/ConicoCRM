import * as React from 'react'
import { cn } from '../../lib/cn'

export interface FormFieldProps {
  label?: React.ReactNode
  htmlFor?: string
  required?: boolean
  hint?: React.ReactNode
  error?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function FormField({ label, htmlFor, required, hint, error, className, children }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-xs font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
          {required && <span className="text-danger-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger-600 dark:text-danger-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  )
}
