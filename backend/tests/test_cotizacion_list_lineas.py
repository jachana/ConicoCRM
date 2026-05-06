from datetime import date


def test_list_cotizaciones_includes_lineas(client, admin_token, db):
    """List endpoint must return lineas so the frontend preview can flatten them."""
    from app.models.cliente import Cliente
    from app.models.producto import Producto

    # Create a minimal cliente so cotizacion FK is satisfied
    cliente = Cliente(nombre="Test Cliente")
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    # Create a minimal producto for the linea
    producto = Producto(
        nombre="Producto test",
        sku="TEST-001",
        precio_costo=500,
        precio_venta=1000,
    )
    db.add(producto)
    db.commit()
    db.refresh(producto)

    # Create a cotizacion with one linea via the API
    payload = {
        "cliente_id": cliente.id,
        "fecha": str(date.today()),
        "lineas": [
            {
                "orden": 1,
                "producto_id": producto.id,
                "descripcion": "Producto test",
                "cantidad": 2,
                "valor_neto": "1000",
            }
        ],
    }
    create_resp = client.post(
        "/api/cotizaciones/",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_resp.status_code == 201

    # Now list and check lineas is present
    list_resp = client.get(
        "/api/cotizaciones/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert list_resp.status_code == 200
    body = list_resp.json()
    data = body["data"]
    assert len(data) > 0
    first = data[0]
    assert "lineas" in first, "CotizacionListOut must include lineas"
    assert len(first["lineas"]) == 1
    assert first["lineas"][0]["descripcion"] == "Producto test"
