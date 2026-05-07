"""Regression: cotización PDF must show 'Válido hasta: <date> (<n> días)'."""
from datetime import date, timedelta
from types import SimpleNamespace

import os
from jinja2 import Environment, FileSystemLoader

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app", "templates")


def _render(validez_dias=15, fecha=date(2026, 4, 28)):
    cot = SimpleNamespace(
        numero=42, fecha=fecha, validez_dias=validez_dias,
        cliente=SimpleNamespace(nombre="Cliente X"),
        empresa=None, contacto=None, nota="", terminos_pago=None,
        metodo_pago=None, plazo_dias=0, correo=None,
        total_neto=1000, total_iva=190, total=1190, lineas=[],
    )
    fecha_expiracion = fecha + timedelta(days=validez_dias) if validez_dias > 0 else None
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    return env.get_template("cotizacion.html").render(
        cotizacion=cot, config={}, fecha_expiracion=fecha_expiracion,
    )


def test_template_renders_validez_block_with_date_and_days():
    html = _render(validez_dias=15, fecha=date(2026, 4, 28))
    assert "Válido hasta:" in html
    assert "13/05/2026" in html
    assert "(15 días)" in html


def test_template_renders_validez_with_default_5_days():
    html = _render(validez_dias=5, fecha=date(2026, 5, 1))
    assert "Válido hasta:" in html
    assert "06/05/2026" in html
    assert "(5 días)" in html


def test_template_omits_validez_block_when_no_expiration():
    cot = SimpleNamespace(
        numero=1, fecha=date(2026, 1, 1), validez_dias=0,
        cliente=SimpleNamespace(nombre="X"), empresa=None, contacto=None,
        nota="", terminos_pago=None, metodo_pago=None, plazo_dias=0,
        correo=None, total_neto=0, total_iva=0, total=0, lineas=[],
    )
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    html = env.get_template("cotizacion.html").render(cotizacion=cot, config={}, fecha_expiracion=None)
    assert "Válido hasta:" not in html


def test_service_passes_fecha_expiracion_to_template(monkeypatch):
    """Verify the production service path computes fecha_expiracion correctly."""
    from app.services import pdf as pdf_module

    captured = {}

    class FakeTemplate:
        def render(self, **kwargs):
            captured.update(kwargs)
            return "<html></html>"

    class FakeEnv:
        def __init__(self, *a, **kw): pass
        def get_template(self, name): return FakeTemplate()

    class FakeHTML:
        def __init__(self, *a, **kw): pass
        def write_pdf(self): return b"%PDF-1.4 fake"

    monkeypatch.setattr(pdf_module, "Environment", FakeEnv)
    monkeypatch.setattr(pdf_module, "HTML", FakeHTML)

    cot = SimpleNamespace(fecha=date(2026, 4, 28), validez_dias=15)
    pdf_module.generar_pdf_cotizacion(cot, {})

    assert captured["fecha_expiracion"] == date(2026, 5, 13)
