from sqlalchemy.orm import Session

from app.models.boleta import Boleta
from app.models.movimiento_inventario import MovimientoInventario


def descontar_stock_boleta(db: Session, boleta: Boleta, usuario_id: int | None) -> None:
    """Crea MovimientoInventario(salida, -1) por cada línea con producto_id."""
    for linea in boleta.lineas:
        if not linea.producto_id:
            continue
        cantidad_int = int(linea.cantidad)
        if cantidad_int <= 0:
            continue
        db.add(MovimientoInventario(
            producto_id=linea.producto_id,
            tipo="salida",
            cantidad=cantidad_int,
            signo=-1,
            referencia_tipo="boleta",
            referencia_id=boleta.id,
            motivo="boleta_emit",
            usuario_id=usuario_id,
        ))


def revertir_stock_boleta(
    db: Session, boleta: Boleta, usuario_id: int | None, motivo: str = "boleta_anulada"
) -> None:
    """Crea MovimientoInventario(entrada, +1) por cada línea con producto_id."""
    for linea in boleta.lineas:
        if not linea.producto_id:
            continue
        cantidad_int = int(linea.cantidad)
        if cantidad_int <= 0:
            continue
        db.add(MovimientoInventario(
            producto_id=linea.producto_id,
            tipo="entrada",
            cantidad=cantidad_int,
            signo=1,
            referencia_tipo="boleta",
            referencia_id=boleta.id,
            motivo=motivo,
            usuario_id=usuario_id,
        ))
