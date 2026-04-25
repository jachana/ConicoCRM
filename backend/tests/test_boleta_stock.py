from decimal import Decimal
from datetime import date
from app.models.boleta import Boleta, BoletaLinea
from app.models.movimiento_inventario import MovimientoInventario
from app.models.producto import Producto
from app.services.boleta_stock import descontar_stock_boleta, revertir_stock_boleta


def _crear_producto(db, sku="SKU-1"):
    p = Producto(nombre="Test", sku=sku, precio_venta=Decimal("1000"), precio_costo=Decimal("500"))
    db.add(p)
    db.flush()
    return p


def test_descontar_stock_crea_movimientos_negativos(db):
    p1 = _crear_producto(db, "S1")
    p2 = _crear_producto(db, "S2")
    b = Boleta(numero=200, fecha=date.today(), tipo_dte="39", vendedor_id=1, metodo_pago="efectivo")
    b.lineas = [
        BoletaLinea(orden=0, descripcion="A", producto_id=p1.id, cantidad=Decimal("3"), precio_unitario=Decimal("100")),
        BoletaLinea(orden=1, descripcion="B", producto_id=p2.id, cantidad=Decimal("2"), precio_unitario=Decimal("50")),
    ]
    db.add(b)
    db.flush()

    descontar_stock_boleta(db, b, usuario_id=1)
    db.flush()

    movs = (
        db.query(MovimientoInventario)
        .filter_by(referencia_tipo="boleta", referencia_id=b.id)
        .all()
    )
    assert len(movs) == 2
    for m in movs:
        assert m.tipo == "salida"
        assert m.signo == -1
        assert m.motivo == "boleta_emit"


def test_descontar_stock_omite_lineas_sin_producto(db):
    b = Boleta(numero=201, fecha=date.today(), tipo_dte="39", vendedor_id=1, metodo_pago="efectivo")
    b.lineas = [
        BoletaLinea(orden=0, descripcion="Servicio", producto_id=None, cantidad=Decimal("1"), precio_unitario=Decimal("100")),
    ]
    db.add(b)
    db.flush()
    descontar_stock_boleta(db, b, usuario_id=1)
    db.flush()
    movs = db.query(MovimientoInventario).filter_by(referencia_tipo="boleta", referencia_id=b.id).all()
    assert movs == []


def test_revertir_crea_movimientos_positivos(db):
    p = _crear_producto(db, "S3")
    b = Boleta(numero=202, fecha=date.today(), tipo_dte="39", vendedor_id=1, metodo_pago="efectivo")
    b.lineas = [
        BoletaLinea(orden=0, descripcion="A", producto_id=p.id, cantidad=Decimal("4"), precio_unitario=Decimal("100")),
    ]
    db.add(b)
    db.flush()
    descontar_stock_boleta(db, b, usuario_id=1)
    db.flush()

    revertir_stock_boleta(db, b, usuario_id=1, motivo="boleta_rechazo_sii")
    db.flush()

    movs = (
        db.query(MovimientoInventario)
        .filter_by(referencia_tipo="boleta", referencia_id=b.id, motivo="boleta_rechazo_sii")
        .all()
    )
    assert len(movs) == 1
    assert movs[0].tipo == "entrada"
    assert movs[0].signo == 1


from app.tasks.dte import _sync_dte_estado
from app.models.dte_emision import DteEmision


def test_sync_rechazada_revierte_stock_y_anula_boleta(db):
    p = _crear_producto(db, "S4")
    b = Boleta(numero=203, fecha=date.today(), tipo_dte="39", vendedor_id=1, metodo_pago="efectivo")
    b.lineas = [
        BoletaLinea(orden=0, descripcion="A", producto_id=p.id, cantidad=Decimal("2"), precio_unitario=Decimal("100")),
    ]
    db.add(b)
    db.flush()
    descontar_stock_boleta(db, b, usuario_id=1)

    em = DteEmision(tipo="039", boleta_id=b.id, monto_neto=200, monto_iva=38, monto_total=238)
    db.add(em)
    db.flush()

    _sync_dte_estado(db, em, "rechazada")
    db.flush()

    assert b.estado == "anulada"
    assert b.dte_estado == "rechazada"
    movs = db.query(MovimientoInventario).filter_by(referencia_tipo="boleta", referencia_id=b.id).count()
    assert movs == 2  # 1 salida + 1 entrada de reversa


def test_sync_rechazada_no_revierte_si_ya_anulada_manualmente(db):
    p = _crear_producto(db, "S5")
    b = Boleta(
        numero=204, fecha=date.today(), tipo_dte="39", vendedor_id=1,
        metodo_pago="efectivo", estado="anulada",
    )
    b.lineas = [
        BoletaLinea(orden=0, descripcion="A", producto_id=p.id, cantidad=Decimal("2"), precio_unitario=Decimal("100")),
    ]
    db.add(b)
    db.flush()
    descontar_stock_boleta(db, b, usuario_id=1)
    revertir_stock_boleta(db, b, usuario_id=1, motivo="boleta_anulada")
    db.flush()
    movs_antes = db.query(MovimientoInventario).filter_by(referencia_tipo="boleta", referencia_id=b.id).count()
    assert movs_antes == 2

    em = DteEmision(tipo="039", boleta_id=b.id, monto_neto=200, monto_iva=38, monto_total=238)
    db.add(em)
    db.flush()

    _sync_dte_estado(db, em, "rechazada")
    db.flush()

    assert b.dte_estado == "rechazada"
    assert b.estado == "anulada"
    movs_despues = db.query(MovimientoInventario).filter_by(referencia_tipo="boleta", referencia_id=b.id).count()
    assert movs_despues == 2  # no se duplica la reversa
