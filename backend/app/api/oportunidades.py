from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.cotizaciones import _asignar_numero
from app.api.deps import require_modulo, require_permission
from app.api.shared import enforce_al_contado
from app.database import get_db  # noqa: F401  (re-export pattern parity)
from app.models.cotizacion import Cotizacion
from app.models.empresa import Empresa
from app.models.oportunidad import Oportunidad, OportunidadEtapa
from app.models.user import User
from app.schemas.oportunidad import (
    ConvertToCotizacionOut,
    EtapaCreate,
    EtapaOut,
    EtapaUpdate,
    MoveStageIn,
    OportunidadCreate,
    OportunidadOut,
    OportunidadUpdate,
    PipelineEtapaSummary,
    PipelineOut,
    ReporteConversionOut,
)

router = APIRouter(dependencies=[require_modulo("oportunidades")])


def _serialize(o: Oportunidad) -> dict:
    return {
        "id": o.id,
        "titulo": o.titulo,
        "cliente_id": o.cliente_id,
        "cliente_nombre": o.cliente.nombre if o.cliente else None,
        "empresa_id": o.empresa_id,
        "empresa_nombre": o.empresa.nombre if o.empresa else None,
        "vendedor_id": o.vendedor_id,
        "vendedor_nombre": o.vendedor.name if o.vendedor else None,
        "etapa_id": o.etapa_id,
        "etapa_nombre": o.etapa.nombre if o.etapa else None,
        "etapa_color": o.etapa.color if o.etapa else None,
        "is_terminal_won": bool(o.etapa.is_terminal_won) if o.etapa else False,
        "is_terminal_lost": bool(o.etapa.is_terminal_lost) if o.etapa else False,
        "monto_estimado": o.monto_estimado,
        "probabilidad": o.probabilidad,
        "fecha_cierre_estimada": o.fecha_cierre_estimada,
        "descripcion": o.descripcion,
        "cotizacion_id": o.cotizacion_id,
        "cotizacion_numero": o.cotizacion.numero if o.cotizacion else None,
        "won_at": o.won_at,
        "lost_at": o.lost_at,
        "motivo_perdida": o.motivo_perdida,
        "created_at": o.created_at,
        "updated_at": o.updated_at,
    }


def _load_full(db: Session, oportunidad_id: int) -> Oportunidad:
    o = (
        db.query(Oportunidad)
        .options(
            joinedload(Oportunidad.etapa),
            joinedload(Oportunidad.cliente),
            joinedload(Oportunidad.empresa),
            joinedload(Oportunidad.vendedor),
            joinedload(Oportunidad.cotizacion),
        )
        .filter(Oportunidad.id == oportunidad_id)
        .first()
    )
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oportunidad no encontrada")
    return o


def _can_edit(user: User, op: Oportunidad) -> bool:
    if user.role in ("admin", "subadmin"):
        return True
    return op.vendedor_id == user.id


# ---------- Etapas ----------

@router.get("/etapas", response_model=list[EtapaOut])
def listar_etapas(
    include_inactive: bool = Query(False),
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    _, db = perms
    q = db.query(OportunidadEtapa)
    if not include_inactive:
        q = q.filter(OportunidadEtapa.is_active.is_(True))
    return q.order_by(OportunidadEtapa.orden).all()


@router.post("/etapas", response_model=EtapaOut, status_code=status.HTTP_201_CREATED)
def crear_etapa(
    body: EtapaCreate,
    perms: tuple[User, Session] = require_permission("cotizaciones", "edit"),
):
    user, db = perms
    if user.role not in ("admin", "subadmin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo admins pueden gestionar etapas")
    if db.query(OportunidadEtapa).filter(OportunidadEtapa.nombre == body.nombre).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una etapa con ese nombre")
    et = OportunidadEtapa(**body.model_dump())
    db.add(et)
    db.commit()
    db.refresh(et)
    return et


@router.patch("/etapas/{etapa_id}", response_model=EtapaOut)
def actualizar_etapa(
    etapa_id: int,
    body: EtapaUpdate,
    perms: tuple[User, Session] = require_permission("cotizaciones", "edit"),
):
    user, db = perms
    if user.role not in ("admin", "subadmin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo admins pueden gestionar etapas")
    et = db.get(OportunidadEtapa, etapa_id)
    if not et:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Etapa no encontrada")
    data = body.model_dump(exclude_unset=True)
    if "nombre" in data and data["nombre"] != et.nombre:
        if db.query(OportunidadEtapa).filter(OportunidadEtapa.nombre == data["nombre"]).first():
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una etapa con ese nombre")
    for k, v in data.items():
        setattr(et, k, v)
    db.commit()
    db.refresh(et)
    return et


@router.delete("/etapas/{etapa_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_etapa(
    etapa_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "delete"),
):
    user, db = perms
    if user.role not in ("admin", "subadmin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo admins pueden gestionar etapas")
    et = db.get(OportunidadEtapa, etapa_id)
    if not et:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Etapa no encontrada")
    if db.query(Oportunidad).filter(Oportunidad.etapa_id == etapa_id).first():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No se puede borrar una etapa con oportunidades asociadas; desactívala",
        )
    db.delete(et)
    db.commit()


