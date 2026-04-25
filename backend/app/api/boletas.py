from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.boleta import Boleta, BoletaLinea
from app.models.dte_emision import DteEmision
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.boleta import BoletaCreate, BoletaOut
from app.services.boleta_stock import descontar_stock_boleta
from app.tasks.dte import emit_dte

router = APIRouter()


def _asignar_numero_boleta(db: Session) -> int:
    cfg = (
        db.query(SystemConfig)
        .filter_by(key="boleta_last_id")
        .with_for_update()
        .first()
    )
    if not cfg:
        cfg = SystemConfig(key="boleta_last_id", value="0")
        db.add(cfg)
        db.flush()
    numero = int(cfg.value) + 1
    cfg.value = str(numero)
    return numero


def _calcular_lineas_y_totales(boleta: Boleta) -> None:
    total_neto = Decimal("0")
    total_iva = Decimal("0")
    total_bruto = Decimal("0")
    tasa = Decimal("0.19") if boleta.tipo_dte == "39" else Decimal("0")

    for linea in boleta.lineas:
        bruto_unit = linea.precio_unitario  # En boleta, precio se ingresa bruto
        cantidad = linea.cantidad
        descuento = linea.descuento_pct or Decimal("0")
        bruto = bruto_unit * cantidad * (Decimal("1") - descuento / Decimal("100"))

        if linea.exenta or boleta.tipo_dte == "41":
            neto = bruto.quantize(Decimal("0.01"))
            iva_linea = Decimal("0")
        else:
            neto = (bruto / (Decimal("1") + tasa)).quantize(Decimal("0.01"))
            iva_linea = (bruto - neto).quantize(Decimal("0.01"))

        linea.total_neto = neto
        linea.iva = iva_linea
        linea.total_linea = (neto + iva_linea).quantize(Decimal("0.01"))

        total_neto += linea.total_neto
        total_iva += linea.iva
        total_bruto += linea.total_linea

    boleta.total_neto = total_neto
    boleta.total_iva = total_iva
    boleta.total = total_bruto


def _validar_boleta_41(payload: BoletaCreate) -> None:
    if payload.tipo_dte == "41":
        if any(not l.exenta for l in payload.lineas):
            raise HTTPException(
                status_code=422,
                detail="Boleta exenta (DTE 41) no admite líneas afectas. Marcá todas las líneas como exenta=true."
            )


@router.post("/", response_model=BoletaOut, status_code=status.HTTP_201_CREATED)
def crear_boleta(
    body: BoletaCreate,
    perms: tuple[User, Session] = require_permission("boletas", "create"),
):
    current_user, db = perms
    _validar_boleta_41(body)

    numero = _asignar_numero_boleta(db)
    boleta = Boleta(
        numero=numero,
        fecha=body.fecha or date.today(),
        tipo_dte=body.tipo_dte,
        cliente_id=body.cliente_id,
        empresa_id=body.empresa_id,
        patente_vehiculo=body.patente_vehiculo,
        email_envio=body.email_envio,
        nombre_receptor=body.nombre_receptor or ("Consumidor Final" if not body.cliente_id else None),
        rut_receptor=body.rut_receptor or ("66666666-6" if not body.cliente_id else None),
        vendedor_id=current_user.id,
        metodo_pago=body.metodo_pago,
    )
    db.add(boleta)
    db.flush()

    boleta.lineas = [
        BoletaLinea(
            boleta_id=boleta.id,
            orden=l.orden,
            producto_id=l.producto_id,
            descripcion=l.descripcion,
            cantidad=l.cantidad,
            precio_unitario=l.precio_unitario,
            descuento_pct=l.descuento_pct,
            exenta=l.exenta,
        )
        for l in body.lineas
    ]
    db.flush()

    _calcular_lineas_y_totales(boleta)

    if body.monto_pagado is not None:
        boleta.monto_pagado = body.monto_pagado
    else:
        boleta.monto_pagado = boleta.total

    descontar_stock_boleta(db, boleta, usuario_id=current_user.id)

    emision = DteEmision(
        tipo=f"0{boleta.tipo_dte}",
        boleta_id=boleta.id,
        monto_neto=int(boleta.total_neto),
        monto_iva=int(boleta.total_iva),
        monto_total=int(boleta.total),
    )
    db.add(emision)
    db.flush()

    boleta.dte_estado = "pendiente"
    db.commit()
    db.refresh(boleta)

    emit_dte.delay(emision.id)

    return boleta
