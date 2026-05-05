from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_modulo, require_permission
from app.database import get_db
from app.models.movimiento_inventario import MovimientoInventario
from app.models.orden_compra import OrdenCompra, OrdenCompraLinea
from app.models.producto import Producto
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.orden_compra import (
    EstadoUpdate,
    OrdenCompraCreate,
    OrdenCompraListOut,
    OrdenCompraOut,
    OrdenCompraUpdate,
    RecepcionPayload,
    OrdenCompraLineaCreate,
)
from app.models.empresa import Empresa
from app.services.email import EmailNotConfiguredError, enviar_orden_compra
from app.services.pdf import generar_pdf_orden_compra
from app.utils.logo import empresa_logo_data_uri

router = APIRouter(dependencies=[require_modulo("ordenes_compra")])


def _get_config_dict(db: Session) -> dict:
    rows = db.query(SystemConfig).all()
    return {r.key: r.value for r in rows}


def _calcular_lineas(lineas_data: list[OrdenCompraLineaCreate]) -> list[OrdenCompraLinea]:
    lineas = []
    for data in lineas_data:
        total_neto = data.cantidad * data.valor_neto
        iva = total_neto * Decimal("0.19")
        total = total_neto + iva
        lineas.append(OrdenCompraLinea(
            orden=data.orden,
            producto_id=data.producto_id,
            sku=data.sku,
            descripcion=data.descripcion,
            cantidad=data.cantidad,
            cantidad_recibida=0,
            valor_neto=data.valor_neto,
            total_neto=total_neto,
            iva=iva,
            total=total,
        ))
    return lineas


def _recalcular_totales(orden: OrdenCompra) -> None:
    orden.total_neto = sum(l.total_neto for l in orden.lineas)
    orden.total_iva = sum(l.iva for l in orden.lineas)
    orden.total = sum(l.total for l in orden.lineas)


def _asignar_numero(db: Session) -> int:
    config = (
        db.query(SystemConfig)
        .filter_by(key="orden_compra_last_id")
        .with_for_update()
        .first()
    )
    if not config:
        config = SystemConfig(key="orden_compra_last_id", value="0")
        db.add(config)
        db.flush()
    numero = int(config.value) + 1
    config.value = str(numero)
    return numero


