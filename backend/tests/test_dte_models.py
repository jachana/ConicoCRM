from app.models.dte_emision import DteEmision
from app.database import Base

def test_dte_emision_tablename():
    assert DteEmision.__tablename__ == "dte_emisiones"

def test_dte_emision_default_estado():
    e = DteEmision(tipo="033", monto_neto=100, monto_iva=19, monto_total=119)
    assert e.estado == "pendiente"
    assert e.intentos_poll == 0
