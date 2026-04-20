import json
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.database import get_db
from app.models.aprobacion_credito import AprobacionCredito
from app.models.cotizacion import Cotizacion
from app.models.nota_venta import NotaVenta, NotaVentaLinea
from app.models.user import User
from app.schemas.aprobacion import AprobacionAccion, AprobacionCreate, AprobacionOut
from app.schemas.nota_venta import NotaVentaCreate, NotaVentaLineaCreate

router = APIRouter()


def _load_aprobacion(db: Session, aprobacion_id: int) -> AprobacionCredito:
    a = db.query(AprobacionCredito).options(
        joinedload(AprobacionCredito.vendedor),
        joinedload(AprobacionCredito.empresa),
    ).filter(AprobacionCredito.id == aprobacion_id).first()
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    return a


@router.post("/", response_model=AprobacionOut, status_code=status.HTTP_201_CREATED)
def crear_aprobacion(
    body: AprobacionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    aprobacion = AprobacionCredito(
        vendedor_id=current_user.id,
        empresa_id=body.empresa_id,
        total=body.total,
        nota=body.nota,
        estado="pendiente",
        origen=body.origen,
        cotizacion_id=body.cotizacion_id,
        nv_payload=json.dumps(body.nv_payload) if body.nv_payload else None,
    )
    db.add(aprobacion)
    db.commit()
    return _load_aprobacion(db, aprobacion.id)


@router.get("/", response_model=list[AprobacionOut])
def listar_aprobaciones(
    estado: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(AprobacionCredito).options(
        joinedload(AprobacionCredito.vendedor),
        joinedload(AprobacionCredito.empresa),
    )
    if current_user.role not in ("admin", "subadmin"):
        q = q.filter(AprobacionCredito.vendedor_id == current_user.id)
    if estado:
        q = q.filter(AprobacionCredito.estado == estado)
    return q.order_by(AprobacionCredito.created_at.desc()).all()


@router.get("/{aprobacion_id}", response_model=AprobacionOut)
def obtener_aprobacion(
    aprobacion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = _load_aprobacion(db, aprobacion_id)
    if current_user.role not in ("admin", "subadmin") and a.vendedor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return a


@router.patch("/{aprobacion_id}", response_model=AprobacionOut)
def accionar_aprobacion(
    aprobacion_id: int,
    body: AprobacionAccion,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administradores pueden aprobar")
    a = _load_aprobacion(db, aprobacion_id)
    if a.estado != "pendiente":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud ya fue procesada")

    if body.accion == "denegar":
        a.estado = "denegada"
        db.commit()
        return _load_aprobacion(db, a.id)

    if body.accion != "aprobar":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Acción inválida")

    from app.api.nota_ventas import (
        _asignar_numero_nv,
        _calcular_lineas,
        _recalcular_totales,
        _registrar_movimientos_salida,
        _load_nv,
    )

    if a.origen == "cotizacion":
        cot = db.query(Cotizacion).options(
            joinedload(Cotizacion.lineas)
        ).filter(Cotizacion.id == a.cotizacion_id).first()
        if not cot:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
        if cot.estado == "cerrada_fv":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La cotización ya fue convertida a NV")

    try:
        if a.origen == "cotizacion":
            numero = _asignar_numero_nv(db)
            nv = NotaVenta(
                numero=numero,
                cotizacion_id=cot.id,
                cliente_id=cot.cliente_id,
                empresa_id=cot.empresa_id,
                vendedor_id=cot.vendedor_id,
                contacto=cot.contacto,
                fecha=date.today(),
                nota=cot.nota,
                correo=cot.correo,
            )
            db.add(nv)
            db.flush()
            lineas = []
            for cl in cot.lineas:
                lineas.append(NotaVentaLinea(
                    nv_id=nv.id,
                    orden=cl.orden,
                    producto_id=cl.producto_id,
                    sku=cl.sku,
                    descripcion=cl.descripcion,
                    formato=cl.formato,
                    cantidad=cl.cantidad,
                    valor_neto=cl.valor_neto,
                    total_neto=cl.total_neto,
                    iva=cl.iva,
                    total=cl.total,
                    margen=cl.margen,
                ))
            nv.lineas = lineas
            _recalcular_totales(nv)
            cot.estado = "cerrada_fv"
            _registrar_movimientos_salida(db, nv.id, nv.lineas, current_user.id)

        else:  # directa
            if not a.nv_payload:
                raise HTTPException(status_code=400, detail="nv_payload no disponible en esta solicitud")
            payload_dict = json.loads(a.nv_payload)
            body_nv = NotaVentaCreate.model_validate(payload_dict)
            numero = _asignar_numero_nv(db)
            nv = NotaVenta(
                numero=numero,
                cliente_id=body_nv.cliente_id,
                vendedor_id=body_nv.vendedor_id or a.vendedor_id,
                contacto=body_nv.contacto,
                fecha=body_nv.fecha or date.today(),
                nota=body_nv.nota,
                correo=body_nv.correo,
                empresa_id=body_nv.empresa_id,
            )
            db.add(nv)
            db.flush()
            nv.lineas = _calcular_lineas(db, body_nv.lineas)
            for linea in nv.lineas:
                linea.nv_id = nv.id
            _recalcular_totales(nv)
            _registrar_movimientos_salida(db, nv.id, nv.lineas, current_user.id)

        a.estado = "aprobada"
        a.nv_id = nv.id
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error al procesar la aprobación")

    return _load_aprobacion(db, a.id)
