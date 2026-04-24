# backend/tests/test_fifo.py
from decimal import Decimal
import pytest
from app.models.producto import Producto
from app.models.lote_costo import LoteCosto
from app.models.movimiento_inventario import MovimientoInventario
from app.services.inventario_fifo import consumir_stock_fifo, crear_lote_entrada, recalcular_precio_costo


@pytest.fixture
def producto(db):
    p = Producto(nombre="Test", precio_venta=Decimal("100"), ultimo_costo_unitario=Decimal("0"))
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_crear_lote_entrada_actualiza_precio_costo(db, producto):
    lote = crear_lote_entrada(db, producto_id=producto.id, costo_unitario=Decimal("50"), cantidad=10, oc_linea_id=None, usuario_id=None)
    db.refresh(producto)
    assert lote.cantidad_restante == 10
    assert producto.precio_costo == Decimal("50")
    assert producto.ultimo_costo_unitario == Decimal("50")


def test_precio_costo_es_maximo_de_lotes_activos(db, producto):
    crear_lote_entrada(db, producto_id=producto.id, costo_unitario=Decimal("30"), cantidad=5, oc_linea_id=None, usuario_id=None)
    crear_lote_entrada(db, producto_id=producto.id, costo_unitario=Decimal("50"), cantidad=5, oc_linea_id=None, usuario_id=None)
    db.refresh(producto)
    assert producto.precio_costo == Decimal("50")


def test_consumir_stock_fifo_descuenta_lote_mas_antiguo(db, producto):
    crear_lote_entrada(db, producto_id=producto.id, costo_unitario=Decimal("10"), cantidad=5, oc_linea_id=None, usuario_id=None)
    db.flush()
    crear_lote_entrada(db, producto_id=producto.id, costo_unitario=Decimal("20"), cantidad=5, oc_linea_id=None, usuario_id=None)
    db.refresh(producto)
    producto.stock_actual = 10
    db.commit()

    consumir_stock_fifo(db, producto_id=producto.id, cantidad=4, referencia_tipo="nota_venta", referencia_id=1, usuario_id=None)
    db.refresh(producto)

    lotes = db.query(LoteCosto).filter_by(producto_id=producto.id).order_by(LoteCosto.created_at).all()
    assert lotes[0].cantidad_restante == 1  # consumed 4 from first lot (had 5)
    assert lotes[1].cantidad_restante == 5  # second lot untouched
    assert producto.stock_actual == 6


def test_consumir_stock_fifo_span_multiples_lotes(db, producto):
    crear_lote_entrada(db, producto_id=producto.id, costo_unitario=Decimal("10"), cantidad=3, oc_linea_id=None, usuario_id=None)
    db.flush()
    crear_lote_entrada(db, producto_id=producto.id, costo_unitario=Decimal("20"), cantidad=3, oc_linea_id=None, usuario_id=None)
    db.refresh(producto)
    producto.stock_actual = 6
    db.commit()

    consumir_stock_fifo(db, producto_id=producto.id, cantidad=5, referencia_tipo="nota_venta", referencia_id=1, usuario_id=None)
    db.refresh(producto)

    lotes = db.query(LoteCosto).filter_by(producto_id=producto.id).order_by(LoteCosto.created_at).all()
    assert lotes[0].cantidad_restante == 0
    assert lotes[1].cantidad_restante == 1
    assert producto.stock_actual == 1

    movimientos = db.query(MovimientoInventario).filter_by(producto_id=producto.id, tipo="salida").all()
    assert len(movimientos) == 2  # one per lot consumed


def test_precio_costo_cae_a_ultimo_cuando_sin_lotes_activos(db, producto):
    crear_lote_entrada(db, producto_id=producto.id, costo_unitario=Decimal("15"), cantidad=2, oc_linea_id=None, usuario_id=None)
    db.refresh(producto)
    producto.stock_actual = 2
    db.commit()

    consumir_stock_fifo(db, producto_id=producto.id, cantidad=2, referencia_tipo="nota_venta", referencia_id=1, usuario_id=None)
    db.refresh(producto)

    assert producto.stock_actual == 0
    assert producto.precio_costo == Decimal("15")  # fallback to ultimo_costo_unitario


def test_consumir_stock_sin_lotes_reduce_stock_igual(db, producto):
    producto.stock_actual = 10
    producto.ultimo_costo_unitario = Decimal("25")
    db.commit()

    consumir_stock_fifo(db, producto_id=producto.id, cantidad=3, referencia_tipo="nota_venta", referencia_id=1, usuario_id=None)
    db.refresh(producto)

    assert producto.stock_actual == 7


def test_consumir_sobre_stock_permite_stock_negativo(db, producto):
    """Distributor can sell items not in stock — negative stock_actual is valid."""
    producto.stock_actual = 2
    producto.ultimo_costo_unitario = Decimal("10")
    db.commit()

    consumir_stock_fifo(db, producto_id=producto.id, cantidad=5, referencia_tipo="nota_venta", referencia_id=1, usuario_id=None)
    db.refresh(producto)

    assert producto.stock_actual == -3