# ---------- Pipeline (kanban view) ----------

@router.get("/pipeline", response_model=PipelineOut)
def pipeline(
    vendedor_id: int | None = Query(None),
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    user, db = perms
    etapas = (
        db.query(OportunidadEtapa)
        .filter(OportunidadEtapa.is_active.is_(True))
        .order_by(OportunidadEtapa.orden)
        .all()
    )
    q = db.query(Oportunidad).options(
        joinedload(Oportunidad.etapa),
        joinedload(Oportunidad.cliente),
        joinedload(Oportunidad.empresa),
        joinedload(Oportunidad.vendedor),
        joinedload(Oportunidad.cotizacion),
    )
    if user.role == "vendedor":
        q = q.filter(Oportunidad.vendedor_id == user.id)
    elif vendedor_id:
        q = q.filter(Oportunidad.vendedor_id == vendedor_id)
    ops = q.order_by(Oportunidad.updated_at.desc()).all()

    by_etapa: dict[int, list[Oportunidad]] = {e.id: [] for e in etapas}
    for o in ops:
        if o.etapa_id in by_etapa:
            by_etapa[o.etapa_id].append(o)

    return {
        "etapas": [
            {
                "etapa": e,
                "oportunidades": [_serialize(o) for o in by_etapa[e.id]],
                "total_monto": sum((o.monto_estimado or Decimal("0")) for o in by_etapa[e.id]),
                "count": len(by_etapa[e.id]),
            }
            for e in etapas
        ]
    }


# ---------- Reportes ----------

@router.get("/reportes/conversion", response_model=ReporteConversionOut)
def reporte_conversion(
    vendedor_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    user, db = perms
    q = db.query(Oportunidad).options(joinedload(Oportunidad.etapa))
    if user.role == "vendedor":
        q = q.filter(Oportunidad.vendedor_id == user.id)
    elif vendedor_id:
        q = q.filter(Oportunidad.vendedor_id == vendedor_id)
    if fecha_desde:
        q = q.filter(Oportunidad.created_at >= datetime.combine(fecha_desde, datetime.min.time(), tzinfo=timezone.utc))
    if fecha_hasta:
        q = q.filter(Oportunidad.created_at <= datetime.combine(fecha_hasta, datetime.max.time(), tzinfo=timezone.utc))

    ops = q.all()
    ganadas = [o for o in ops if o.etapa and o.etapa.is_terminal_won]
    perdidas = [o for o in ops if o.etapa and o.etapa.is_terminal_lost]
    abiertas = [o for o in ops if o.etapa and not o.etapa.is_terminal_won and not o.etapa.is_terminal_lost]
    total = len(ops)
    closed = len(ganadas) + len(perdidas)
    return {
        "total": total,
        "ganadas": len(ganadas),
        "perdidas": len(perdidas),
        "abiertas": len(abiertas),
        "monto_ganado": sum((o.monto_estimado or Decimal("0")) for o in ganadas),
        "monto_perdido": sum((o.monto_estimado or Decimal("0")) for o in perdidas),
        "monto_pipeline": sum((o.monto_estimado or Decimal("0")) for o in abiertas),
        "tasa_conversion": (len(ganadas) / closed) if closed else 0.0,
    }


# ---------- Oportunidad CRUD ----------

@router.get("", response_model=list[OportunidadOut])
def listar(
    etapa_id: int | None = Query(None),
    vendedor_id: int | None = Query(None),
    empresa_id: int | None = Query(None),
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    user, db = perms
    q = db.query(Oportunidad).options(
        joinedload(Oportunidad.etapa),
        joinedload(Oportunidad.cliente),
        joinedload(Oportunidad.empresa),
        joinedload(Oportunidad.vendedor),
        joinedload(Oportunidad.cotizacion),
    )
    if user.role == "vendedor":
        q = q.filter(Oportunidad.vendedor_id == user.id)
    elif vendedor_id:
        q = q.filter(Oportunidad.vendedor_id == vendedor_id)
    if etapa_id:
        q = q.filter(Oportunidad.etapa_id == etapa_id)
    if empresa_id:
        q = q.filter(Oportunidad.empresa_id == empresa_id)
    return [_serialize(o) for o in q.order_by(Oportunidad.updated_at.desc()).all()]


@router.post("", response_model=OportunidadOut, status_code=status.HTTP_201_CREATED)
def crear(
    body: OportunidadCreate,
    perms: tuple[User, Session] = require_permission("cotizaciones", "create"),
):
    user, db = perms
    etapa_id = body.etapa_id
    if etapa_id is None:
        first = (
            db.query(OportunidadEtapa)
            .filter(
                OportunidadEtapa.is_active.is_(True),
                OportunidadEtapa.is_terminal_won.is_(False),
                OportunidadEtapa.is_terminal_lost.is_(False),
            )
            .order_by(OportunidadEtapa.orden)
            .first()
        )
        if not first:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "No hay etapas activas configuradas",
            )
        etapa_id = first.id
    else:
        et = db.get(OportunidadEtapa, etapa_id)
        if not et or not et.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Etapa inválida")

    vendedor_id = body.vendedor_id
    if user.role == "vendedor" or vendedor_id is None:
        vendedor_id = user.id

    op = Oportunidad(
        titulo=body.titulo,
        cliente_id=body.cliente_id,
        empresa_id=body.empresa_id,
        vendedor_id=vendedor_id,
        etapa_id=etapa_id,
        monto_estimado=body.monto_estimado or Decimal("0"),
        probabilidad=body.probabilidad,
        fecha_cierre_estimada=body.fecha_cierre_estimada,
        descripcion=body.descripcion,
    )
    db.add(op)
    db.commit()
    db.refresh(op)
    return _serialize(_load_full(db, op.id))


@router.get("/{oportunidad_id}", response_model=OportunidadOut)
def obtener(
    oportunidad_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    user, db = perms
    op = _load_full(db, oportunidad_id)
    if user.role == "vendedor" and op.vendedor_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sin acceso")
    return _serialize(op)


@router.patch("/{oportunidad_id}", response_model=OportunidadOut)
def actualizar(
    oportunidad_id: int,
    body: OportunidadUpdate,
    perms: tuple[User, Session] = require_permission("cotizaciones", "edit"),
):
    user, db = perms
    op = _load_full(db, oportunidad_id)
    if not _can_edit(user, op):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sin permisos para editar")
    data = body.model_dump(exclude_unset=True)
    if "etapa_id" in data and data["etapa_id"] is not None:
        et = db.get(OportunidadEtapa, data["etapa_id"])
        if not et or not et.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Etapa inválida")
    for k, v in data.items():
        setattr(op, k, v)
    _refresh_terminal_marks(op, db)
    db.commit()
    return _serialize(_load_full(db, oportunidad_id))


@router.post("/{oportunidad_id}/move", response_model=OportunidadOut)
def mover_etapa(
    oportunidad_id: int,
    body: MoveStageIn,
    perms: tuple[User, Session] = require_permission("cotizaciones", "edit"),
):
    user, db = perms
    op = _load_full(db, oportunidad_id)
    if not _can_edit(user, op):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sin permisos para editar")
    et = db.get(OportunidadEtapa, body.etapa_id)
    if not et or not et.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Etapa inválida")
    op.etapa_id = body.etapa_id
    if body.motivo_perdida is not None:
        op.motivo_perdida = body.motivo_perdida
    _refresh_terminal_marks(op, db)
    db.commit()
    return _serialize(_load_full(db, oportunidad_id))


@router.delete("/{oportunidad_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(
    oportunidad_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "delete"),
):
    user, db = perms
    op = _load_full(db, oportunidad_id)
    if user.role not in ("admin", "subadmin") and op.vendedor_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sin permisos para borrar")
    db.delete(op)
    db.commit()


# ---------- Conversion ----------

@router.post("/{oportunidad_id}/convert", response_model=ConvertToCotizacionOut, status_code=status.HTTP_201_CREATED)
def convertir_a_cotizacion(
    oportunidad_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "create"),
):
    user, db = perms
    op = _load_full(db, oportunidad_id)
    if not _can_edit(user, op):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sin permisos")
    if op.cotizacion_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "La oportunidad ya tiene cotización")
    if not op.cliente_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "La oportunidad debe tener cliente asignado para crear cotización",
        )

    numero = _asignar_numero(db)
    terminos = enforce_al_contado(op.empresa_id, None, db)
    if not terminos and op.empresa_id:
        empresa = db.get(Empresa, op.empresa_id)
        terminos = empresa.plazo_credito if empresa and empresa.plazo_credito else "Al contado"

    cot = Cotizacion(
        numero=numero,
        cliente_id=op.cliente_id,
        vendedor_id=op.vendedor_id or user.id,
        empresa_id=op.empresa_id,
        fecha=date.today(),
        estado="abierta",
        nota=(f"Origen: oportunidad #{op.id} — {op.titulo}\n\n{op.descripcion or ''}").strip(),
        terminos_pago=terminos,
        terminos_pago_estado="aprobado",
        validez_dias=5,
        plazo_dias=0,
        total_neto=op.monto_estimado or Decimal("0"),
        total_iva=Decimal("0"),
        total=op.monto_estimado or Decimal("0"),
    )
    db.add(cot)
    db.flush()
    op.cotizacion_id = cot.id
    db.commit()
    return {"cotizacion_id": cot.id, "cotizacion_numero": cot.numero}


# ---------- internal helpers ----------

def _refresh_terminal_marks(op: Oportunidad, db: Session) -> None:
    et = db.get(OportunidadEtapa, op.etapa_id)
    if not et:
        return
    now = datetime.now(timezone.utc)
    if et.is_terminal_won:
        op.won_at = op.won_at or now
        op.lost_at = None
    elif et.is_terminal_lost:
        op.lost_at = op.lost_at or now
        op.won_at = None
    else:
        op.won_at = None
        op.lost_at = None
