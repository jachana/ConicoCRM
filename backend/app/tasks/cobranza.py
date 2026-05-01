from __future__ import annotations
from datetime import date, timedelta
import logging
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.empresa import Empresa
from app.models.cobranza_config import CobranzaConfig
from app.models.factura import Factura
from app.services.email import enviar_recordatorio

log = logging.getLogger(__name__)


def _enviar_recordatorio_factura(
    db: Session, factura: Factura, dias_frecuencia: int
) -> bool:
    """
    Send a reminder email for a single invoice.
    Returns True if successful, False otherwise.
    """
    try:
        # Get client email from factura.cliente.email or factura.correo
        cliente_email = None
        if factura.cliente and factura.cliente.email:
            cliente_email = factura.cliente.email
        elif factura.correo:
            cliente_email = factura.correo

        if not cliente_email:
            log.warning(
                f"Factura {factura.numero} (id={factura.id}) no tiene email de cliente"
            )
            return False

        # Build reminder email body
        empresa_nombre = factura.empresa.nombre if factura.empresa else "Conico"
        fecha_vencimiento_str = (
            factura.fecha_vencimiento.strftime("%d/%m/%Y")
            if factura.fecha_vencimiento
            else ""
        )
        dias_vencido = (date.today() - factura.fecha_vencimiento).days

        body = (
            f"Estimado/a {factura.cliente.nombre if factura.cliente else 'Cliente'},\n\n"
            f"Le recordamos que tiene una factura pendiente de pago:\n\n"
            f"Empresa: {empresa_nombre}\n"
            f"Factura: #{factura.numero}\n"
            f"Fecha de Vencimiento: {fecha_vencimiento_str}\n"
            f"Monto: $ {factura.total:,.0f}\n"
            f"Estado: {factura.estado}\n\n"
        )

        if dias_vencido > 0:
            body += f"Esta factura está vencida hace {dias_vencido} días.\n\n"
        else:
            body += f"Esta factura vence en {abs(dias_vencido)} días.\n\n"

        body += (
            f"Por favor, efectúe el pago a la brevedad.\n\n"
            f"Quedamos a su disposición para cualquier consulta.\n\n"
            f"Saludos,\n{empresa_nombre}"
        )

        # Send email
        enviar_recordatorio(cliente_email, "Recordatorio de Pago", body)

        # Update ultimo_recordatorio
        factura.ultimo_recordatorio = date.today()
        db.add(factura)

        log.info(
            f"Recordatorio enviado a {cliente_email} para factura #{factura.numero}"
        )
        return True
    except Exception as e:
        log.error(f"Error enviando recordatorio para factura {factura.numero}: {str(e)}")
        return False


def _procesar_empresa(db: Session, empresa: Empresa) -> int:
    """
    Process reminders for a single empresa.
    Returns the number of reminders sent.
    """
    # Get cobranza config
    config = db.query(CobranzaConfig).filter(
        CobranzaConfig.empresa_id == empresa.id
    ).first()

    if not config:
        log.debug(f"Empresa {empresa.nombre} (id={empresa.id}) no tiene CobranzaConfig")
        return 0

    dias_frecuencia = config.dias_frecuencia
    today = date.today()

    # Find facturas that need reminders
    # We need: fecha_vencimiento <= today - dias_frecuencia
    # This means: facturas that vencieron hace at least dias_frecuencia days
    cutoff_date = today - timedelta(days=dias_frecuencia)

    facturas = db.query(Factura).filter(
        Factura.empresa_id == empresa.id,
        Factura.estado.in_(["emitida", "pagada_parcial"]),
        Factura.exclude_recordatorio.is_(False),
        Factura.fecha_vencimiento <= cutoff_date,
    ).all()

    reminders_sent = 0

    for factura in facturas:
        # Check if we should send a reminder (ultimo_recordatorio is null or older than today)
        if (
            factura.ultimo_recordatorio is None
            or factura.ultimo_recordatorio < today
        ):
            if _enviar_recordatorio_factura(db, factura, dias_frecuencia):
                reminders_sent += 1

    return reminders_sent


@celery_app.task(
    bind=True,
    max_retries=3,
    name="app.tasks.cobranza.enviar_recordatorios_automaticos",
)
def enviar_recordatorios_automaticos(self):
    """
    Automatic invoice reminder Celery task.
    Runs daily at 8:00 AM and sends payment reminders for overdue invoices.
    """
    db = SessionLocal()
    try:
        log.info("Iniciando envío de recordatorios automáticos")

        # Get all empresas with CobranzaConfig
        empresas_con_config = (
            db.query(Empresa)
            .join(CobranzaConfig, CobranzaConfig.empresa_id == Empresa.id)
            .all()
        )

        total_reminders = 0
        for empresa in empresas_con_config:
            try:
                reminders = _procesar_empresa(db, empresa)
                total_reminders += reminders
                log.info(
                    f"Empresa {empresa.nombre}: {reminders} recordatorios enviados"
                )
            except Exception as e:
                log.error(
                    f"Error procesando empresa {empresa.nombre} (id={empresa.id}): {str(e)}"
                )
                # Continue with next empresa instead of failing entire task

        db.commit()
        log.info(f"Envío de recordatorios completado. Total: {total_reminders}")

    except Exception as e:
        db.rollback()
        log.error(f"Error en enviar_recordatorios_automaticos: {str(e)}")
        # Retry with exponential backoff
        try:
            raise self.retry(exc=e, countdown=60)
        except Exception:
            log.error("Max retries exceeded for enviar_recordatorios_automaticos")
            raise
    finally:
        db.close()
