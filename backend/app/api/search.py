from fastapi import APIRouter, Depends, Query
from sqlalchemy import cast, or_, String
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.permissions import has_permission
from app.database import get_db
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion
from app.models.empleado import Empleado
from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.nota_venta import NotaVenta
from app.models.orden_compra import OrdenCompra
from app.models.producto import Producto
from app.models.proveedor import Proveedor
from app.models.user import User
from app.utils.search import unaccent_ilike

router = APIRouter()


def _search_productos(db: Session, q: str, limit: int) -> list[dict]:
    pattern = f"%{q}%"
    rows = (
        db.query(Producto)
        .filter(or_(unaccent_ilike(Producto.nombre, pattern), unaccent_ilike(Producto.sku, pattern)))
        .order_by(Producto.nombre)
        .limit(limit)
        .all()
    )
    return [{"id": r.id, "nombre": r.nombre, "sku": r.sku} for r in rows]


def _search_clientes(db: Session, q: str, limit: int) -> list[dict]:
    pattern = f"%{q}%"
    rows = (
        db.query(Cliente)
        .outerjoin(Cliente.empresa)
        .filter(or_(
            unaccent_ilike(Cliente.nombre, pattern),
            Cliente.rut.ilike(pattern),
            unaccent_ilike(Empresa.nombre, pattern),
            unaccent_ilike(Empresa.razon_social, pattern),
        ))
        .order_by(Cliente.nombre)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "nombre": r.nombre,
            "rut": r.rut,
            "empresa": r.empresa.nombre if r.empresa else None,
        }
        for r in rows
    ]


def _search_empresas(db: Session, q: str, limit: int) -> list[dict]:
    pattern = f"%{q}%"
    rows = (
        db.query(Empresa)
        .filter(or_(unaccent_ilike(Empresa.nombre, pattern), Empresa.rut.ilike(pattern)))
        .order_by(Empresa.nombre)
        .limit(limit)
        .all()
    )
    return [{"id": r.id, "nombre": r.nombre, "rut": r.rut} for r in rows]


def _vendedor_scope(role: str) -> bool:
    return role == "vendedor"


def _search_cotizaciones(db: Session, user: User, q: str, limit: int) -> list[dict]:
    query = (
        db.query(Cotizacion)
        .outerjoin(Cliente, Cotizacion.cliente_id == Cliente.id)
        .filter(or_(
            cast(Cotizacion.numero, String).ilike(f"{q}%"),
            unaccent_ilike(Cliente.nombre, f"%{q}%"),
        ))
    )
    if _vendedor_scope(user.role):
        query = query.filter(Cotizacion.vendedor_id == user.id)
    rows = query.order_by(Cotizacion.numero.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "numero": r.numero,
            "estado": r.estado,
            "cliente_nombre": r.cliente.nombre if r.cliente else None,
        }
        for r in rows
    ]


def _search_notas_venta(db: Session, user: User, q: str, limit: int) -> list[dict]:
    query = (
        db.query(NotaVenta)
        .outerjoin(Cliente, NotaVenta.cliente_id == Cliente.id)
        .filter(or_(
            cast(NotaVenta.numero, String).ilike(f"{q}%"),
            unaccent_ilike(Cliente.nombre, f"%{q}%"),
        ))
    )
    if _vendedor_scope(user.role):
        query = query.filter(NotaVenta.vendedor_id == user.id)
    rows = query.order_by(NotaVenta.numero.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "numero": r.numero,
            "estado": r.estado,
            "cliente_nombre": r.cliente.nombre if r.cliente else None,
        }
        for r in rows
    ]


def _search_facturas(db: Session, user: User, q: str, limit: int) -> list[dict]:
    query = (
        db.query(Factura)
        .outerjoin(Cliente, Factura.cliente_id == Cliente.id)
        .filter(or_(
            cast(Factura.numero, String).ilike(f"{q}%"),
            unaccent_ilike(Cliente.nombre, f"%{q}%"),
        ))
    )
    if _vendedor_scope(user.role):
        query = query.filter(Factura.vendedor_id == user.id)
    rows = query.order_by(Factura.numero.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "numero": r.numero,
            "estado": r.estado,
            "cliente_nombre": r.cliente.nombre if r.cliente else None,
        }
        for r in rows
    ]


def _search_ordenes_compra(db: Session, q: str, limit: int) -> list[dict]:
    rows = (
        db.query(OrdenCompra)
        .outerjoin(Proveedor, OrdenCompra.proveedor_id == Proveedor.id)
        .filter(or_(
            cast(OrdenCompra.numero, String).ilike(f"{q}%"),
            unaccent_ilike(Proveedor.nombre, f"%{q}%"),
        ))
        .order_by(OrdenCompra.numero.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "numero": r.numero,
            "estado": r.estado,
            "proveedor_nombre": r.proveedor.nombre if r.proveedor else None,
        }
        for r in rows
    ]


def _search_empleados(db: Session, q: str, limit: int) -> list[dict]:
    pattern = f"%{q}%"
    rows = (
        db.query(Empleado)
        .filter(unaccent_ilike(Empleado.nombre, pattern))
        .order_by(Empleado.nombre)
        .limit(limit)
        .all()
    )
    return [{"id": r.id, "nombre": r.nombre, "cargo": r.cargo} for r in rows]


@router.get("")
def search(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(5, ge=1, le=10),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result: dict = {"q": q}
    if has_permission(db, current_user, "catalogo", "view"):
        result["productos"] = _search_productos(db, q, limit)
    if has_permission(db, current_user, "clientes", "view"):
        result["clientes"] = _search_clientes(db, q, limit)
    if has_permission(db, current_user, "empresas", "view"):
        result["empresas"] = _search_empresas(db, q, limit)
    if has_permission(db, current_user, "cotizaciones", "view"):
        result["cotizaciones"] = _search_cotizaciones(db, current_user, q, limit)
    if has_permission(db, current_user, "nota_venta", "view"):
        result["notas_venta"] = _search_notas_venta(db, current_user, q, limit)
    if has_permission(db, current_user, "facturas", "view"):
        result["facturas"] = _search_facturas(db, current_user, q, limit)
    if has_permission(db, current_user, "ordenes_compra", "view"):
        result["ordenes_compra"] = _search_ordenes_compra(db, q, limit)
    if has_permission(db, current_user, "rrhh", "view"):
        result["empleados"] = _search_empleados(db, q, limit)
    return result
