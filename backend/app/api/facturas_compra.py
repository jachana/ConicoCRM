from datetime import date
from decimal import Decimal
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.models.dte_emision import DteEmision
from app.models.factura_compra import FacturaCompra, FacturaCompraLinea
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.factura_compra import (
    FacturaCompraCreate,
    FacturaCompraListOut,
    FacturaCompraOut,
    FacturaCompraUpdate,
)
from app.schemas.dte import DteEmisionOut
from app.services.pdf import generar_pdf_factura_compra
from app.tasks.dte import emit_dte

router = APIRouter()

IVA_RATE = Decimal("0.19")


def _next_numero(db: Session) -> int:
    cfg = db.query(SystemConfig).filter_by(key="factura_compra_last_id").with_for_update().first()
    if not cfg:
        cfg = SystemConfig(key="factura_compra_last_id", value="0")
        db.add(cfg)
        db.flush()
    numero = int(cfg.value) + 1
    cfg.value = str(numero)
    return numero


def _calcular_lineas(lineas_data, /) -> list[FacturaCompraLinea]:
    lineas = []
    for i, data in enumerate(lineas_data):
        orden = data.orden if data.orden is not None else i
        total_neto = data.valor_neto * data.cantidad
        iva = round(total_neto * IVA_RATE, 2)
        lineas.append(FacturaCompraLinea(
            orden=orden,
            producto_id=data.producto_id,
            sku=data.sku,
            descripcion=data.descripcion,
            cantidad=data.cantidad,
            valor_neto=data.valor_neto,
            total_neto=total_neto,
            iva=iva,
            total=total_neto + iva,
        ))
    return lineas


def _recalcular(fc: FacturaCompra) -> None:
    fc.total_neto = sum(l.total_neto for l in fc.lineas)
    fc.total_iva = round(fc.total_neto * IVA_RATE, 2)
    fc.total = fc.total_neto + fc.total_iva


@router.post("/", response_model=FacturaCompraOut, status_code=201)
def crear_factura_compra(
    body: FacturaCompraCreate,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    _, db = perms
    fc = FacturaCompra(
        numero=_next_numero(db),
        proveedor_id=body.proveedor_id,
        fecha=body.fecha or date.today(),
        nota=body.nota,
        total_neto=Decimal("0"),
        total_iva=Decimal("0"),
        total=Decimal("0"),
    )
    fc.lineas = _calcular_lineas(body.lineas)
    db.add(fc)
    db.flush()
    _recalcular(fc)
    db.commit()
    db.refresh(fc)
    return fc


@router.get("/", response_model=list[FacturaCompraListOut])
def listar_facturas_compra(
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    current_user, db = perms
    if current_user.role == "vendedor":
        raise HTTPException(status_code=403, detail="Acceso restringido")
    return (
        db.query(FacturaCompra)
        .order_by(FacturaCompra.numero.desc())
        .all()
    )


@router.get("/{fc_id}", response_model=FacturaCompraOut)
def get_factura_compra(
    fc_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    current_user, db = perms
    if current_user.role == "vendedor":
        raise HTTPException(status_code=403, detail="Acceso restringido")
    fc = (
        db.query(FacturaCompra)
        .options(joinedload(FacturaCompra.lineas))
        .filter_by(id=fc_id)
        .first()
    )
    if not fc:
        raise HTTPException(status_code=404, detail="Factura de compra no encontrada")
    return fc


@router.put("/{fc_id}", response_model=FacturaCompraOut)
def actualizar_factura_compra(
    fc_id: int,
    body: FacturaCompraUpdate,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    _, db = perms
    fc = (
        db.query(FacturaCompra)
        .options(joinedload(FacturaCompra.lineas))
        .filter_by(id=fc_id)
        .first()
    )
    if not fc:
        raise HTTPException(status_code=404, detail="Factura de compra no encontrada")
    if fc.is_locked:
        raise HTTPException(status_code=409, detail="Documento bloqueado por DTE")

    if body.proveedor_id is not None:
        fc.proveedor_id = body.proveedor_id
    if body.fecha is not None:
        fc.fecha = body.fecha
    if body.nota is not None:
        fc.nota = body.nota
    if body.lineas is not None:
        for l in fc.lineas:
            db.delete(l)
        db.flush()
        fc.lineas = _calcular_lineas(body.lineas)
        db.flush()
        _recalcular(fc)

    db.commit()
    db.refresh(fc)
    return fc


@router.delete("/{fc_id}", status_code=204)
def eliminar_factura_compra(
    fc_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "delete"),
):
    _, db = perms
    fc = db.query(FacturaCompra).filter_by(id=fc_id).first()
    if not fc:
        raise HTTPException(status_code=404, detail="Factura de compra no encontrada")
    if fc.is_locked:
        raise HTTPException(status_code=409, detail="No se puede eliminar: DTE en proceso")
    db.delete(fc)
    db.commit()


@router.post("/{fc_id}/emitir", response_model=DteEmisionOut)
def emitir_factura_compra(
    fc_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    _, db = perms
    fc = db.query(FacturaCompra).options(joinedload(FacturaCompra.lineas)).filter_by(id=fc_id).first()
    if not fc:
        raise HTTPException(status_code=404, detail="Factura de compra no encontrada")
    if fc.dte_estado != "no_emitida":
        raise HTTPException(status_code=409, detail=f"FC ya en estado DTE: {fc.dte_estado}")
    existing = db.query(DteEmision).filter_by(factura_compra_id=fc_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe una emisión para esta factura de compra")
    emision = DteEmision(
        tipo="046",
        factura_compra_id=fc.id,
        monto_neto=int(fc.total_neto),
        monto_iva=int(fc.total_iva),
        monto_total=int(fc.total),
    )
    db.add(emision)
    fc.dte_estado = "pendiente"
    db.commit()
    db.refresh(emision)
    emit_dte.delay(emision.id)
    return emision


@router.get("/{fc_id}/pdf")
def pdf_factura_compra(
    fc_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    fc = (
        db.query(FacturaCompra)
        .options(joinedload(FacturaCompra.lineas), joinedload(FacturaCompra.proveedor))
        .filter_by(id=fc_id)
        .first()
    )
    if not fc:
        raise HTTPException(status_code=404, detail="Factura de compra no encontrada")
    config = {r.key: r.value for r in db.query(SystemConfig).all()}
    pdf_bytes = generar_pdf_factura_compra(fc, config)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="FC-{fc.numero:05d}.pdf"'},
    )
