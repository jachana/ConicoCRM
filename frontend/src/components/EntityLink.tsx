import { Link } from 'react-router-dom'
import type { ReactNode, MouseEvent } from 'react'

export type EntityKind =
  | 'factura'
  | 'nv'
  | 'boleta'
  | 'guia'
  | 'nc'
  | 'nd'
  | 'oc'
  | 'fc'
  | 'cotizacion'
  | 'cliente'
  | 'empresa'
  | 'producto'

const ROUTE: Record<EntityKind, (id: number | string) => string> = {
  factura:    id => `/facturas/${id}`,
  nv:         id => `/notas-venta/${id}`,
  boleta:     id => `/boletas/${id}`,
  guia:       id => `/guias-despacho/${id}`,
  nc:         id => `/notas-credito/${id}`,
  nd:         id => `/notas-debito/${id}`,
  oc:         id => `/ordenes-compra/${id}`,
  fc:         id => `/facturas-compra/${id}`,
  cotizacion: id => `/cotizaciones/${id}`,
  cliente:    id => `/clientes?detalle=${id}`,
  empresa:    id => `/empresas?detalle=${id}`,
  producto:   id => `/catalogo?detalle=${id}`,
}

export function entityHref(kind: EntityKind, id: number | string): string {
  return ROUTE[kind](id)
}

interface Props {
  kind: EntityKind
  id: number | string | null | undefined
  children: ReactNode
  className?: string
  title?: string
}

export default function EntityLink({ kind, id, children, className, title }: Props) {
  if (id == null || id === '') return <>{children}</>
  const cls =
    'text-brand-700 dark:text-brand-300 hover:text-brand-900 dark:hover:text-brand-100 hover:underline underline-offset-2 ' +
    (className ?? '')
  return (
    <Link
      to={entityHref(kind, id)}
      className={cls}
      title={title}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => e.stopPropagation()}
    >
      {children}
    </Link>
  )
}
