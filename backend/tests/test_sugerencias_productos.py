import itertools
from datetime import date, timedelta
from decimal import Decimal

from app.models.cliente import Cliente
from app.models.empresa import Empresa
from app.models.factura import Factura, FacturaLinea
from app.models.producto import Producto

# Module-level counter: guarantees unique factura.numero across all tests in
# this file regardless of date or cliente_id, avoiding UNIQUE constraint
# collisions when multiple facturas share the same date.
_factura_numero = itertools.count(start=1)


def _seed_basic(db):
    """Crea 2 productos, 1 empresa, 1 cliente ligado, retorna dict."""
    emp = Empresa(nombre="ACME", rut="11.111.111-1")
    db.add(emp); db.flush()
    cli = Cliente(nombre="Juan", rut="22.222.222-2", empresa_id=emp.id)
    db.add(cli); db.flush()
    pA = Producto(nombre="Producto A", precio_venta=Decimal("100"))
    pB = Producto(nombre="Producto B", precio_venta=Decimal("200"))
    db.add_all([pA, pB]); db.flush()
    db.commit()
    return {"emp": emp, "cli": cli, "pA": pA, "pB": pB}


def _factura_con_lineas(db, cliente_id, empresa_id, fecha, estado, lineas_qty):
    """lineas_qty: dict[producto_id] = cantidad"""
    f = Factura(
        numero=next(_factura_numero),
        cliente_id=cliente_id,
        empresa_id=empresa_id,
        fecha=fecha,
        estado=estado,
    )
    db.add(f); db.flush()
    for pid, qty in lineas_qty.items():
        db.add(FacturaLinea(
            factura_id=f.id, producto_id=pid, descripcion="x",
            cantidad=qty, valor_neto=Decimal("1"),
        ))
    db.commit()
    return f


def test_sin_historial_retorna_lista_vacia(client, admin_token, db):
    seed = _seed_basic(db)
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_ordena_por_cantidad_total_desc(client, admin_token, db):
    seed = _seed_basic(db)
    # Empresa compra 2 de A y 10 de B
    _factura_con_lineas(
        db, seed["cli"].id, seed["emp"].id, date.today() - timedelta(days=10),
        "pagada", {seed["pA"].id: 2, seed["pB"].id: 10},
    )
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert nombres == ["Producto B", "Producto A"]


def test_excluye_anuladas(client, admin_token, db):
    seed = _seed_basic(db)
    _factura_con_lineas(
        db, seed["cli"].id, seed["emp"].id, date.today() - timedelta(days=5),
        "anulada", {seed["pA"].id: 99},
    )
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_excluye_facturas_viejas(client, admin_token, db):
    seed = _seed_basic(db)
    # Factura de hace 200 días (>180)
    _factura_con_lineas(
        db, seed["cli"].id, seed["emp"].id, date.today() - timedelta(days=200),
        "pagada", {seed["pA"].id: 5},
    )
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_empresa_prevalece_sobre_cliente(client, admin_token, db):
    """Si se pasan ambos, agrega por empresa (puede incluir otros clientes de la empresa)."""
    seed = _seed_basic(db)
    otro_cli = Cliente(nombre="Otro", rut="33.333.333-3", empresa_id=seed["emp"].id)
    db.add(otro_cli); db.flush(); db.commit()
    # otro_cli compra pA; seed cliente no compra nada directamente
    _factura_con_lineas(
        db, otro_cli.id, seed["emp"].id, date.today() - timedelta(days=5),
        "pagada", {seed["pA"].id: 3},
    )
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}&cliente_id={seed['cli'].id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert nombres == ["Producto A"]


def test_fallback_cliente_cuando_sin_empresa(client, admin_token, db):
    """Cliente suelto sin empresa: agrega por cliente_id."""
    cli_suelto = Cliente(nombre="Solo", rut="44.444.444-4")
    db.add(cli_suelto); db.flush()
    pX = Producto(nombre="X", precio_venta=Decimal("10"))
    db.add(pX); db.flush(); db.commit()
    _factura_con_lineas(
        db, cli_suelto.id, None, date.today() - timedelta(days=1),
        "emitida", {pX.id: 7},
    )
    r = client.get(
        f"/api/productos/sugerencias?cliente_id={cli_suelto.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["nombre"] == "X"


def test_sin_parametros_retorna_vacio(client, admin_token, db):
    r = client.get(
        "/api/productos/sugerencias",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_vendedor_no_ve_precio_costo(client, vendedor_token, db):
    """Vendedor usa ProductoBusquedaOutPublic — no debe ver precio_costo."""
    seed = _seed_basic(db)
    seed["pA"].precio_costo = Decimal("50")
    db.commit()
    _factura_con_lineas(
        db, seed["cli"].id, seed["emp"].id, date.today() - timedelta(days=10),
        "pagada", {seed["pA"].id: 3},
    )
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 200
    assert len(r.json()) > 0
    assert "precio_costo" not in r.json()[0]
