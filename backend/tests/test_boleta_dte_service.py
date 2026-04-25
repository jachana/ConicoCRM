from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock
from app.services.dte_service import DteService


def _svc():
    return DteService(api_key="k", api_url="https://api.lioren.cl/v1", webhook_secret="s")


def _build_boleta(tipo_dte="39", lineas=None, cliente=None, patente=None, nombre_receptor=None, rut_receptor=None):
    boleta = MagicMock()
    boleta.tipo_dte = tipo_dte
    boleta.fecha = date(2026, 4, 25)
    boleta.cliente = cliente
    boleta.cliente_id = cliente.id if cliente else None
    boleta.patente_vehiculo = patente
    boleta.nombre_receptor = nombre_receptor
    boleta.rut_receptor = rut_receptor
    boleta.total_neto = Decimal("1000")
    boleta.total_iva = Decimal("190")
    boleta.total = Decimal("1190")
    boleta.lineas = lineas or []
    return boleta


def test_build_boleta_payload_39_with_iva(monkeypatch):
    monkeypatch.setattr("app.services.dte_service._get_config", lambda db: {"rut_emisor": "1-9"})
    linea = MagicMock(descripcion="Item", cantidad=Decimal("2"), precio_unitario=Decimal("595"))
    boleta = _build_boleta(tipo_dte="39", lineas=[linea])
    payload = _svc().build_boleta_payload(boleta, db=MagicMock())
    assert payload["tipo_dte"] == 39
    assert payload["totales"]["iva"] == 190
    assert payload["totales"]["monto_neto"] == 1000
    assert payload["totales"]["monto_total"] == 1190


def test_build_boleta_payload_41_sin_iva(monkeypatch):
    monkeypatch.setattr("app.services.dte_service._get_config", lambda db: {"rut_emisor": "1-9"})
    linea = MagicMock(descripcion="Servicio exento", cantidad=Decimal("1"), precio_unitario=Decimal("5000"))
    boleta = _build_boleta(tipo_dte="41", lineas=[linea])
    boleta.total_iva = Decimal("0")
    boleta.total = Decimal("5000")
    boleta.total_neto = Decimal("5000")
    payload = _svc().build_boleta_payload(boleta, db=MagicMock())
    assert payload["tipo_dte"] == 41
    assert payload["totales"]["iva"] == 0


def test_build_boleta_payload_anonima_usa_rut_generico(monkeypatch):
    monkeypatch.setattr("app.services.dte_service._get_config", lambda db: {})
    boleta = _build_boleta(lineas=[MagicMock(descripcion="x", cantidad=Decimal("1"), precio_unitario=Decimal("100"))])
    payload = _svc().build_boleta_payload(boleta, db=MagicMock())
    assert payload["receptor"]["rut"] == "66666666-6"
    assert payload["receptor"]["razon_social"] == "Consumidor Final"


def test_build_boleta_payload_anonima_con_nombre(monkeypatch):
    monkeypatch.setattr("app.services.dte_service._get_config", lambda db: {})
    boleta = _build_boleta(
        lineas=[MagicMock(descripcion="x", cantidad=Decimal("1"), precio_unitario=Decimal("100"))],
        nombre_receptor="Juan Perez",
    )
    payload = _svc().build_boleta_payload(boleta, db=MagicMock())
    assert payload["receptor"]["razon_social"] == "Juan Perez"


def test_build_boleta_payload_con_patente_agrega_referencia(monkeypatch):
    monkeypatch.setattr("app.services.dte_service._get_config", lambda db: {})
    boleta = _build_boleta(
        lineas=[MagicMock(descripcion="x", cantidad=Decimal("1"), precio_unitario=Decimal("100"))],
        patente="ABCD12",
    )
    payload = _svc().build_boleta_payload(boleta, db=MagicMock())
    assert "referencias" in payload
    assert payload["referencias"][0]["tipo"] == "PATENTE"
    assert payload["referencias"][0]["valor"] == "ABCD12"
