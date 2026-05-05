from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.caf import CAF
from app.models.empresa import Empresa
from app.models.user import User
from app.services.email import enviar_recordatorio

log = logging.getLogger(__name__)


def _build_alert_line(caf: CAF) -> str:
    """Return a single human-readable line for a CAF alert."""
    total = caf.num_fin - caf.num_inicio + 1
    restantes = total - caf.consumido
    pct = round((caf.consumido / total) * 100, 1) if total > 0 else 0.0

    line = f"  - Tipo DTE {caf.tipo_dte}: {restantes} folios restantes ({pct}% consumido)"

    if caf.is_expiring_soon() and caf.fecha_vencimiento is not None:
        dias = (caf.fecha_vencimiento - date.today()).days
        line += f", vence en {dias} días"

    return line


def _get_alert_cafs(db: Session, empresa_id: int) -> list[CAF]:
    """Return all vigente CAFs in alert state for the given empresa."""
    cafs = (
        db.query(CAF)
        .filter(CAF.empresa_id == empresa_id, CAF.vigente.is_(True))
        .all()
    )
    return [c for c in cafs if c.is_low_stock() or c.is_expiring_soon()]


def _get_admin_users(db: Session, empresa_id: int) -> list[User]:
    """Return all active admin users for the given empresa."""
    return (
        db.query(User)
        .filter(
            User.empresa_id == empresa_id,
            User.role == "admin",
            User.is_active.is_(True),
        )
        .all()
    )


def _procesar_empresa_caf(db: Session, empresa: Empresa) -> int:
    """
    Send CAF alert emails to all admins of the empresa if there are alerts.
    Returns the number of emails sent.
    """
    alert_cafs = _get_alert_cafs(db, empresa.id)
    if not alert_cafs:
        return 0

    admins = _get_admin_users(db, empresa.id)
    if not admins:
        log.debug(
            f"Empresa {empresa.nombre} (id={empresa.id}) tiene alertas CAF pero sin usuarios admin"
        )
        return 0

    lines = [_build_alert_line(c) for c in alert_cafs]
    body = (
        f"Estimado/a administrador/a,\n\n"
        f"Los siguientes CAFs de {empresa.nombre} requieren atención:\n\n"
        + "\n".join(lines)
        + "\n\nPor favor, gestione la carga de nuevos folios a la brevedad.\n\n"
        "Saludos,\nConico"
    )

    emails_sent = 0
    for admin in admins:
        if not admin.email:
            continue
        try:
            enviar_recordatorio(
                admin.email,
                "Alerta CAF - Folios bajos o próximos a vencer",
                body,
            )
            log.info(
                f"Alerta CAF enviada a {admin.email} (empresa: {empresa.nombre}, "
                f"{len(alert_cafs)} alerta(s))"
            )
            emails_sent += 1
        except Exception as e:
            log.error(
                f"Error enviando alerta CAF a {admin.email} "
                f"(empresa: {empresa.nombre}): {e}"
            )

    return emails_sent


@celery_app.task(
    bind=True,
    max_retries=3,
    name="app.tasks.caf.send_caf_alerts_email",
)
def send_caf_alerts_email(self):
    """
    Daily Celery task: find CAFs in alert state across all empresas and send
    one consolidated email per admin listing all their empresa's alerts.
    Runs at 08:30 AM Chile time via Celery beat.
    """
    db = SessionLocal()
    try:
        log.info("Iniciando envío de alertas CAF")

        empresas = db.query(Empresa).all()
        total_emails = 0

        for empresa in empresas:
            try:
                sent = _procesar_empresa_caf(db, empresa)
                total_emails += sent
                if sent:
                    log.info(
                        f"Empresa {empresa.nombre}: {sent} email(s) de alerta CAF enviado(s)"
                    )
            except Exception as e:
                log.error(
                    f"Error procesando alertas CAF para empresa {empresa.nombre} "
                    f"(id={empresa.id}): {e}"
                )

        log.info(f"Alertas CAF completadas. Total emails enviados: {total_emails}")

    except Exception as e:
        db.rollback()
        log.error(f"Error en send_caf_alerts_email: {e}")
        try:
            raise self.retry(exc=e, countdown=60)
        except Exception:
            log.error("Max retries exceeded for send_caf_alerts_email")
            raise
    finally:
        db.close()
