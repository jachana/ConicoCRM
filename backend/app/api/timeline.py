"""
Unified timeline endpoint — W2-02.

Merges 9 document types (cotizacion, nota_venta, factura, nota_credito,
nota_debito, pago, tarea, guia_despacho, boleta) per cliente or empresa,
sorted fecha DESC + id DESC, paginated.
"""
from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.boleta import Boleta
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion
from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.guia_despacho import GuiaDespacho
from app.models.nota_credito import NotaCredito
from app.models.nota_debito import NotaDebito
from app.models.nota_venta import NotaVenta
from app.models.pago import Pago
from app.models.tarea import Tarea
from app.models.user import User

router = APIRouter()

# ---------------------------------------------------------------------------
# Valid tipos
# ---------------------------------------------------------------------------
TIPOS_VALIDOS = frozenset(
    [
        "cotizacion",
        "nota_venta",
        "factura",
        "nota_credito",
        "nota_debito",
        "pago",
        "tarea",
        "guia_despacho",
        "boleta",
    ]
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fecha_str(v: datetime.date | datetime.datetime | None) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    return v.isoformat()


def _decimal_str(v: Decimal | None) -> str | None:
    if v is None:
        return None
    return str(v)


def _build_event(tipo: str, row: Any) -> dict:
    """Map an ORM row to a timeline item dict."""
    if tipo == "cotizacion":
        return {
            "tipo": "cotizacion",
            "id": row.id,
            "fecha": _fecha_str(row.fecha),
            "titulo": f"Cotización #{row.id}",
            "subtitulo": f"Estado: {row.estado}",
            "monto": _decimal_str(row.total),
            "estado": row.estado,
            "link": f"/cotizaciones/{row.id}",
        }
    if tipo == "nota_venta":
        return {
            "tipo": "nota_venta",
            "id": row.id,
            "fecha": _fecha_str(row.fecha),
            "titulo": f"Nota de Venta #{row.id}",
            "subtitulo": f"Estado: {row.estado}",
            "monto": _decimal_str(row.total),
            "estado": row.estado,
            "link": f"/notas-venta/{row.id}",
        }
    if tipo == "factura":
        return {
            "tipo": "factura",
            "id": row.id,
            "fecha": _fecha_str(row.fecha),
            "titulo": f"Factura #{row.id}",
            "subtitulo": f"Estado: {row.estado}",
            "monto": _decimal_str(row.total),
            "estado": row.estado,
            "link": f"/facturas/{row.id}",
        }
    if tipo == "nota_credito":
        return {
            "tipo": "nota_credito",
            "id": row.id,
            "fecha": _fecha_str(row.fecha),
            "titulo": f"Nota de Crédito #{row.id}",
            "subtitulo": f"Estado: {row.dte_estado}",
            "monto": _decimal_str(row.monto_total),
            "estado": row.dte_estado,
            "link": f"/notas-credito/{row.id}",
        }
    if tipo == "nota_debito":
        return {
            "tipo": "nota_debito",
            "id": row.id,
            "fecha": _fecha_str(row.fecha),
            "titulo": f"Nota de Débito #{row.id}",
            "subtitulo": f"Estado: {row.dte_estado}",
            "monto": _decimal_str(row.monto_total),
            "estado": row.dte_estado,
            "link": f"/notas-debito/{row.id}",
        }
    if tipo == "pago":
        return {
            "tipo": "pago",
            "id": row.id,
            "fecha": _fecha_str(row.fecha),
            "titulo": f"Pago #{row.id}",
            "subtitulo": None,
            "monto": _decimal_str(row.monto),
            "estado": None,
            "link": "/pagos",
        }
    if tipo == "tarea":
        return {
            "tipo": "tarea",
            "id": row.id,
            "fecha": _fecha_str(row.due_date),
            "titulo": f"Tarea: {row.titulo}",
            "subtitulo": f"Estado: {row.estado}",
            "monto": None,
            "estado": row.estado,
            "link": "/tareas",
        }
    if tipo == "guia_despacho":
        return {
            "tipo": "guia_despacho",
            "id": row.id,
            "fecha": _fecha_str(row.fecha),
            "titulo": f"Guía de despacho #{row.id}",
            "subtitulo": f"Estado: {row.estado}",
            "monto": _decimal_str(row.total),
            "estado": row.estado,
            "link": f"/guias-despacho/{row.id}",
        }
    if tipo == "boleta":
        return {
            "tipo": "boleta",
            "id": row.id,
            "fecha": _fecha_str(row.fecha),
            "titulo": f"Boleta #{row.id}",
            "subtitulo": f"Estado: {row.estado}",
            "monto": _decimal_str(row.total),
            "estado": row.estado,
            "link": f"/boletas/{row.id}",
        }
    raise ValueError(f"Tipo desconocido: {tipo}")  # pragma: no cover


# ---------------------------------------------------------------------------
# Query helpers per entity and axis (cliente vs empresa)
# ---------------------------------------------------------------------------


def _query_cliente(
    db: Session,
    tipo: str,
    cliente_id: int,
    current_user: User,
) -> list[Any]:
    """Return all rows of `tipo` for a given cliente_id."""
    is_vendedor = current_user.role == "vendedor"

    if tipo == "cotizacion":
        q = db.query(Cotizacion).filter(Cotizacion.cliente_id == cliente_id)
        if is_vendedor:
            q = q.filter(Cotizacion.vendedor_id == current_user.id)
        return q.all()

    if tipo == "nota_venta":
        q = db.query(NotaVenta).filter(NotaVenta.cliente_id == cliente_id)
        if is_vendedor:
            q = q.filter(NotaVenta.vendedor_id == current_user.id)
        return q.all()

    if tipo == "factura":
        q = db.query(Factura).filter(Factura.cliente_id == cliente_id)
        if is_vendedor:
            q = q.filter(Factura.vendedor_id == current_user.id)
        return q.all()

    if tipo == "nota_credito":
        # Vendedor scope para NC/ND/Pago se evaluará en W2-02-followup; por ahora oculto a vendedores
        if is_vendedor:
            return []
        return (
            db.query(NotaCredito)
            .filter(NotaCredito.cliente_id == cliente_id)
            .all()
        )

    if tipo == "nota_debito":
        # Vendedor scope para NC/ND/Pago se evaluará en W2-02-followup; por ahora oculto a vendedores
        if is_vendedor:
            return []
        return (
            db.query(NotaDebito)
            .filter(NotaDebito.cliente_id == cliente_id)
            .all()
        )

    if tipo == "pago":
        # Vendedor scope para NC/ND/Pago se evaluará en W2-02-followup; por ahora oculto a vendedores
        if is_vendedor:
            return []
        return (
            db.query(Pago)
            .join(Factura, Pago.factura_id == Factura.id)
            .filter(Factura.cliente_id == cliente_id)
            .all()
        )

    if tipo == "tarea":
        q = db.query(Tarea).filter(Tarea.cliente_id == cliente_id)
        if is_vendedor:
            q = q.filter(Tarea.asignado_id == current_user.id)
        return q.all()

    if tipo == "guia_despacho":
        q = db.query(GuiaDespacho).filter(GuiaDespacho.cliente_id == cliente_id)
        if is_vendedor:
            q = q.filter(GuiaDespacho.vendedor_id == current_user.id)
        return q.all()

    if tipo == "boleta":
        q = db.query(Boleta).filter(Boleta.cliente_id == cliente_id)
        if is_vendedor:
            q = q.filter(Boleta.vendedor_id == current_user.id)
        return q.all()

    return []  # pragma: no cover


def _query_empresa(
    db: Session,
    tipo: str,
    empresa_id: int,
    current_user: User,
) -> list[Any]:
    """Return all rows of `tipo` for a given empresa_id."""
    is_vendedor = current_user.role == "vendedor"

    if tipo == "cotizacion":
        q = db.query(Cotizacion).filter(Cotizacion.empresa_id == empresa_id)
        if is_vendedor:
            q = q.filter(Cotizacion.vendedor_id == current_user.id)
        return q.all()

    if tipo == "nota_venta":
        q = db.query(NotaVenta).filter(NotaVenta.empresa_id == empresa_id)
        if is_vendedor:
            q = q.filter(NotaVenta.vendedor_id == current_user.id)
        return q.all()

    if tipo == "factura":
        q = db.query(Factura).filter(Factura.empresa_id == empresa_id)
        if is_vendedor:
            q = q.filter(Factura.vendedor_id == current_user.id)
        return q.all()

    if tipo == "nota_credito":
        # Vendedor scope para NC/ND/Pago se evaluará en W2-02-followup; por ahora oculto a vendedores
        if is_vendedor:
            return []
        # NC has cliente_id; resolve via Cliente.empresa_id
        return (
            db.query(NotaCredito)
            .join(Cliente, NotaCredito.cliente_id == Cliente.id)
            .filter(Cliente.empresa_id == empresa_id)
            .all()
        )

    if tipo == "nota_debito":
        # Vendedor scope para NC/ND/Pago se evaluará en W2-02-followup; por ahora oculto a vendedores
        if is_vendedor:
            return []
        return (
            db.query(NotaDebito)
            .join(Cliente, NotaDebito.cliente_id == Cliente.id)
            .filter(Cliente.empresa_id == empresa_id)
            .all()
        )

    if tipo == "pago":
        # Vendedor scope para NC/ND/Pago se evaluará en W2-02-followup; por ahora oculto a vendedores
        if is_vendedor:
            return []
        return (
            db.query(Pago)
            .join(Factura, Pago.factura_id == Factura.id)
            .filter(Factura.empresa_id == empresa_id)
            .all()
        )

    if tipo == "tarea":
        q = db.query(Tarea).filter(Tarea.empresa_id == empresa_id)
        if is_vendedor:
            q = q.filter(Tarea.asignado_id == current_user.id)
        return q.all()

    if tipo == "guia_despacho":
        q = db.query(GuiaDespacho).filter(GuiaDespacho.empresa_id == empresa_id)
        if is_vendedor:
            q = q.filter(GuiaDespacho.vendedor_id == current_user.id)
        return q.all()

    if tipo == "boleta":
        q = db.query(Boleta).filter(Boleta.empresa_id == empresa_id)
        if is_vendedor:
            q = q.filter(Boleta.vendedor_id == current_user.id)
        return q.all()

    return []  # pragma: no cover


# ---------------------------------------------------------------------------
# Sort key
# ---------------------------------------------------------------------------

def _sort_key(item: dict) -> tuple:
    """Sort descending by fecha then id."""
    fecha = item.get("fecha") or "0000-00-00"
    return (fecha, item.get("id", 0))


# ---------------------------------------------------------------------------
# Core merge logic
# ---------------------------------------------------------------------------


def _build_timeline(
    db: Session,
    tipos: list[str],
    query_fn,
    entity_id: int,
    current_user: User,
    limit: int,
    offset: int,
) -> dict:
    all_events: list[dict] = []
    for tipo in tipos:
        rows = query_fn(db, tipo, entity_id, current_user)
        for row in rows:
            all_events.append(_build_event(tipo, row))

    # Sort fecha DESC, id DESC
    all_events.sort(key=_sort_key, reverse=True)

    total = len(all_events)
    page = all_events[offset : offset + limit]
    return {
        "items": page,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ---------------------------------------------------------------------------
# Parse & validate `tipos` query param
# ---------------------------------------------------------------------------

def _parse_tipos(tipos_str: str | None) -> list[str]:
    if not tipos_str or not tipos_str.strip():
        return list(TIPOS_VALIDOS)
    parts = [t.strip() for t in tipos_str.split(",") if t.strip()]
    unknown = [p for p in parts if p not in TIPOS_VALIDOS]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tipo(s) no válidos: {', '.join(unknown)}. "
                   f"Válidos: {', '.join(sorted(TIPOS_VALIDOS))}",
        )
    return parts


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/clientes/{cliente_id}/timeline")
def timeline_cliente(
    cliente_id: int,
    tipos: str | None = Query(None, description="Comma-separated tipos"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    current_user, db = perms

    # 404 check
    if not db.get(Cliente, cliente_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    tipos_list = _parse_tipos(tipos)

    return _build_timeline(
        db=db,
        tipos=tipos_list,
        query_fn=_query_cliente,
        entity_id=cliente_id,
        current_user=current_user,
        limit=limit,
        offset=offset,
    )


@router.get("/empresas/{empresa_id}/timeline")
def timeline_empresa(
    empresa_id: int,
    tipos: str | None = Query(None, description="Comma-separated tipos"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    current_user, db = perms

    # 404 check
    if not db.get(Empresa, empresa_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    tipos_list = _parse_tipos(tipos)

    return _build_timeline(
        db=db,
        tipos=tipos_list,
        query_fn=_query_empresa,
        entity_id=empresa_id,
        current_user=current_user,
        limit=limit,
        offset=offset,
    )
