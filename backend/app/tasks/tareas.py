from __future__ import annotations
from datetime import date, timedelta
import logging
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.tarea import Tarea
from app.models.regla_tarea import ReglaTarea
from app.models.cotizacion import Cotizacion
from app.models.factura import Factura
from app.services.tareas_asignacion import resolver_asignado

log = logging.getLogger(__name__)

MAX_CANDIDATOS = 500


def _existe_pendiente(db: Session, key: str) -> bool:
    return db.query(Tarea.id).filter(
        Tarea.dedup_key == key, Tarea.estado == "pendiente"
    ).first() is not None


def _crear_tarea(db: Session, *, titulo: str, due_date, regla: ReglaTarea,
                 dedup_key: str, asignado_id: int, **fks):
    t = Tarea(
        titulo=titulo,
        due_date=due_date,
        origen="auto",
        tipo_regla=regla.tipo,
        dedup_key=dedup_key,
        asignado_id=asignado_id,
        **fks,
    )
    db.add(t)


def _descartar_obsoletas(db: Session, regla: ReglaTarea, sigue_aplicando):
    pendientes = db.query(Tarea).filter(
        Tarea.origen == "auto",
        Tarea.tipo_regla == regla.tipo,
        Tarea.estado == "pendiente",
    ).all()
    for t in pendientes:
        if not sigue_aplicando(db, t):
            t.estado = "descartada"
            t.motivo_descarte = "evento resuelto"


def _generar_cotizacion_vence(db: Session, regla: ReglaTarea):
    today = date.today()
    abiertas = db.query(Cotizacion).filter(Cotizacion.estado == "abierta").all()
    candidatos = [
        c for c in abiertas
        if (c.fecha + timedelta(days=c.validez_dias) - today).days <= regla.offset_dias
        and (c.fecha + timedelta(days=c.validez_dias)) >= today
    ]
    if len(candidatos) > MAX_CANDIDATOS:
        log.warning(f"cotizacion_vence excede {MAX_CANDIDATOS}, omitido")
        return

    for c in candidatos:
        key = f"cotizacion_vence:{c.id}"
        if _existe_pendiente(db, key):
            continue
        dias_restantes = (c.fecha + timedelta(days=c.validez_dias) - today).days
        asignado = resolver_asignado(db, regla.asignado_rol, c.vendedor_id)
        _crear_tarea(
            db,
            titulo=f"Cotización #{c.numero} vence en {dias_restantes} días",
            due_date=c.fecha + timedelta(days=c.validez_dias),
            regla=regla,
            dedup_key=key,
            asignado_id=asignado,
            cotizacion_id=c.id,
        )

    def _sigue(db, t: Tarea) -> bool:
        if t.cotizacion_id is None:
            return False
        c = db.query(Cotizacion).filter(Cotizacion.id == t.cotizacion_id).first()
        return c is not None and c.estado == "abierta"
    _descartar_obsoletas(db, regla, _sigue)


def _generar_factura_vencida(db: Session, regla: ReglaTarea):
    today = date.today()
    candidatos = db.query(Factura).filter(
        Factura.estado == "emitida",
        Factura.fecha_vencimiento < today - timedelta(days=regla.offset_dias),
    ).all()
    if len(candidatos) > MAX_CANDIDATOS:
        log.warning(f"factura_vencida excede {MAX_CANDIDATOS}, omitido")
        return

    for f in candidatos:
        key = f"factura_vencida:{f.id}"
        if _existe_pendiente(db, key):
            continue
        dias_vencida = (today - f.fecha_vencimiento).days
        asignado = resolver_asignado(db, regla.asignado_rol, f.vendedor_id)
        _crear_tarea(
            db,
            titulo=f"Factura #{f.numero} vencida hace {dias_vencida} días",
            due_date=today,
            regla=regla,
            dedup_key=key,
            asignado_id=asignado,
            factura_id=f.id,
        )

    def _sigue(db, t: Tarea) -> bool:
        if t.factura_id is None:
            return False
        f = db.query(Factura).filter(Factura.id == t.factura_id).first()
        return f is not None and f.estado == "emitida"
    _descartar_obsoletas(db, regla, _sigue)


GENERADORES = {
    "cotizacion_vence": _generar_cotizacion_vence,
    "factura_vencida": _generar_factura_vencida,
}


def ejecutar_generacion(db: Session):
    reglas = db.query(ReglaTarea).filter(ReglaTarea.activa.is_(True)).all()
    for r in reglas:
        fn = GENERADORES.get(r.tipo)
        if fn is None:
            continue
        fn(db, r)
    db.commit()


@celery_app.task(name="app.tasks.tareas.generar_tareas_automaticas")
def generar_tareas_automaticas():
    db = SessionLocal()
    try:
        ejecutar_generacion(db)
    finally:
        db.close()
