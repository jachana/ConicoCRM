import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../../lib/cn'

export const TooltipProvider = TooltipPrimitive.Provider
export const TooltipRoot = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 px-2.5 py-1.5 rounded-md bg-gray-900 dark:bg-gray-100 text-xs text-white dark:text-gray-900',
        'shadow-elev-3 max-w-xs',
        'data-[state=delayed-open]:animate-fade-in-up',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

/** Convenience wrapper: `<Tooltip label="…"><Button/></Tooltip>` */
export interface TooltipProps {
  label: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  delayDuration?: number
  asChild?: boolean
}

export function Tooltip({ label, children, side = 'top', delayDuration = 200, asChild = true }: TooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <TooltipRoot>
        <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
