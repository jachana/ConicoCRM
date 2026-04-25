from datetime import date
from decimal import Decimal
from app.models.boleta import Boleta, BoletaLinea


def test_boleta_defaults(db):
    b = Boleta(
        numero=1,
        fecha=date.today(),
        tipo_dte="39",
        vendedor_id=1,
        metodo_pago="efectivo",
    )
    db.add(b)
    db.commit()
    assert b.estado == "emitida"
    assert b.dte_estado == "no_emitida"
    assert b.total == Decimal("0")
    assert b.is_locked is False


def test_boleta_linea_cascade_delete(db):
    b = Boleta(numero=2, fecha=date.today(), tipo_dte="39", vendedor_id=1, metodo_pago="efectivo")
    b.lineas = [
        BoletaLinea(orden=0, descripcion="Item 1", cantidad=Decimal("1"), precio_unitario=Decimal("1000")),
    ]
    db.add(b)
    db.commit()
    bid = b.id
    db.delete(b)
    db.commit()
    remaining = db.query(BoletaLinea).filter_by(boleta_id=bid).count()
    assert remaining == 0


def test_boleta_is_locked_when_anulada(db):
    b = Boleta(numero=3, fecha=date.today(), tipo_dte="39", vendedor_id=1, metodo_pago="efectivo", estado="anulada")
    db.add(b)
    db.commit()
    assert b.is_locked is True
