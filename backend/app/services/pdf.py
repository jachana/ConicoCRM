import os
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")


def generar_pdf_cotizacion(cotizacion, config: dict) -> bytes:
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    template = env.get_template("cotizacion.html")
    html_str = template.render(cotizacion=cotizacion, config=config)
    return HTML(string=html_str, base_url=TEMPLATES_DIR).write_pdf()


def generar_pdf_nota_venta(nota_venta, config: dict) -> bytes:
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    template = env.get_template("nota_venta.html")
    html_str = template.render(nota_venta=nota_venta, config=config)
    return HTML(string=html_str, base_url=TEMPLATES_DIR).write_pdf()


def generar_pdf_orden_compra(orden_compra, config: dict) -> bytes:
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    template = env.get_template("orden_compra.html")
    html_str = template.render(orden_compra=orden_compra, config=config)
    return HTML(string=html_str, base_url=TEMPLATES_DIR).write_pdf()


def generar_pdf_factura(factura, config: dict) -> bytes:
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    template = env.get_template("factura.html")
    html_str = template.render(factura=factura, config=config)
    return HTML(string=html_str, base_url=TEMPLATES_DIR).write_pdf()
