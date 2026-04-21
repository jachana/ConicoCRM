from app.models.dte_emision import DteEmision
from app.database import Base

def test_dte_emision_tablename():
    assert DteEmision.__tablename__ == "dte_emisiones"

def test_dte_emision_default_estado():
    e = DteEmision(tipo="033", monto_neto=100, monto_iva=19, monto_total=119)
    assert e.estado == "pendiente"
    assert e.intentos_poll == 0

from app.models.nota_credito import NotaCredito, NotaCreditoLinea
from app.models.nota_debito import NotaDebito, NotaDebitoLinea

def test_nota_credito_default_dte_estado():
    nc = NotaCredito(fecha=None, cliente_id=1, razon="test", monto_neto=0, monto_iva=0, monto_total=0)
    assert nc.dte_estado == "no_emitida"

def test_nota_debito_default_dte_estado():
    nd = NotaDebito(fecha=None, cliente_id=1, razon="test", monto_neto=0, monto_iva=0, monto_total=0)
    assert nd.dte_estado == "no_emitida"
