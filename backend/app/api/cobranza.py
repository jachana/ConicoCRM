from __future__ import annotations
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.api.deps import require_permission
from app.models.cobranza_config import CobranzaConfig
from app.models.empresa import Empresa
from app.models.user import User
from app.models.factura import Factura
from app.schemas.cobranza import (
    AgingBucket,
    AgingReport,
    CobranzaConfigOut,
    CobranzaConfigUpdate,
    CobranzaDashboardOut,
    EmpresaDesglose,
    RecordatorioItemOut,
)

router = APIRouter()

_PENDIENTES = ("emitida", "parcial")


def _get_or_create_config(db: Session, empresa_id: int) -> CobranzaConfig:
    config = db.query(CobranzaConfig).filter(CobranzaConfig.empresa_id == empresa_id).first()
    if config is None:
        config = CobranzaConfig(empresa_id=empresa_id, dias_frecuencia=7)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.get("/dashboard", response_model=CobranzaDashboardOut)
def dashboard(perms: tuple[User, Session] = require_permission("facturas", "view")):
    _, db = perms
    today = date.today()

    facturas = (
        db.query(Factura)
        .options(joinedload(Factura.empresa))
        .filter(Factura.estado.in_(_PENDIENTES))
        .all()
    )

    total_por_cobrar = Decimal("0")
    total_vencido = Decimal("0")
    proximas_a_vencer = Decimal("0")
    buckets: dict[str, dict] = {
        "d_0_30": {"count": 0, "monto": Decimal("0")},
        "d_31_60": {"count": 0, "monto": Decimal("0")},
        "d_61_90": {"count": 0, "monto": Decimal("0")},
        "d_90_plus": {"count": 0, "monto": Decimal("0")},
    }
    empresa_map: dict[int, dict] = {}

    for f in facturas:
        saldo = f.total - (f.monto_pagado or Decimal("0"))
        total_por_cobrar += saldo

        if f.empresa_id:
            if f.empresa_id not in empresa_map:
                empresa_map[f.empresa_id] = {
                    "empresa_id": f.empresa_id,
                    "empresa_nombre": f.empresa.nombre if f.empresa else str(f.empresa_id),
                    "total": Decimal("0"),
                    "vencido": Decimal("0"),
                }
            empresa_map[f.empresa_id]["total"] += saldo

        if f.fecha_vencimiento:
            dias_hasta = (f.fecha_vencimiento - today).days
            if 0 <= dias_hasta <= 7:
                proximas_a_vencer += saldo

            if f.fecha_vencimiento < today:
                dias_vencida = (today - f.fecha_vencimiento).days
                total_vencido += saldo
                if f.empresa_id:
                    empresa_map[f.empresa_id]["vencido"] += saldo

                if dias_vencida <= 30:
                    bk = "d_0_30"
                elif dias_vencida <= 60:
                    bk = "d_31_60"
                elif dias_vencida <= 90:
                    bk = "d_61_90"
                else:
                    bk = "d_90_plus"
                buckets[bk]["count"] += 1
                buckets[bk]["monto"] += saldo

    aging = AgingReport(
        d_0_30=AgingBucket(**buckets["d_0_30"]),
        d_31_60=AgingBucket(**buckets["d_31_60"]),
        d_61_90=AgingBucket(**buckets["d_61_90"]),
        d_90_plus=AgingBucket(**buckets["d_90_plus"]),
    )

    return CobranzaDashboardOut(
        total_por_cobrar=total_por_cobrar,
        total_vencido=total_vencido,
        proximas_a_vencer=proximas_a_vencer,
        aging=aging,
        por_empresa=list(empresa_map.values()),
    )


@router.get("/recordatorios", response_model=list[RecordatorioItemOut])
def recordatorios(perms: tuple[User, Session] = require_permission("facturas", "view")):
    _, db = perms
    today = date.today()

    facturas = (
        db.query(Factura)
        .options(joinedload(Factura.empresa), joinedload(Factura.cliente))
        .filter(
            Factura.estado.in_(_PENDIENTES),
            Factura.fecha_vencimiento < today,
        )
        .all()
    )

    empresa_ids = {f.empresa_id for f in facturas if f.empresa_id}
    configs: dict[int, CobranzaConfig] = {}
    if empresa_ids:
        configs = {
            c.empresa_id: c
            for c in db.query(CobranzaConfig).filter(CobranzaConfig.empresa_id.in_(empresa_ids)).all()
        }

    result = []
    for f in facturas:
        config = configs.get(f.empresa_id) if f.empresa_id else None
        dias_frecuencia = config.dias_frecuencia if config else 7

        ultimo = f.ultimo_recordatorio
        if ultimo is not None and (today - ultimo).days < dias_frecuencia:
            continue

        saldo = f.total - (f.monto_pagado or Decimal("0"))
        dias_vencida = (today - f.fecha_vencimiento).days

        correo = (
            f.correo
            or (f.cliente.email if f.cliente else None)
            or (f.empresa.email if f.empresa else None)
        )

        result.append(
            RecordatorioItemOut(
                id=f.id,
                numero=f.numero,
                empresa_id=f.empresa_id,
                empresa_nombre=f.empresa.nombre if f.empresa else None,
                cliente_nombre=f.cliente.nombre if f.cliente else None,
                total=f.total,
                monto_pagado=f.monto_pagado or Decimal("0"),
                saldo=saldo,
                fecha_vencimiento=f.fecha_vencimiento,
                dias_vencida=dias_vencida,
                ultimo_recordatorio=f.ultimo_recordatorio,
                correo_enviar=correo,
            )
        )

    return result


@router.get("/config/{empresa_id}", response_model=CobranzaConfigOut)
def get_config(empresa_id: int, perms: tuple[User, Session] = require_permission("facturas", "view")):
    _, db = perms
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if empresa is None:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return _get_or_create_config(db, empresa_id)


@router.put("/config/{empresa_id}", response_model=CobranzaConfigOut)
def update_config(
    empresa_id: int,
    data: CobranzaConfigUpdate,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=403, detail="Solo admin o subadmin")
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if empresa is None:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    config = _get_or_create_config(db, empresa_id)
    config.dias_frecuencia = data.dias_frecuencia
    db.commit()
    db.refresh(config)
    return config
