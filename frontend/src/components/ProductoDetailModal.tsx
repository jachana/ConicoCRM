import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Producto } from '../types'
import {
  Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter,
  Card, CardContent, Button, Badge,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from './ui'
import { BarChart3, Pencil } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import ProductoHistorialVentas from './ProductoHistorialVentas'
import ProductoCompras from './ProductoCompras'
import ProductoDocumentos from './ProductoDocumentos'
import ProductoHistorial from './ProductoHistorial'
import ProductoHistorialCostos from './ProductoHistorialCostos'

interface Props {
  producto: Producto | null
  onClose: () => void
  onEdit?: (p: Producto) => void
  showCosto?: boolean
}

function fmtCLP(n: number | string | null | undefined) {
  const v = Number(n ?? 0)
  if (!v) return '—'
  return '$' + Math.round(v).toLocaleString('es-CL')
}

export default function ProductoDetailModal({ producto, onClose, onEdit, showCosto = true }: Props) {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const isVendedor = user?.role === 'vendedor'

  if (!producto) return null

  const subtitleParts = [producto.sku, producto.formato, producto.marca?.nombre].filter(Boolean)
  const subtitle = subtitleParts.join(' · ')
  const stockBajo = producto.stock_actual < producto.stock_minimo
  const showMarcaReportes = producto.marca_id != null && !isVendedor

  const datosNode = (
    <>
      {(onEdit || showMarcaReportes) && (
        <div className="flex justify-end gap-2 mb-3">
          {showMarcaReportes && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<BarChart3 size={14} />}
              onClick={() => {
                onClose()
                navigate(`/reportes?tab=por_marca&marca_id=${producto.marca_id}`)
              }}
            >
              Ver reportes de la marca
            </Button>
          )}
          {onEdit && (
            <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} onClick={() => onEdit(producto)}>
              Editar
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="SKU" value={producto.sku ?? '—'} />
        <Field label="Formato" value={producto.formato ?? '—'} />
        <Field label="Marca" value={producto.marca?.nombre ?? '—'} />
        <Field label="Volumen" value={producto.volumen != null ? String(producto.volumen) : '—'} />

        <Field label="Precio venta" value={fmtCLP(producto.precio_venta)} />
        <Field label="Precio venta c/IVA" value={fmtCLP(producto.precio_con_iva)} />

        {showCosto && (
          <>
            <Field label="Precio costo" value={fmtCLP(producto.precio_costo)} />
            <Field label="Costo c/IVA" value={fmtCLP(producto.costo_con_iva)} />
          </>
        )}

        <Field
          label="Stock actual"
          value={
            <span className={stockBajo ? 'text-danger-600 dark:text-danger-400 font-semibold' : ''}>
              {producto.stock_actual}
              {stockBajo && <span className="ml-1 text-xs">⚠ bajo mínimo</span>}
            </span>
          }
        />
        <Field label="Stock mínimo" value={String(producto.stock_minimo)} />

        {producto.descripcion && (
          <Field label="Descripción" value={producto.descripcion} className="col-span-2" />
        )}

        {producto.tipos && producto.tipos.length > 0 && (
          <div className="col-span-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Tipos</div>
            <div className="flex flex-wrap gap-1">
              {producto.tipos.map(t => (
                <Badge key={t.id} variant="brand" size="sm">{t.nombre}</Badge>
              ))}
            </div>
          </div>
        )}

        {producto.specs && producto.specs.length > 0 && (
          <div className="col-span-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Especificaciones</div>
            <div className="flex flex-wrap gap-1">
              {producto.specs.map(s => (
                <Badge key={s} variant="info" size="sm">{s}</Badge>
              ))}
            </div>
          </div>
        )}

        {producto.tags && producto.tags.length > 0 && (
          <div className="col-span-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Tags</div>
            <div className="flex flex-wrap gap-1">
              {producto.tags.map(t => (
                <Badge key={t} variant="neutral" size="sm">{t}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalContent size="2xl" className="flex flex-col max-h-[90vh] p-0">
        <ModalHeader className="px-6 pt-5 pb-3">
          <ModalTitle>{producto.nombre}</ModalTitle>
          {subtitle && <ModalDescription>{subtitle}</ModalDescription>}
        </ModalHeader>

        <ModalBody className="px-6 py-5 overflow-y-auto">
          <Tabs defaultValue="datos">
            <TabsList variant="underline">
              <TabsTrigger value="datos">Datos</TabsTrigger>
              <TabsTrigger value="ventas">Historial de ventas</TabsTrigger>
              {showCosto && <TabsTrigger value="compras">Compras</TabsTrigger>}
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
              {showCosto && <TabsTrigger value="costos">Costos</TabsTrigger>}
            </TabsList>
            <TabsContent value="datos" className="mt-4">{datosNode}</TabsContent>
            <TabsContent value="ventas" className="mt-4">
              <ProductoHistorialVentas productoId={producto.id} />
            </TabsContent>
            {showCosto && (
              <TabsContent value="compras" className="mt-4">
                <ProductoCompras productoId={producto.id} />
              </TabsContent>
            )}
            <TabsContent value="documentos" className="mt-4">
              <ProductoDocumentos productoId={producto.id} />
            </TabsContent>
            <TabsContent value="movimientos" className="mt-4">
              <ProductoHistorial productoId={producto.id} />
            </TabsContent>
            {showCosto && (
              <TabsContent value="costos" className="mt-4">
                <ProductoHistorialCostos productoId={producto.id} />
              </TabsContent>
            )}
          </Tabs>
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function Field({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <Card variant="subtle" className={className}>
      <CardContent className="py-2.5">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{value || '—'}</div>
      </CardContent>
    </Card>
  )
}
