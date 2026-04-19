def test_modelos_importables():
    from app.models.orden_compra import OrdenCompra, OrdenCompraLinea
    assert OrdenCompra.__tablename__ == "ordenes_compra"
    assert OrdenCompraLinea.__tablename__ == "orden_compra_lineas"
