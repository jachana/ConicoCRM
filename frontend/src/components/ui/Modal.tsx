import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export const Modal = DialogPrimitive.Root
export const ModalTrigger = DialogPrimitive.Trigger
export const ModalClose = DialogPrimitive.Close
export const ModalPortal = DialogPrimitive.Portal

export const ModalOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
      'data-[state=open]:animate-fade-in data-[state=closed]:opacity-0',
      'transition-opacity',
      className
    )}
    {...props}
  />
))
ModalOverlay.displayName = DialogPrimitive.Overlay.displayName

interface ModalContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  hideClose?: boolean
}

const sizeMap: Record<NonNullable<ModalContentProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-4xl',
  full: 'max-w-[95vw] max-h-[95vh]',
}

export const ModalContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ModalContentProps
>(({ className, children, size = 'md', hideClose, ...props }, ref) => (
  <ModalPortal>
    <ModalOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2',
        'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700',
        'rounded-lg shadow-elev-4',
        'data-[state=open]:animate-scale-in',
        'max-h-[90vh] flex flex-col',
        sizeMap[size],
        className
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3 top-3 rounded-md p-1.5 text-gray-400 transition-colors',
            'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/30',
            'disabled:pointer-events-none'
          )}
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </ModalPortal>
))
ModalContent.displayName = DialogPrimitive.Content.displayName

export function ModalHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-700',
        className
      )}
      {...props}
    />
  )
}

export function ModalFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700',
        'bg-gray-50/50 dark:bg-gray-900/50 rounded-b-lg',
        className
      )}
      {...props}
    />
  )
}

export function ModalBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-5 overflow-y-auto flex-1', className)} {...props} />
}

export const ModalTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-base font-semibold text-gray-900 dark:text-gray-100', className)}
    {...props}
  />
))
ModalTitle.displayName = DialogPrimitive.Title.displayName

export const ModalDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-gray-500 dark:text-gray-400', className)}
    {...props}
  />
))
ModalDescription.displayName = DialogPrimitive.Description.displayName
