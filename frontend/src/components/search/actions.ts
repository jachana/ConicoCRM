import {
  FileText, FilePlus, Receipt, Truck, FileMinus, ShoppingCart,
  BarChart3, Users, LogOut, Settings, type LucideIcon,
} from 'lucide-react'
import { isModuloEnabled, type Modulo, type ModulosState } from '../../lib/modulos'
import type { User } from '../../types'

export type Role = User['role']
export type ActionHandler = 'logout'

export interface ActionDef {
  slug: string
  label: string
  icon: LucideIcon
  route?: string
  handler?: ActionHandler
  modulo?: Modulo
  roles?: Role[]
  keywords: string[]
}

export const ACTIONS: ActionDef[] = [
  {
    slug: 'nueva-cotizacion',
    label: 'Nueva cotización',
    icon: FileText,
    route: '/cotizaciones/nueva',
    modulo: 'cotizaciones',
    keywords: ['nueva', 'cotizacion', 'cot', 'crear', 'cotizar'],
  },
  {
    slug: 'nueva-nv',
    label: 'Nueva nota de venta',
    icon: FilePlus,
    route: '/notas-venta/nueva',
    modulo: 'notas_venta',
    keywords: ['nueva', 'nv', 'nota', 'venta', 'crear'],
  },
  {
    slug: 'nueva-factura',
    label: 'Nueva factura',
    icon: Receipt,
    route: '/facturas/nueva',
    modulo: 'facturas',
    keywords: ['nueva', 'factura', 'fac', 'crear', 'emitir'],
  },
  {
    slug: 'nueva-boleta',
    label: 'Nueva boleta',
    icon: Receipt,
    route: '/boletas/nueva',
    modulo: 'boletas',
    keywords: ['nueva', 'boleta', 'bol', 'crear'],
  },
  {
    slug: 'nueva-guia-despacho',
    label: 'Nueva guía de despacho',
    icon: Truck,
    route: '/guias-despacho/nueva',
    modulo: 'guias_despacho',
    keywords: ['nueva', 'guia', 'despacho', 'gd', 'crear'],
  },
  {
    slug: 'nueva-nc',
    label: 'Nueva nota de crédito',
    icon: FileMinus,
    route: '/notas-credito/nueva',
    modulo: 'nota_credito',
    roles: ['admin', 'subadmin'],
    keywords: ['nueva', 'nota', 'credito', 'nc', 'crear'],
  },
  {
    slug: 'nueva-nd',
    label: 'Nueva nota de débito',
    icon: FilePlus,
    route: '/notas-debito/nueva',
    modulo: 'nota_debito',
    roles: ['admin', 'subadmin'],
    keywords: ['nueva', 'nota', 'debito', 'nd', 'crear'],
  },
  {
    slug: 'nueva-oc',
    label: 'Nueva orden de compra',
    icon: ShoppingCart,
    route: '/ordenes-compra/nueva',
    modulo: 'ordenes_compra',
    roles: ['admin', 'subadmin'],
    keywords: ['nueva', 'oc', 'orden', 'compra', 'crear'],
  },
  {
    slug: 'ir-clientes',
    label: 'Ir a Clientes',
    icon: Users,
    route: '/clientes',
    keywords: ['ir', 'a', 'clientes', 'cliente', 'nuevo', 'nueva'],
  },
  {
    slug: 'ir-reportes',
    label: 'Ir a Reportes',
    icon: BarChart3,
    route: '/reportes',
    roles: ['admin', 'subadmin'],
    keywords: ['ir', 'a', 'reportes', 'reporte', 'metricas'],
  },
  {
    slug: 'ir-configuracion',
    label: 'Ir a Configuración',
    icon: Settings,
    route: '/configuracion',
    roles: ['admin'],
    keywords: ['ir', 'a', 'configuracion', 'config', 'ajustes', 'settings'],
  },
  {
    slug: 'cerrar-sesion',
    label: 'Cerrar sesión',
    icon: LogOut,
    handler: 'logout',
    keywords: ['cerrar', 'sesion', 'logout', 'salir', 'log out'],
  },
]

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function normalizeQuery(q: string): string {
  return stripDiacritics(q.toLowerCase()).trim()
}

export function isActionAllowed(
  action: ActionDef,
  role: Role | null | undefined,
  modulos: ModulosState | undefined,
  modulosLoading: boolean,
): boolean {
  if (action.roles && (!role || !action.roles.includes(role))) return false
  if (action.modulo) {
    if (modulosLoading) return false
    if (!isModuloEnabled(modulos, action.modulo)) return false
  }
  return true
}

export function matchesActionQuery(action: ActionDef, q: string): boolean {
  const norm = normalizeQuery(q)
  if (!norm) return true
  const tokens = norm.split(/\s+/).filter(Boolean)
  const haystack = stripDiacritics([action.label, ...action.keywords].join(' ').toLowerCase())
  return tokens.every(t => haystack.includes(t))
}
