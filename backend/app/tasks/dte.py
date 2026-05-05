from datetime import datetime, timezone
from celery.exceptions import MaxRetriesExceededError
from sqlalchemy.orm import Session, joinedload

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.dte_emision import DteEmision
from app.models.factura import Factura
from app.models.factura_compra import FacturaCompra
from app.models.guia_despacho import GuiaDespacho
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
            # D-16: solo NC aceptada por SII anula legalmente la guía
            if estado == "aceptada" and nc.guia_despacho_id:
                guia = db.get(GuiaDespacho, nc.guia_despacho_id)
                if guia:
                    guia.estado = "anulada"
    elif emision.nota_debito_id:
        nd = db.get(NotaDebito, emision.nota_debito_id)
        if nd:
            nd.dte_estado = estado
    elif emision.boleta_id:
        b = db.get(Boleta, emision.boleta_id)
        if b:
            previous = b.dte_estado
            b.dte_estado = estado
            if estado == "rechazada" and previous != "rechazada" and b.estado != "anulada":
                from app.services.boleta_stock import revertir_stock_boleta
                revertir_stock_boleta(db, b, usuario_id=None, motivo="boleta_rechazo_sii")
                b.estado = "anulada"
    elif emision.guia_despacho_id:
        guia = db.get(GuiaDespacho, emision.guia_despacho_id)
        if guia:
            guia.dte_estado = estado
            # D-12 / D-13: Guía DTE 52 NO descuenta stock — NO llamar revertir_stock_boleta
            # cuando estado == "rechazada" (a diferencia de boleta).
    elif emision.factura_compra_id:
        fc = db.get(FacturaCompra, emision.factura_compra_id)
        if fc:
            fc.dte_estado = estado


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
    elif emision.boleta_id:
        doc = db.query(Boleta).options(
            joinedload(Boleta.lineas),
            joinedload(Boleta.cliente),
        ).filter_by(id=emision.boleta_id).first()
        payload = svc.build_boleta_payload(doc, db)
    elif emision.guia_despacho_id:
        doc = (
            db.query(GuiaDespacho)
            .options(
                joinedload(GuiaDespacho.lineas),
                joinedload(GuiaDespacho.cliente),
            )
            .filter_by(id=emision.guia_despacho_id)
            .first()
        )
        if not doc:
            raise ValueError(f"GuiaDespacho {emision.guia_despacho_id} no encontrada")
        payload = svc.build_guia_payload(doc, db)
    elif emision.factura_compra_id:
        doc = db.query(FacturaCompra).options(
            joinedload(FacturaCompra.lineas),
            joinedload(FacturaCompra.proveedor),
        ).filter_by(id=emision.factura_compra_id).first()
        if not doc:
            raise ValueError(f"FacturaCompra {emision.factura_compra_id} no encontrada")
        payload = svc.build_factura_compra_payload(doc, db)
    else:
        raise ValueError(f"DteEmision {emision.id} has no document FK set")

    empresa_id = getattr(doc, "empresa_id", None)
    result = svc.emit(payload, empresa_id=empresa_id, dte_tipo=emision.tipo, db=db)
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
                result = svc.check_status(emision.track_id, dte_tipo=emision.tipo)
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
