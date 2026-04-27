import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/cn'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { size?: 'sm' | 'md' | 'lg'; tone?: 'default' | 'error' }
>(({ className, children, size = 'md', tone = 'default', ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex w-full items-center justify-between rounded-md border bg-white text-gray-900',
      'dark:bg-gray-900 dark:text-gray-100',
      'placeholder:text-gray-400 dark:placeholder:text-gray-500',
      'transition-colors duration-150',
      'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
      'disabled:opacity-60 disabled:cursor-not-allowed',
      'data-[placeholder]:text-gray-400 dark:data-[placeholder]:text-gray-500',
      size === 'sm' && 'h-8 px-2.5 text-sm gap-1.5',
      size === 'md' && 'h-9 px-3 text-sm gap-2',
      size === 'lg' && 'h-11 px-4 text-base gap-2',
      tone === 'default' && 'border-gray-300 dark:border-gray-700',
      tone === 'error' && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-4 opacity-60 flex-shrink-0" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        'relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-white shadow-elev-3',
        'dark:bg-gray-900 dark:border-gray-700',
        'border-gray-200',
        'data-[state=open]:animate-fade-in-up',
        position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
        className
      )}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-gray-500">
        <ChevronUp className="size-4" />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className={cn('p-1', position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]')}>
        {children}
      </SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-gray-500">
        <ChevronDown className="size-4" />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
      'text-gray-700 dark:text-gray-200',
      'focus:bg-brand-50 focus:text-brand-900 dark:focus:bg-brand-500/10 dark:focus:text-brand-100',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4 text-brand-600" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500', className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn('mx-1 my-1 h-px bg-gray-200 dark:bg-gray-700', className)} {...props} />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName
