from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.producto import Producto
from app.models.user import User
from app.schemas.producto import ProductoBusquedaOut, ProductoCreate, ProductoOut, ProductoUpdate

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
    q: str = Query("", description="Texto a buscar en nombre del producto"),
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    return (
        db.query(Producto)
        .filter(Producto.nombre.ilike(f"%{q}%"))
        .order_by(Producto.nombre)
        .limit(20)
        .all()
    )


@router.get("/", response_model=list[ProductoOut])
def listar_productos(
    q: str = Query("", description="Filtrar por nombre"),
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    query = db.query(Producto)
    if q:
        query = query.filter(Producto.nombre.ilike(f"%{q}%"))
    return query.order_by(Producto.nombre).all()


@router.post("/", response_model=ProductoOut, status_code=status.HTTP_201_CREATED)
def crear_producto(
    body: ProductoCreate,
    perms: tuple[User, Session] = require_permission("catalogo", "create"),
):
    _, db = perms
    producto = Producto(**body.model_dump())
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return producto


@router.get("/{producto_id}", response_model=ProductoOut)
def obtener_producto(
    producto_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    return p


@router.patch("/{producto_id}", response_model=ProductoOut)
def actualizar_producto(
    producto_id: int,
    body: ProductoUpdate,
    perms: tuple[User, Session] = require_permission("catalogo", "edit"),
):
    _, db = perms
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return p


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
