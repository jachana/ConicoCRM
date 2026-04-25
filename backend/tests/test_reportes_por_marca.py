"""Tests for /api/reportes/por-marca endpoint."""


def test_por_marca_returns_valid_structure(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data
    assert "por_marca" in data
    assert "por_marca_cliente" in data
    assert "sin_marca" in data
    kpis = data["kpis"]
    for k in (
        "total_neto",
        "total_bruto",
        "ganancia_total",
        "margen_promedio_pct",
        "num_facturas",
        "num_marcas",
        "ticket_promedio",
        "cantidad_total",
    ):
        assert k in kpis, f"kpi {k} missing"


def test_por_marca_date_validation(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-04-30", "date_to": "2026-01-01"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_por_marca_requires_auth(client):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
    )
    assert r.status_code == 401


def test_por_marca_empty_period_returns_zeros(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2000-01-01", "date_to": "2000-12-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["kpis"]["total_neto"] == 0
    assert data["kpis"]["num_facturas"] == 0
    assert data["por_marca"] == []
    assert data["por_marca_cliente"] == []


from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente
from app.models.empresa import Empresa
from app.models.factura import Factura, FacturaLinea
from app.models.marca import Marca
from app.models.producto import Producto


def _mk_fixture(db):
    """Create two marcas, three productos (two with marca, one without),
    two clientes, two facturas with mixed lines."""
    marca_a = Marca(nombre="MarcaA-TST")
    marca_b = Marca(nombre="MarcaB-TST")
    db.add_all([marca_a, marca_b])
    db.flush()

    emp = Empresa(nombre="Emp-TST", rut="76000000-K")
    db.add(emp)
    db.flush()

    cli_1 = Cliente(nombre="Cli1-TST", empresa_id=emp.id)
    cli_2 = Cliente(nombre="Cli2-TST", empresa_id=emp.id)
    db.add_all([cli_1, cli_2])
    db.flush()

    prod_a = Producto(
        nombre="Prod-A-TST",
        sku="SKU-A-TST",
        precio_venta=Decimal("1000"),
        precio_costo=Decimal("600"),
        marca_id=marca_a.id,
    )
    prod_b = Producto(
        nombre="Prod-B-TST",
        sku="SKU-B-TST",
        precio_venta=Decimal("2000"),
        precio_costo=Decimal("1200"),
        marca_id=marca_b.id,
    )
    prod_nm = Producto(
        nombre="Prod-NM-TST",
        sku="SKU-NM-TST",
        precio_venta=Decimal("500"),
        precio_costo=Decimal("300"),
        marca_id=None,
    )
    db.add_all([prod_a, prod_b, prod_nm])
    db.flush()

    f1 = Factura(
        numero=900001,
        fecha=date(2026, 3, 15),
        cliente_id=cli_1.id,
        empresa_id=emp.id,
        estado="emitida",
        total_neto=Decimal("3500"),
        total_iva=Decimal("665"),
        total=Decimal("4165"),
    )
    db.add(f1)
    db.flush()
    db.add_all([
        FacturaLinea(
            factura_id=f1.id,
            producto_id=prod_a.id,
            descripcion="Prod-A-TST",
            cantidad=2,
            valor_neto=Decimal("2000"),
            total_neto=Decimal("2000"),
            iva=Decimal("380"),
            total=Decimal("2380"),
            margen=Decimal("0.40"),
        ),
        FacturaLinea(
            factura_id=f1.id,
            producto_id=prod_nm.id,
            descripcion="Prod-NM-TST",
            cantidad=3,
            valor_neto=Decimal("1500"),
            total_neto=Decimal("1500"),
            iva=Decimal("285"),
            total=Decimal("1785"),
            margen=Decimal("0.20"),
        ),
    ])

    f2 = Factura(
        numero=900002,
        fecha=date(2026, 3, 16),
        cliente_id=cli_2.id,
        empresa_id=emp.id,
        estado="emitida",
        total_neto=Decimal("2000"),
        total_iva=Decimal("380"),
        total=Decimal("2380"),
    )
    db.add(f2)
    db.flush()
    db.add_all([
        FacturaLinea(
            factura_id=f2.id,
            producto_id=prod_b.id,
            descripcion="Prod-B-TST",
            cantidad=1,
            valor_neto=Decimal("2000"),
            total_neto=Decimal("2000"),
            iva=Decimal("380"),
            total=Decimal("2380"),
            margen=Decimal("0.30"),
        ),
    ])
    db.commit()
    return {
        "marca_a": marca_a,
        "marca_b": marca_b,
        "cli_1": cli_1,
        "cli_2": cli_2,
        "f1": f1,
        "f2": f2,
    }


def test_por_marca_aggregates_by_marca(client, admin_token, db):
    _mk_fixture(db)
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    por_marca = {m["nombre"]: m for m in data["por_marca"]}
    assert "MarcaA-TST" in por_marca
    assert "MarcaB-TST" in por_marca
    a = por_marca["MarcaA-TST"]
    assert a["cantidad"] == 2
    assert a["neto"] == 2000
    assert a["ganancia"] == 800  # 0.40 * 2000
    assert a["margen_pct"] == 40.0
    assert a["num_facturas"] == 1
    assert a["num_clientes"] == 1


def test_por_marca_sin_marca_bucket(client, admin_token, db):
    _mk_fixture(db)
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = r.json()
    sm = data["sin_marca"]
    assert sm["cantidad"] == 3
    assert sm["neto"] == 1500
    assert sm["ganancia"] == 300  # 0.20 * 1500


def test_por_marca_cliente_combo(client, admin_token, db):
    fx = _mk_fixture(db)
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = r.json()
    pairs = {(row["marca_nombre"], row["cliente_id"]) for row in data["por_marca_cliente"]}
    assert ("MarcaA-TST", fx["cli_1"].id) in pairs
    assert ("MarcaB-TST", fx["cli_2"].id) in pairs


def test_por_marca_filters_by_cliente(client, admin_token, db):
    fx = _mk_fixture(db)
    r = client.get(
        "/api/reportes/por-marca",
        params={
            "date_from": "2026-03-01",
            "date_to": "2026-03-31",
            "cliente_id": fx["cli_1"].id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = r.json()
    marcas = {m["nombre"] for m in data["por_marca"]}
    assert "MarcaA-TST" in marcas
    assert "MarcaB-TST" not in marcas


def test_por_marca_filters_by_marca(client, admin_token, db):
    fx = _mk_fixture(db)
    r = client.get(
        "/api/reportes/por-marca",
        params={
            "date_from": "2026-03-01",
            "date_to": "2026-03-31",
            "marca_id": fx["marca_a"].id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = r.json()
    marcas = {m["nombre"] for m in data["por_marca"]}
    assert marcas == {"MarcaA-TST"}
