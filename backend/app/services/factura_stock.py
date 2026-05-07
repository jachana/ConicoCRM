from sqlalchemy.orm import Session

from app.models.factura import Factura
from app.models.movimiento_inventario import MovimientoInventario
from app.models.producto import Producto


def descontar_stock_factura(db: Session, factura: Factura, usuario_id: int | None) -> None:
    """Crea MovimientoInventario(salida, -1) por cada línea con producto_id y descuenta producto.stock_actual."""
    for linea in factura.lineas:
        if not linea.producto_id:
            continue
        cantidad_int = int(linea.cantidad)
        if cantidad_int <= 0:
            continue
        producto = db.get(Producto, linea.producto_id)
        if producto is not None:
            producto.stock_actual -= cantidad_int
        db.add(MovimientoInventario(
            producto_id=linea.producto_id,
            tipo="salida",
            cantidad=cantidad_int,
            signo=-1,
            referencia_tipo="factura",
            referencia_id=factura.id,
            motivo="factura_emit",
            usuario_id=usuario_id,
        ))


def revertir_stock_factura(
    db: Session, factura: Factura, usuario_id: int | None, motivo: str = "factura_anulada"
) -> None:
    """Crea MovimientoInventario(entrada, +1) por cada línea con producto_id y restaura producto.stock_actual."""
    for linea in factura.lineas:
        if not linea.producto_id:
            continue
        cantidad_int = int(linea.cantidad)
        if cantidad_int <= 0:
            continue
        producto = db.get(Producto, linea.producto_id)
        if producto is not None:
            producto.stock_actual += cantidad_int
        db.add(MovimientoInventario(
            producto_id=linea.producto_id,
            tipo="entrada",
            cantidad=cantidad_int,
            signo=1,
            referencia_tipo="factura",
            referencia_id=factura.id,
            motivo=motivo,
            usuario_id=usuario_id,
        ))
