from datetime import date
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.models.movimiento_inventario import MovimientoInventario
from app.models.producto import Producto
from app.models.user import User
from app.schemas.movimiento_inventario import AjusteCreate, MovimientoListOut, MovimientoOut

router = APIRouter()


def _load_movimiento(db: Session, mov_id: int) -> MovimientoInventario:
    return (
        db.query(MovimientoInventario)
        .options(joinedload(MovimientoInventario.producto), joinedload(MovimientoInventario.usuario))
        .filter(MovimientoInventario.id == mov_id)
        .first()
    )


@router.get("/movimientos", response_model=MovimientoListOut)
def listar_movimientos(
    producto_id: int | None = Query(None),
    tipo: str | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    perms: tuple[User, Session] = require_permission("inventario", "view"),
):
    _, db = perms
    q = db.query(MovimientoInventario).options(
        joinedload(MovimientoInventario.producto),
        joinedload(MovimientoInventario.usuario),
    )
    if producto_id:
        q = q.filter(MovimientoInventario.producto_id == producto_id)
    if tipo:
        q = q.filter(MovimientoInventario.tipo == tipo)
    if fecha_desde:
        q = q.filter(MovimientoInventario.created_at >= fecha_desde)
    if fecha_hasta:
        q = q.filter(MovimientoInventario.created_at <= fecha_hasta)
    total = q.count()
    items = q.order_by(MovimientoInventario.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return MovimientoListOut(items=items, total=total)


@router.post("/ajustes", response_model=MovimientoOut, status_code=status.HTTP_201_CREATED)
def crear_ajuste(
    body: AjusteCreate,
    perms: tuple[User, Session] = require_permission("inventario", "create"),
):
    current_user, db = perms
    producto = db.get(Producto, body.producto_id)
    if not producto:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    producto.stock_actual += body.signo * body.cantidad
    mov = MovimientoInventario(
        producto_id=body.producto_id,
        tipo="ajuste",
        cantidad=body.cantidad,
        signo=body.signo,
        referencia_tipo="ajuste_manual",
        motivo=body.motivo,
        nota=body.nota,
        usuario_id=current_user.id,
    )
    db.add(mov)
    db.flush()
    db.commit()
    return _load_movimiento(db, mov.id)


@router.get("/stock-bajo", response_model=list[dict])
def stock_bajo(
    perms: tuple[User, Session] = require_permission("inventario", "view"),
):
    _, db = perms
    productos = (
        db.query(Producto)
        .filter(Producto.stock_actual < Producto.stock_minimo)
        .order_by(Producto.nombre)
        .all()
    )
    return [
        {
            "id": p.id,
            "nombre": p.nombre,
            "sku": p.sku,
            "stock_actual": p.stock_actual,
            "stock_minimo": p.stock_minimo,
        }
        for p in productos
    ]
