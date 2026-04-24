from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
import logging
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.tarea import Tarea
from app.models.regla_tarea import ReglaTarea
from app.models.cotizacion import Cotizacion
from app.models.factura import Factura
from app.models.aprobacion_credito import AprobacionCredito
from app.models.aprobacion_margen import AprobacionMargen
from app.models.nota_venta import NotaVenta
from app.models.cliente import Cliente
from app.models.producto import Producto
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


def _generar_aprobacion_pendiente(db: Session, regla: ReglaTarea):
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=regla.offset_dias)

    for model, tipo_label in [(AprobacionCredito, "credito"), (AprobacionMargen, "margen")]:
        candidatos = db.query(model).filter(
            model.estado == "pendiente",
            model.created_at <= cutoff_dt,
        ).all()
        if len(candidatos) > MAX_CANDIDATOS:
            log.warning(f"aprobacion_{tipo_label} excede {MAX_CANDIDATOS}")
            continue
        for a in candidatos:
            key = f"aprobacion_{tipo_label}:{a.id}"
            if _existe_pendiente(db, key):
                continue
            created_at = a.created_at if a.created_at.tzinfo else a.created_at.replace(tzinfo=timezone.utc)
            dias = (datetime.now(timezone.utc) - created_at).days
            asignado = resolver_asignado(db, regla.asignado_rol, None)
            _crear_tarea(
                db,
                titulo=f"Aprobación pendiente desde hace {dias} días",
                due_date=date.today(),
                regla=regla,
                dedup_key=key,
                asignado_id=asignado,
            )

    def _sigue(db, t: Tarea) -> bool:
        prefix, sep, rest = (t.dedup_key or "").partition(":")
        if not rest:
            return False
        tipo = prefix.replace("aprobacion_", "")
        model = AprobacionCredito if tipo == "credito" else AprobacionMargen
        a = db.query(model).filter(model.id == int(rest)).first()
        return a is not None and a.estado == "pendiente"
    _descartar_obsoletas(db, regla, _sigue)


def _generar_nv_despachada_sin_avanzar(db: Session, regla: ReglaTarea):
    today = date.today()
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=regla.offset_dias)
    candidatos = db.query(NotaVenta).filter(
        NotaVenta.estado == "despachada",
        NotaVenta.updated_at <= cutoff_dt,
    ).all()
    if len(candidatos) > MAX_CANDIDATOS:
        log.warning(f"nv_atascada excede {MAX_CANDIDATOS}, omitido")
        return

    for nv in candidatos:
        key = f"nv_atascada:{nv.id}"
        if _existe_pendiente(db, key):
            continue
        dias = (today - nv.updated_at.date()).days
        asignado = resolver_asignado(db, regla.asignado_rol, nv.vendedor_id)
        _crear_tarea(
            db,
            titulo=f"NV #{nv.numero} despachada hace {dias}d sin avanzar",
            due_date=today,
            regla=regla,
            dedup_key=key,
            asignado_id=asignado,
            nota_venta_id=nv.id,
        )

    def _sigue(db, t: Tarea) -> bool:
        if t.nota_venta_id is None:
            return False
        nv = db.query(NotaVenta).filter(NotaVenta.id == t.nota_venta_id).first()
        return nv is not None and nv.estado == "despachada"
    _descartar_obsoletas(db, regla, _sigue)


def _generar_cliente_sin_actividad(db: Session, regla: ReglaTarea):
    today = date.today()
    cutoff = today - timedelta(days=regla.offset_dias)

    cots = db.query(
        Cotizacion.cliente_id.label("cid"),
        func.max(Cotizacion.fecha).label("ult"),
        func.max(Cotizacion.vendedor_id).label("vendedor"),
    ).group_by(Cotizacion.cliente_id).subquery()

    rows = db.query(Cliente, cots.c.ult, cots.c.vendedor).outerjoin(
        cots, cots.c.cid == Cliente.id
    ).all()
    candidatos = [(c, ult, vend) for c, ult, vend in rows
                  if ult is None or ult <= cutoff]

    if len(candidatos) > MAX_CANDIDATOS:
        log.warning(f"cliente_sin_actividad excede {MAX_CANDIDATOS}, omitido")
        return

    for c, ult, vend in candidatos:
        key = f"cliente_inactivo:{c.id}"
        if _existe_pendiente(db, key):
            continue
        dias = (today - ult).days if ult else regla.offset_dias
        asignado = resolver_asignado(db, regla.asignado_rol, vend)
        _crear_tarea(
            db,
            titulo=f"Cliente {c.nombre} sin actividad hace {dias}d",
            due_date=today,
            regla=regla,
            dedup_key=key,
            asignado_id=asignado,
            cliente_id=c.id,
        )

    def _sigue(db, t: Tarea) -> bool:
        if t.cliente_id is None:
            return False
        last = db.query(func.max(Cotizacion.fecha)).filter(
            Cotizacion.cliente_id == t.cliente_id
        ).scalar()
        return last is None or last <= cutoff
    _descartar_obsoletas(db, regla, _sigue)


def _generar_stock_bajo_minimo(db: Session, regla: ReglaTarea):
    today = date.today()
    candidatos = db.query(Producto).filter(
        Producto.stock_actual < Producto.stock_minimo
    ).all()
    if len(candidatos) > MAX_CANDIDATOS:
        log.warning(f"stock_bajo excede {MAX_CANDIDATOS}, omitido")
        return

    for p in candidatos:
        key = f"stock_bajo:{p.id}"
        if _existe_pendiente(db, key):
            continue
        asignado = resolver_asignado(db, regla.asignado_rol, None)
        _crear_tarea(
            db,
            titulo=f"Stock bajo: {p.nombre} ({p.stock_actual}/{p.stock_minimo})",
            due_date=today,
            regla=regla,
            dedup_key=key,
            asignado_id=asignado,
            producto_id=p.id,
        )

    def _sigue(db, t: Tarea) -> bool:
        if t.producto_id is None:
            return False
        p = db.query(Producto).filter(Producto.id == t.producto_id).first()
        return p is not None and p.stock_actual < p.stock_minimo
    _descartar_obsoletas(db, regla, _sigue)


GENERADORES = {
    "cotizacion_vence": _generar_cotizacion_vence,
    "factura_vencida": _generar_factura_vencida,
    "aprobacion_pendiente": _generar_aprobacion_pendiente,
    "nv_despachada_sin_avanzar": _generar_nv_despachada_sin_avanzar,
    "cliente_sin_actividad": _generar_cliente_sin_actividad,
    "stock_bajo_minimo": _generar_stock_bajo_minimo,
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
