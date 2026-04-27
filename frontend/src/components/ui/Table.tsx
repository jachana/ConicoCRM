import * as React from 'react'
import { cn } from '../../lib/cn'

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  density?: 'compact' | 'comfortable'
}

const TableContext = React.createContext<{ density: 'compact' | 'comfortable' }>({ density: 'comfortable' })

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, density = 'comfortable', ...props }, ref) => (
    <TableContext.Provider value={{ density }}>
      <div className="w-full overflow-x-auto">
        <table
          ref={ref}
          className={cn('w-full text-sm border-collapse', className)}
          {...props}
        />
      </div>
    </TableContext.Provider>
  )
)
Table.displayName = 'Table'

export const THead = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        'border-b border-gray-200 dark:border-gray-800',
        'bg-gray-50/60 dark:bg-gray-900/40',
        className
      )}
      {...props}
    />
  )
)
THead.displayName = 'THead'

export const TBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn('divide-y divide-gray-100 dark:divide-gray-800/60', className)}
      {...props}
    />
  )
)
TBody.displayName = 'TBody'

export const TR = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }>(
  ({ className, interactive, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'transition-colors',
        interactive && 'hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer',
        className
      )}
      {...props}
    />
  )
)
TR.displayName = 'TR'

export const TH = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => {
    const { density } = React.useContext(TableContext)
    return (
      <th
        ref={ref}
        className={cn(
          'text-left font-medium text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400',
          density === 'compact' ? 'px-3 py-2' : 'px-4 py-2.5',
          className
        )}
        {...props}
      />
    )
  }
)
TH.displayName = 'TH'

export const TD = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => {
    const { density } = React.useContext(TableContext)
    return (
      <td
        ref={ref}
        className={cn(
          'text-gray-700 dark:text-gray-300 align-middle',
          density === 'compact' ? 'px-3 py-2' : 'px-4 py-3',
          className
        )}
        {...props}
      />
    )
  }
)
TD.displayName = 'TD'
