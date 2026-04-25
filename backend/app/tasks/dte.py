from datetime import datetime, timezone
from celery.exceptions import MaxRetriesExceededError
from sqlalchemy.orm import Session, joinedload

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.dte_emision import DteEmision
from app.models.factura import Factura
from app.models.nota_credito import NotaCredito
from app.models.nota_debito import NotaDebito
from app.models.boleta import Boleta
from app.services.dte_service import DteService, get_dte_service


def _lioren_to_estado(lioren_estado: str) -> str:
    mapping = {
        "aceptado": "aceptada",
        "aceptada": "aceptada",
        "rechazado": "rechazada",
        "rechazada": "rechazada",
        "procesando": "procesando",
        "en_proceso": "procesando",
    }
    return mapping.get(lioren_estado.lower(), "procesando")


def _sync_dte_estado(db: Session, emision: DteEmision, estado: str) -> None:
    if emision.factura_id:
        f = db.get(Factura, emision.factura_id)
        if f:
            f.dte_estado = estado
    elif emision.nota_credito_id:
        nc = db.get(NotaCredito, emision.nota_credito_id)
        if nc:
            nc.dte_estado = estado
    elif emision.nota_debito_id:
        nd = db.get(NotaDebito, emision.nota_debito_id)
        if nd:
            nd.dte_estado = estado
    elif emision.boleta_id:
        b = db.get(Boleta, emision.boleta_id)
        if b:
            b.dte_estado = estado


def _process_emit(db: Session, emision: DteEmision, svc: DteService) -> None:
    if emision.factura_id:
        doc = db.query(Factura).options(
            joinedload(Factura.lineas),
            joinedload(Factura.cliente),
        ).filter_by(id=emision.factura_id).first()
        payload = svc.build_factura_payload(doc, db)
    elif emision.nota_credito_id:
        doc = db.query(NotaCredito).options(
            joinedload(NotaCredito.lineas),
            joinedload(NotaCredito.cliente),
        ).filter_by(id=emision.nota_credito_id).first()
        payload = svc.build_nc_payload(doc, db)
    elif emision.nota_debito_id:
        doc = db.query(NotaDebito).options(
            joinedload(NotaDebito.lineas),
            joinedload(NotaDebito.cliente),
        ).filter_by(id=emision.nota_debito_id).first()
        payload = svc.build_nd_payload(doc, db)
    else:
        doc = db.query(Boleta).options(
            joinedload(Boleta.lineas),
            joinedload(Boleta.cliente),
        ).filter_by(id=emision.boleta_id).first()
        payload = svc.build_boleta_payload(doc, db)

    result = svc.emit(payload)
    emision.track_id = result.get("track_id")
    emision.folio = result.get("folio")
    emision.estado = "procesando"
    emision.emitido_at = datetime.now(timezone.utc)
    _sync_dte_estado(db, emision, "procesando")


@celery_app.task(bind=True, max_retries=3, name="app.tasks.dte.emit_dte")
def emit_dte(self, emision_id: int) -> None:
    db = SessionLocal()
    try:
        emision = db.query(DteEmision).filter_by(id=emision_id).first()
        if not emision or emision.estado not in ("pendiente",):
            return
        svc = get_dte_service()
        _process_emit(db, emision, svc)
        db.commit()
    except MaxRetriesExceededError:
        emision.estado = "rechazada"
        emision.respuesta_sii = {"error": "Max retries exceeded"}
        _sync_dte_estado(db, emision, "rechazada")
        db.commit()
    except Exception as exc:
        db.rollback()
        countdown = 60 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=countdown)
    finally:
        db.close()


@celery_app.task(name="app.tasks.dte.poll_dte_status")
def poll_dte_status() -> None:
    db = SessionLocal()
    try:
        emisiones = (
            db.query(DteEmision)
            .filter(DteEmision.estado == "procesando", DteEmision.intentos_poll < 20)
            .all()
        )
        if not emisiones:
            return
        svc = get_dte_service()
        for emision in emisiones:
            if not emision.track_id:
                continue
            try:
                result = svc.check_status(emision.track_id)
                lioren_estado = result.get("estado", "procesando")
                nuevo_estado = _lioren_to_estado(lioren_estado)
                if nuevo_estado != "procesando":
                    emision.estado = nuevo_estado
                    emision.respuesta_sii = result
                    if nuevo_estado == "aceptada":
                        emision.aceptado_at = datetime.now(timezone.utc)
                    _sync_dte_estado(db, emision, nuevo_estado)
                else:
                    emision.intentos_poll += 1
            except Exception:
                emision.intentos_poll += 1
        for emision in emisiones:
            if emision.intentos_poll >= 20:
                emision.estado = "timeout"
                _sync_dte_estado(db, emision, "timeout")
        db.commit()
    finally:
        db.close()
