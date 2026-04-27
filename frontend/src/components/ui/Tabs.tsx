import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../../lib/cn'

type TabsVariant = 'default' | 'underline'
const TabsCtx = React.createContext<TabsVariant>('default')

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = 'default', ...props }, ref) => (
  <TabsCtx.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex items-center',
        variant === 'default' && 'rounded-md bg-gray-100 dark:bg-gray-800 p-1 gap-1',
        variant === 'underline' && 'gap-6 border-b border-gray-200 dark:border-gray-800 w-full',
        className
      )}
      {...props}
    />
  </TabsCtx.Provider>
))
TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsCtx)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
        'disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' && [
          'px-3 py-1.5 rounded text-gray-600 dark:text-gray-400',
          'data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-elev-1',
          'dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-100',
        ],
        variant === 'underline' && [
          'py-3 border-b-2 border-transparent text-gray-500 dark:text-gray-400 -mb-px',
          'hover:text-gray-700 dark:hover:text-gray-200',
          'data-[state=active]:border-brand-500 data-[state=active]:text-gray-900 dark:data-[state=active]:text-gray-100',
        ],
        className
      )}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-4 focus-visible:outline-none data-[state=active]:animate-fade-in', className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName
