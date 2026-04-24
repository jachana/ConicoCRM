import csv
import io as _io
from datetime import datetime, timezone
from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.config import require_admin
from app.api.deps import require_permission
from app.models.lista_precios import ListaPrecios, ListaPreciosItem
from app.models.lote_costo import LoteCosto
from app.models.producto import Producto
from app.models.system_config import SystemConfig
from app.models.tag import ProductoTag
from app.models.user import User
from app.models.movimiento_inventario import MovimientoInventario
from app.schemas.lista_precios import HistorialCostoItem
from app.schemas.lote_costo import LoteCostoOut
from app.schemas.producto import (
    ProductoBusquedaOut,
    ProductoCreate,
    ProductoOutAdmin,
    ProductoOutPublic,
    ProductoUpdate,
)
from app.schemas.movimiento_inventario import MovimientoListOut


def _sync_tags(producto: Producto, tag_nombres: list[str], db: Session) -> None:
    nombres = [n.strip().lower() for n in tag_nombres if n.strip()]
    if not nombres:
        producto.tags = []
        return
    existing = {t.nombre: t for t in db.query(ProductoTag).filter(ProductoTag.nombre.in_(nombres)).all()}
    tags = []
    for nombre in nombres:
        if nombre in existing:
            tags.append(existing[nombre])
        else:
            t = ProductoTag(nombre=nombre)
            db.add(t)
            tags.append(t)
    producto.tags = tags


def _stale_cost(fecha: datetime | None, threshold_days: int, now: datetime) -> bool:
    if fecha is None:
        return True
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return (now - fecha).days > threshold_days


def _serialize_producto(db: Session, producto: Producto, user: User):
    if user.role != "admin":
        return ProductoOutPublic.model_validate(producto).model_dump(mode="json")
    cfg = db.get(SystemConfig, "dias_alerta_costo_desactualizado")
    threshold_days = int(cfg.value) if cfg else 60
    stale = _stale_cost(producto.precio_costo_actualizado_en, threshold_days, datetime.now(timezone.utc))
    out = ProductoOutAdmin.model_validate(producto).model_dump(mode="json")
    out["costo_desactualizado"] = stale
    return out


router = APIRouter()


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    productos = db.query(Producto).order_by(Producto.nombre).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Catálogo"
    ws.append(["ID", "Nombre", "Descripción", "Precio Costo", "Precio Venta", "Stock Mínimo", "Stock Actual"])
    for p in productos:
        ws.append([p.id, p.nombre, p.descripcion or "", float(p.precio_costo), float(p.precio_venta), p.stock_minimo, p.stock_actual])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=catalogo.xlsx"},
    )


@router.get("/buscar", response_model=list[ProductoBusquedaOut])
def buscar_productos(
    q: str = Query("", description="Texto a buscar en nombre, SKU o tag"),
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    query = db.query(Producto).outerjoin(Producto.tags)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Producto.nombre.ilike(pattern),
                Producto.sku.ilike(pattern),
                ProductoTag.nombre.ilike(pattern),
            )
        ).distinct()
    return query.order_by(Producto.nombre).limit(20).all()


@router.get("/")
def listar_productos(
    q: str = Query("", description="Filtrar por nombre, SKU o tag"),
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    user, db = perms
    query = db.query(Producto).outerjoin(Producto.tags)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Producto.nombre.ilike(pattern),
                Producto.sku.ilike(pattern),
                ProductoTag.nombre.ilike(pattern),
            )
        ).distinct()
    rows = query.order_by(Producto.nombre).all()

    if user.role != "admin":
        return [ProductoOutPublic.model_validate(p).model_dump(mode="json") for p in rows]

    cfg = db.get(SystemConfig, "dias_alerta_costo_desactualizado")
    threshold_days = int(cfg.value) if cfg else 60
    now = datetime.now(timezone.utc)

    def serialize(p: Producto):
        stale = _stale_cost(p.precio_costo_actualizado_en, threshold_days, now)
        out = ProductoOutAdmin.model_validate(p).model_dump(mode="json")
        out["costo_desactualizado"] = stale
        return out

    return [serialize(p) for p in rows]


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_producto(
    body: ProductoCreate,
    perms: tuple[User, Session] = require_permission("catalogo", "create"),
):
    user, db = perms
    data = body.model_dump(exclude={"tags"})
    producto = Producto(**data)
    db.add(producto)
    db.flush()
    _sync_tags(producto, body.tags, db)
    db.commit()
    db.refresh(producto)
    return _serialize_producto(db, producto, user)


@router.get("/{producto_id}")
def obtener_producto(
    producto_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    user, db = perms
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    return _serialize_producto(db, p, user)


@router.patch("/{producto_id}")
def actualizar_producto(
    producto_id: int,
    body: ProductoUpdate,
    perms: tuple[User, Session] = require_permission("catalogo", "edit"),
):
    user, db = perms
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    for field, value in body.model_dump(exclude_unset=True, exclude={"tags"}).items():
        setattr(p, field, value)
    if body.tags is not None:
        _sync_tags(p, body.tags, db)
    db.commit()
    db.refresh(p)
    return _serialize_producto(db, p, user)


@router.delete("/{producto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_producto(
    producto_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "delete"),
):
    _, db = perms
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    db.delete(p)
    db.commit()


@router.get("/{producto_id}/movimientos/export")
def exportar_movimientos_producto(
    producto_id: int,
    perms: tuple[User, Session] = require_permission("inventario", "view"),
):
    _, db = perms
    if not db.get(Producto, producto_id):
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    movimientos = (
        db.query(MovimientoInventario)
        .filter_by(producto_id=producto_id)
        .order_by(MovimientoInventario.created_at.asc())
        .all()
    )
    output = _io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["fecha", "tipo", "cantidad", "signo", "referencia_tipo", "referencia_id", "motivo", "nota", "usuario_id", "lote_costo_id"])
    for m in movimientos:
        writer.writerow([
            m.created_at.isoformat(), m.tipo, m.cantidad, m.signo,
            m.referencia_tipo or "", m.referencia_id or "",
            m.motivo or "", m.nota or "",
            m.usuario_id or "", m.lote_costo_id or "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=movimientos_{producto_id}.csv"},
    )


@router.get("/{producto_id}/movimientos", response_model=MovimientoListOut)
def listar_movimientos_producto(
    producto_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    perms: tuple[User, Session] = require_permission("inventario", "view"),
):
    _, db = perms
    if not db.get(Producto, producto_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    from sqlalchemy.orm import joinedload
    q = (
        db.query(MovimientoInventario)
        .options(joinedload(MovimientoInventario.producto), joinedload(MovimientoInventario.usuario))
        .filter(MovimientoInventario.producto_id == producto_id)
    )
    total = q.count()
    items = q.order_by(MovimientoInventario.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return MovimientoListOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/{producto_id}/lotes", response_model=list[LoteCostoOut])
def listar_lotes_producto(
    producto_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    if not db.get(Producto, producto_id):
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return (
        db.query(LoteCosto)
        .filter(LoteCosto.producto_id == producto_id, LoteCosto.cantidad_restante > 0)
        .order_by(LoteCosto.created_at.asc())
        .all()
    )


@router.get("/{producto_id}/historial-costos", response_model=list[HistorialCostoItem])
def historial_costos(
    producto_id: int,
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if not p.sku:
        return []
    rows = (
        db.query(ListaPrecios, ListaPreciosItem)
        .join(ListaPreciosItem, ListaPreciosItem.lista_id == ListaPrecios.id)
        .filter(ListaPreciosItem.sku == p.sku)
        .order_by(ListaPrecios.fecha_subida.desc(), ListaPrecios.id.desc())
        .all()
    )
    return [
        HistorialCostoItem(
            fecha_subida=lp.fecha_subida,
            costo_unitario=item.costo_unitario,
            lista_id=lp.id,
            nombre_archivo=lp.nombre_archivo,
        )
        for lp, item in rows
    ]
