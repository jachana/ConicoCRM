from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.models.factura_compra import FacturaCompra, FacturaCompraLinea
from app.services.dte_service import DteService


# ── Model tests ────────────────────────────────────────────────────────────────

def test_factura_compra_tablename():
    assert FacturaCompra.__tablename__ == "facturas_compra"


def test_factura_compra_default_dte_estado():
    fc = FacturaCompra(numero=1, fecha=None)
    assert fc.dte_estado == "no_emitida"


def test_factura_compra_default_estado():
    fc = FacturaCompra(numero=1, fecha=None)
    assert fc.estado == "emitida"


def test_factura_compra_is_locked_no_emitida():
    fc = FacturaCompra(numero=1)
    fc.dte_estado = "no_emitida"
    assert fc.is_locked is False


@pytest.mark.parametrize("estado", ["pendiente", "procesando", "aceptada"])
def test_factura_compra_is_locked_true(estado):
    fc = FacturaCompra(numero=1)
    fc.dte_estado = estado
    assert fc.is_locked is True


def test_factura_compra_linea_tablename():
    assert FacturaCompraLinea.__tablename__ == "factura_compra_lineas"


# ── DteService payload tests ───────────────────────────────────────────────────

@pytest.fixture
def svc():
    return DteService(api_key="k", api_url="https://api.lioren.cl/v1", webhook_secret="s")


def _make_proveedor(rut="12345678-9", nombre="Prov SA"):
    p = MagicMock()
    p.rut = rut
    p.nombre = nombre
    return p


def _make_fc(proveedor=None, total_neto=1000, total_iva=190, total=1190):
    fc = MagicMock(spec=FacturaCompra)
    fc.proveedor = proveedor
    fc.fecha = None
    fc.total_neto = Decimal(str(total_neto))
    fc.total_iva = Decimal(str(total_iva))
    fc.total = Decimal(str(total))
    linea = MagicMock()
    linea.descripcion = "Servicio"
    linea.cantidad = 1
    linea.valor_neto = Decimal("1000")
    fc.lineas = [linea]
    return fc


def test_build_factura_compra_payload_tipo_dte(svc):
    db = MagicMock()
    db.query.return_value.all.return_value = []

    fc = _make_fc(proveedor=_make_proveedor())
    payload = svc.build_factura_compra_payload(fc, db)
    assert payload["tipo_dte"] == 46


def test_build_factura_compra_payload_receptor_rut(svc):
    db = MagicMock()
    db.query.return_value.all.return_value = []

    prov = _make_proveedor(rut="11111111-1", nombre="Vendedor Natural")
    fc = _make_fc(proveedor=prov)
    payload = svc.build_factura_compra_payload(fc, db)
    assert payload["receptor"]["rut"] == "11111111-1"
    assert payload["receptor"]["razon_social"] == "Vendedor Natural"


def test_build_factura_compra_payload_no_proveedor(svc):
    db = MagicMock()
    db.query.return_value.all.return_value = []

    fc = _make_fc(proveedor=None)
    payload = svc.build_factura_compra_payload(fc, db)
    assert payload["receptor"] == {}


def test_build_factura_compra_payload_totales(svc):
    db = MagicMock()
    db.query.return_value.all.return_value = []

    fc = _make_fc(total_neto=2000, total_iva=380, total=2380)
    payload = svc.build_factura_compra_payload(fc, db)
    assert payload["totales"]["monto_neto"] == 2000
    assert payload["totales"]["iva"] == 380
    assert payload["totales"]["monto_total"] == 2380
    assert payload["totales"]["tasa_iva"] == 19