def _get_orden_con_relaciones(db: Session, orden_id: int) -> OrdenCompra | None:
    return (
        db.query(OrdenCompra)
        .options(
            joinedload(OrdenCompra.proveedor),
            joinedload(OrdenCompra.lineas),
        )
        .filter(OrdenCompra.id == orden_id)
        .first()
    )


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("ordenes_compra", "view"),
):
    _, db = perms
    ordenes = (
        db.query(OrdenCompra)
        .options(joinedload(OrdenCompra.proveedor))
        .order_by(OrdenCompra.fecha.desc(), OrdenCompra.numero.desc())
        .all()
    )
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Órdenes de Compra"
    ws.append(["Nº OC", "Proveedor", "Fecha", "Entrega Esperada", "Estado", "Total Neto", "IVA", "Total"])
    for o in ordenes:
        ws.append([
            o.numero,
            o.proveedor.nombre if o.proveedor else "",
            o.fecha.strftime("%d/%m/%Y") if o.fecha else "",
            o.fecha_entrega_esperada.strftime("%d/%m/%Y") if o.fecha_entrega_esperada else "",
            o.estado,
            float(o.total_neto),
            float(o.total_iva),
            float(o.total),
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=ordenes_compra.xlsx"},
    )


@router.get("/", response_model=list[OrdenCompraListOut])
def listar_ordenes(
    proveedor_id: int | None = Query(None),
    estado: str | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    perms: tuple[User, Session] = require_permission("ordenes_compra", "view"),
):
    _, db = perms
    q = db.query(OrdenCompra).options(joinedload(OrdenCompra.proveedor))
    if proveedor_id:
        q = q.filter(OrdenCompra.proveedor_id == proveedor_id)
    if estado:
        q = q.filter(OrdenCompra.estado == estado)
    if fecha_desde:
        q = q.filter(OrdenCompra.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(OrdenCompra.fecha <= fecha_hasta)
    return q.order_by(OrdenCompra.fecha.desc(), OrdenCompra.numero.desc()).all()


@router.post("/", response_model=OrdenCompraOut, status_code=status.HTTP_201_CREATED)
def crear_orden(
    body: OrdenCompraCreate,
    perms: tuple[User, Session] = require_permission("ordenes_compra", "create"),
):
    _, db = perms
    numero = _asignar_numero(db)
    orden = OrdenCompra(
        numero=numero,
        proveedor_id=body.proveedor_id,
        fecha=body.fecha or date.today(),
        fecha_entrega_esperada=body.fecha_entrega_esperada,
        estado="borrador",
        nota=body.nota,
    )
    db.add(orden)
    db.flush()
    orden.lineas = _calcular_lineas(body.lineas)
    for linea in orden.lineas:
        linea.orden_compra_id = orden.id
    _recalcular_totales(orden)
    db.commit()
    return _get_orden_con_relaciones(db, orden.id)


@router.get("/{orden_id}", response_model=OrdenCompraOut)
def obtener_orden(
    orden_id: int,
    perms: tuple[User, Session] = require_permission("ordenes_compra", "view"),
):
    _, db = perms
    orden = _get_orden_con_relaciones(db, orden_id)
    if not orden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    return orden


@router.patch("/{orden_id}", response_model=OrdenCompraOut)
def actualizar_orden(
    orden_id: int,
    body: OrdenCompraUpdate,
    perms: tuple[User, Session] = require_permission("ordenes_compra", "edit"),
):
    _, db = perms
    orden = db.get(OrdenCompra, orden_id)
    if not orden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    if orden.historico:
        raise HTTPException(status_code=403, detail="Las OC históricas no se pueden editar")
    if orden.estado != "borrador":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo se pueden editar órdenes en estado 'borrador'")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(orden, field, value)
    db.commit()
    return _get_orden_con_relaciones(db, orden_id)


@router.put("/{orden_id}/lineas", response_model=OrdenCompraOut)
def reemplazar_lineas(
    orden_id: int,
    lineas_data: list[OrdenCompraLineaCreate],
    perms: tuple[User, Session] = require_permission("ordenes_compra", "edit"),
):
    _, db = perms
    orden = db.query(OrdenCompra).options(joinedload(OrdenCompra.lineas)).filter(OrdenCompra.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    if orden.historico:
        raise HTTPException(status_code=403, detail="Las OC históricas no se pueden editar")
    if orden.estado != "borrador":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo se pueden editar líneas en estado 'borrador'")
    for linea in list(orden.lineas):
        db.delete(linea)
    db.flush()
    nuevas = _calcular_lineas(lineas_data)
    for linea in nuevas:
        linea.orden_compra_id = orden_id
        db.add(linea)
    db.flush()
    orden.lineas = nuevas
    _recalcular_totales(orden)
    db.commit()
    return _get_orden_con_relaciones(db, orden_id)


@router.delete("/{orden_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_orden(
    orden_id: int,
    perms: tuple[User, Session] = require_permission("ordenes_compra", "delete"),
):
    _, db = perms
    orden = db.get(OrdenCompra, orden_id)
    if not orden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    if orden.historico:
        raise HTTPException(status_code=403, detail="Las OC históricas no se pueden editar")
    if orden.estado != "borrador":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo se pueden eliminar órdenes en estado 'borrador'")
    db.delete(orden)
    db.commit()


@router.get("/{orden_id}/pdf")
def generar_pdf(
    orden_id: int,
    perms: tuple[User, Session] = require_permission("ordenes_compra", "view"),
):
    _, db = perms
    orden = _get_orden_con_relaciones(db, orden_id)
    if not orden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    config = _get_config_dict(db)
    if getattr(orden, "empresa_id", None):
        emp = db.get(Empresa, orden.empresa_id)
        if emp:
            uri = empresa_logo_data_uri(emp.logo_path)
            if uri:
                config["empresa_logo_url"] = uri
    pdf_bytes = generar_pdf_orden_compra(orden, config)
    filename = f"OC-{orden.numero:05d} {orden.fecha}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{orden_id}/email")
def enviar_email(
    orden_id: int,
    perms: tuple[User, Session] = require_permission("ordenes_compra", "edit"),
):
    _, db = perms
    orden = _get_orden_con_relaciones(db, orden_id)
    if not orden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    if orden.historico:
        raise HTTPException(status_code=403, detail="Las OC históricas no se pueden editar")
    if orden.estado != "borrador":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo se pueden enviar órdenes en estado 'borrador'")
    config = _get_config_dict(db)
    if getattr(orden, "empresa_id", None):
        emp = db.get(Empresa, orden.empresa_id)
        if emp:
            uri = empresa_logo_data_uri(emp.logo_path)
            if uri:
                config["empresa_logo_url"] = uri
    try:
        pdf_bytes = generar_pdf_orden_compra(orden, config)
        enviar_orden_compra(orden, pdf_bytes)
    except EmailNotConfiguredError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error al enviar email: {e}")
    orden.estado = "enviada"
    db.commit()
    return {"detail": "Email enviado correctamente"}


@router.post("/{orden_id}/recepcionar", response_model=OrdenCompraOut)
def recepcionar(
    orden_id: int,
    body: RecepcionPayload,
    perms: tuple[User, Session] = require_permission("ordenes_compra", "edit"),
):
    current_user, db = perms
    orden = _get_orden_con_relaciones(db, orden_id)
    if not orden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    if orden.historico:
        raise HTTPException(status_code=403, detail="Las OC históricas no se pueden editar")
    if orden.estado not in ("enviada", "recibida_parcial"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo se puede recepcionar una orden enviada o recibida parcialmente")

    linea_map = {l.id: l for l in orden.lineas}
    for item in body.lineas:
        linea = linea_map.get(item.id)
        if not linea:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Línea {item.id} no pertenece a esta orden")
        if item.cantidad_recibida < linea.cantidad_recibida:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"La cantidad recibida no puede ser menor a la ya registrada ({linea.cantidad_recibida})")
        if item.cantidad_recibida > linea.cantidad:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"La cantidad recibida ({item.cantidad_recibida}) supera la cantidad pedida ({linea.cantidad})")
        delta = item.cantidad_recibida - linea.cantidad_recibida
        linea.cantidad_recibida = item.cantidad_recibida
        if linea.producto_id and delta > 0:
            producto = db.get(Producto, linea.producto_id)
            if producto:
                if not linea.valor_neto:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"La línea {linea.id} no tiene valor_neto; no se puede recepcionar sin costo unitario",
                    )
                producto.stock_actual += delta
                if linea.valor_neto and linea.valor_neto > producto.precio_costo:
                    producto.precio_costo = linea.valor_neto
                    producto.precio_costo_actualizado_en = datetime.now(timezone.utc)
                db.add(MovimientoInventario(
                    producto_id=linea.producto_id,
                    tipo="entrada",
                    cantidad=delta,
                    signo=1,
                    referencia_tipo="orden_compra",
                    referencia_id=orden_id,
                    usuario_id=current_user.id,
                ))

    if all(l.cantidad_recibida >= l.cantidad for l in orden.lineas):
        orden.estado = "recibida_completa"
    else:
        orden.estado = "recibida_parcial"

    db.commit()
    return _get_orden_con_relaciones(db, orden_id)


@router.patch("/{orden_id}/estado", response_model=OrdenCompraOut)
def cambiar_estado(
    orden_id: int,
    body: EstadoUpdate,
    perms: tuple[User, Session] = require_permission("ordenes_compra", "edit"),
):
    _, db = perms
    orden = db.get(OrdenCompra, orden_id)
    if not orden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    transiciones_validas = {
        "borrador": ["cancelada"],
        "enviada": ["cancelada"],
    }
    permitidas = transiciones_validas.get(orden.estado, [])
    if body.estado not in permitidas:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se puede pasar de '{orden.estado}' a '{body.estado}'",
        )
    orden.estado = body.estado
    db.commit()
    return _get_orden_con_relaciones(db, orden_id)
