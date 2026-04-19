import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


class EmailNotConfiguredError(Exception):
    pass


def _get_smtp_config() -> dict:
    host = os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", user)

    if not host or not user or not password:
        raise EmailNotConfiguredError(
            "Email no configurado. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM en el servidor."
        )
    return {"host": host, "port": port, "user": user, "password": password, "from": from_addr}


def enviar_cotizacion(cotizacion, pdf_bytes: bytes) -> None:
    cfg = _get_smtp_config()

    empresa_nombre = "Conico"
    to_addr = cotizacion.correo or ""
    if not to_addr:
        raise ValueError("La cotización no tiene correo de destino")

    numero_str = f"COT-{cotizacion.numero:05d}"
    fecha_str = cotizacion.fecha.strftime("%d/%m/%Y") if cotizacion.fecha else ""
    cliente_nombre = cotizacion.cliente.nombre if cotizacion.cliente else ""

    msg = MIMEMultipart()
    msg["From"] = cfg["from"]
    msg["To"] = to_addr
    msg["Subject"] = f"Cotización {numero_str} — {empresa_nombre}"

    body = (
        f"Estimado/a {cotizacion.contacto or cliente_nombre},\n\n"
        f"Adjuntamos la cotización {numero_str} de fecha {fecha_str}.\n\n"
        f"Cliente: {cliente_nombre}\n"
        f"Total: $ {cotizacion.total:,.0f}\n\n"
        f"Quedamos a su disposición para cualquier consulta.\n\n"
        f"Saludos,\n{empresa_nombre}"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    filename = f"{numero_str} {fecha_str}.{cotizacion.contacto or cliente_nombre}.pdf"
    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(attachment)

    with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
        server.ehlo()
        server.starttls()
        server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from"], to_addr, msg.as_string())


def enviar_nota_venta(nota_venta, pdf_bytes: bytes) -> None:
    cfg = _get_smtp_config()

    empresa_nombre = "Conico"
    to_addr = nota_venta.correo or ""
    if not to_addr:
        raise ValueError("La nota de venta no tiene correo de destino")

    numero_str = f"NV-{nota_venta.numero:05d}"
    fecha_str = nota_venta.fecha.strftime("%d/%m/%Y") if nota_venta.fecha else ""
    cliente_nombre = nota_venta.cliente.nombre if nota_venta.cliente else ""

    msg = MIMEMultipart()
    msg["From"] = cfg["from"]
    msg["To"] = to_addr
    msg["Subject"] = f"Nota de Venta {numero_str} — {empresa_nombre}"

    body = (
        f"Estimado/a {nota_venta.contacto or cliente_nombre},\n\n"
        f"Adjuntamos la nota de venta {numero_str} de fecha {fecha_str}.\n\n"
        f"Cliente: {cliente_nombre}\n"
        f"Total: $ {nota_venta.total:,.0f}\n\n"
        f"Quedamos a su disposición para cualquier consulta.\n\n"
        f"Saludos,\n{empresa_nombre}"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    filename = f"{numero_str} {fecha_str}.{nota_venta.contacto or cliente_nombre}.pdf"
    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(attachment)

    with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
        server.ehlo()
        server.starttls()
        server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from"], to_addr, msg.as_string())


def enviar_orden_compra(orden_compra, pdf_bytes: bytes) -> None:
    cfg = _get_smtp_config()

    to_addr = orden_compra.proveedor.email if orden_compra.proveedor else ""
    if not to_addr:
        raise ValueError("El proveedor no tiene email de destino")

    empresa_nombre = "Conico"
    numero_str = f"OC-{orden_compra.numero:05d}"
    fecha_str = orden_compra.fecha.strftime("%d/%m/%Y") if orden_compra.fecha else ""
    proveedor_nombre = orden_compra.proveedor.nombre if orden_compra.proveedor else ""
    contacto = orden_compra.proveedor.contacto if orden_compra.proveedor else proveedor_nombre

    msg = MIMEMultipart()
    msg["From"] = cfg["from"]
    msg["To"] = to_addr
    msg["Subject"] = f"Orden de Compra {numero_str} — {empresa_nombre}"

    body = (
        f"Estimado/a {contacto},\n\n"
        f"Adjuntamos la orden de compra {numero_str} de fecha {fecha_str}.\n\n"
        f"Proveedor: {proveedor_nombre}\n"
        f"Total: $ {orden_compra.total:,.0f}\n\n"
        f"Quedamos a su disposición para cualquier consulta.\n\n"
        f"Saludos,\n{empresa_nombre}"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    filename = f"{numero_str} {fecha_str}.{proveedor_nombre}.pdf"
    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(attachment)

    with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
        server.ehlo()
        server.starttls()
        server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from"], to_addr, msg.as_string())


def enviar_factura(factura, pdf_bytes: bytes) -> None:
    raise NotImplementedError("enviar_factura not yet implemented")
