def test_crear_proveedor(db):
    from app.models.proveedor import Proveedor
    p = Proveedor(nombre="Proveedor Test", rut="76.123.456-7")
    db.add(p)
    db.commit()
    db.refresh(p)
    assert p.id is not None
    assert p.nombre == "Proveedor Test"
    assert p.created_at is not None

def test_crear_producto(db):
    from decimal import Decimal
    from app.models.producto import Producto
    p = Producto(nombre="Producto Test", precio_costo=100.0, precio_venta=150.0)
    db.add(p)
    db.commit()
    db.refresh(p)
    assert p.id is not None
    assert p.precio_venta == Decimal("150.0")

def test_crear_cliente(db):
    from app.models.cliente import Cliente
    c = Cliente(nombre="Cliente Test", rut="12.345.678-9")
    db.add(c)
    db.commit()
    db.refresh(c)
    assert c.id is not None
    assert c.nombre == "Cliente Test"

def test_producto_con_proveedor(db):
    from app.models.proveedor import Proveedor
    from app.models.producto import Producto
    prov = Proveedor(nombre="Prov A")
    db.add(prov)
    db.commit()
    db.refresh(prov)
    prod = Producto(nombre="Prod A", proveedor_id=prov.id, precio_costo=10.0, precio_venta=20.0)
    db.add(prod)
    db.commit()
    db.refresh(prod)
    assert prod.proveedor_id == prov.id
