def test_modelo_importable():
    from app.models.movimiento_inventario import MovimientoInventario
    assert MovimientoInventario.__tablename__ == "movimientos_inventario"
