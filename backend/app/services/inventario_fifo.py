# backend/app/services/inventario_fifo.py
from decimal import Decimal
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.lote_costo import LoteCosto
from app.models.movimiento_inventario import MovimientoInventario
from app.models.producto import Producto


def recalcular_precio_costo(db: Session, producto: Producto) -> None:
    """Set producto.precio_costo = MAX(costo_unitario) of active lots.

    Falls back to producto.ultimo_costo_unitario (last received cost)
    when no active lots remain. Does NOT use historical MAX of all lots —
    the fallback is the most recent purchase price, not the highest ever.
    """
    result = db.execute(
        select(func.max(LoteCosto.costo_unitario)).where(
            LoteCosto.producto_id == producto.id,
            LoteCosto.cantidad_restante > 0,
        )
    ).scalar()
    if result is not None:
        producto.precio_costo = result
    else:
        producto.precio_costo = producto.ultimo_costo_unitario


def crear_lote_entrada(
    db: Session,
    producto_id: int,
    costo_unitario: Decimal,
    cantidad: int,
    oc_linea_id: int | None,
    usuario_id: int | None,
) -> LoteCosto:
    """Create a cost lot for an incoming stock batch.

    Updates producto.ultimo_costo_unitario to costo_unitario (last received cost)
    and recalculates producto.precio_costo to MAX of active lots.

    NOTE: Does NOT update producto.stock_actual. Caller is responsible.
    NOTE: Does NOT create a MovimientoInventario. Caller is responsible.
    """
    lote = LoteCosto(
        producto_id=producto_id,
        oc_linea_id=oc_linea_id,
        costo_unitario=costo_unitario,
        cantidad_inicial=cantidad,
        cantidad_restante=cantidad,
    )
    db.add(lote)
    db.flush()

    producto = db.get(Producto, producto_id)
    producto.ultimo_costo_unitario = costo_unitario
    recalcular_precio_costo(db, producto)
    db.flush()
    return lote


def consumir_stock_fifo(
    db: Session,
    producto_id: int,
    cantidad: int,
    referencia_tipo: str,
    referencia_id: int,
    usuario_id: int | None,
) -> None:
    """Consume stock FIFO from oldest lot first.

    Creates one MovimientoInventario per lot consumed. If lots are exhausted
    before cantidad is fully consumed, creates an additional movement with
    lote_costo_id=None for the remainder.

    Decrements producto.stock_actual unconditionally. Negative stock_actual
    is permitted — this distributor sells items not yet in stock.

    NOTE: Does NOT raise on insufficient stock. Negative stock is valid.
    """
    producto = db.get(Producto, producto_id)
    lotes = db.execute(
        select(LoteCosto)
        .where(LoteCosto.producto_id == producto_id, LoteCosto.cantidad_restante > 0)
        .order_by(LoteCosto.created_at.asc())
    ).scalars().all()

    remaining = cantidad
    for lote in lotes:
        if remaining <= 0:
            break
        consumed = min(lote.cantidad_restante, remaining)
        lote.cantidad_restante -= consumed
        remaining -= consumed
        db.add(MovimientoInventario(
            producto_id=producto_id,
            tipo="salida",
            cantidad=consumed,
            signo=-1,
            referencia_tipo=referencia_tipo,
            referencia_id=referencia_id,
            usuario_id=usuario_id,
            lote_costo_id=lote.id,
        ))

    if remaining > 0:
        # No lots available — still record the movement against no lot
        db.add(MovimientoInventario(
            producto_id=producto_id,
            tipo="salida",
            cantidad=remaining,
            signo=-1,
            referencia_tipo=referencia_tipo,
            referencia_id=referencia_id,
            usuario_id=usuario_id,
            lote_costo_id=None,
        ))

    producto.stock_actual -= cantidad
    recalcular_precio_costo(db, producto)
    db.flush()
