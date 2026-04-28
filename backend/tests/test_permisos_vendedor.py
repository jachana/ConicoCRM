"""Tests that vendedor role gets 403 on admin/subadmin-only endpoints."""
import os
import sys
from datetime import date
from decimal import Decimal

# Ensure env is set before any app import (conftest sets these too but be explicit)
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests")

_DATE_PARAMS = {"date_from": "2026-01-01", "date_to": "2026-04-30"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_cotizacion_with_margen(vendedor_user):
    """Insert a Cotizacion with one linea that has a non-null margen value."""
    from tests.conftest import TestingSession
    from app.models.cliente import Cliente
    from app.models.producto import Producto
    from app.models.cotizacion import Cotizacion, CotizacionLinea

    db = TestingSession()
    try:
        cliente = Cliente(nombre="Test Cliente Margen")
        db.add(cliente)
        db.flush()

        producto = Producto(
            nombre="Prod Margen",
            precio_costo=Decimal("500"),
            precio_venta=Decimal("1000"),
            stock_actual=10,
        )
        db.add(producto)
        db.flush()

        total_neto = Decimal("1000")
        iva = total_neto * Decimal("0.19")
        total = total_neto + iva
        margen = (Decimal("1000") - Decimal("500")) / Decimal("1000")  # 0.5

        cot = Cotizacion(
            numero=99001,
            cliente_id=cliente.id,
            vendedor_id=vendedor_user.id,
            fecha=date(2026, 4, 28),
            estado="no_definido",
            total_neto=total_neto,
            total_iva=iva,
            total=total,
            validez_dias=5,
        )
        db.add(cot)
        db.flush()

        linea = CotizacionLinea(
            cotizacion_id=cot.id,
            orden=1,
            producto_id=producto.id,
            sku="SKU-TEST",
            descripcion="Producto test",
            cantidad=1,
            valor_neto=Decimal("1000"),
            total_neto=total_neto,
            iva=iva,
            total=total,
            margen=margen,
        )
        db.add(linea)
        db.commit()
        return cot.id
    finally:
        db.close()


def test_vendedor_cannot_get_cobranza_dashboard(client, vendedor_token):
    resp = client.get(
        "/api/cobranza/dashboard",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_get_cobranza_recordatorios(client, vendedor_token):
    resp = client.get(
        "/api/cobranza/recordatorios",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_list_notas_credito(client, vendedor_token):
    resp = client.get(
        "/api/dte/notas-credito/",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_list_notas_debito(client, vendedor_token):
    resp = client.get(
        "/api/dte/notas-debito/",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_get_reporte_ventas(client, vendedor_token):
    resp = client.get(
        "/api/reportes/ventas",
        params=_DATE_PARAMS,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_get_reporte_cobranza(client, vendedor_token):
    resp = client.get(
        "/api/reportes/cobranza",
        params=_DATE_PARAMS,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_get_reporte_inventario(client, vendedor_token):
    resp = client.get(
        "/api/reportes/inventario",
        params=_DATE_PARAMS,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


# Verify admin and subadmin still pass through (no regression)

def test_admin_can_get_cobranza_dashboard(client, admin_token):
    resp = client.get(
        "/api/cobranza/dashboard",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200


def test_admin_can_list_notas_credito(client, admin_token):
    resp = client.get(
        "/api/dte/notas-credito/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200


def test_subadmin_can_get_reporte_ventas(client, subadmin_token):
    resp = client.get(
        "/api/reportes/ventas",
        params=_DATE_PARAMS,
        headers={"Authorization": f"Bearer {subadmin_token}"},
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Margen visibility tests
# ---------------------------------------------------------------------------

def test_vendedor_cotizacion_list_hides_margen(client, vendedor_user, vendedor_token):
    _make_cotizacion_with_margen(vendedor_user)
    resp = client.get(
        "/api/cotizaciones/",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    for cot in data:
        assert cot["margen_total"] is None
        for linea in cot.get("lineas", []):
            assert linea["margen"] is None


def test_vendedor_nv_list_hides_margen(client, vendedor_user, vendedor_token):
    # The NV list schema (NotaVentaListOut) does not include lineas or margen_total,
    # so margen never appears in the list response. This test confirms the list
    # endpoint returns 200 and doesn't expose any margen key.
    resp = client.get(
        "/api/nota_ventas/",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    for nv in resp.json():
        assert "margen" not in nv
        assert "margen_total" not in nv


def test_admin_cotizacion_list_sees_margen(client, admin_user, admin_token, vendedor_user):
    _make_cotizacion_with_margen(vendedor_user)
    resp = client.get(
        "/api/cotizaciones/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    # At least one cotizacion should have a non-null margen_total
    has_margen = any(cot["margen_total"] is not None for cot in data)
    assert has_margen, "Admin should see margen_total on cotizaciones with margin data"


# ---------------------------------------------------------------------------
# Helpers for NV and Factura detail tests
# ---------------------------------------------------------------------------

def _make_nv_with_margen(vendedor_user):
    """Insert a NotaVenta with one linea that has a non-null margen value."""
    from tests.conftest import TestingSession
    from app.models.cliente import Cliente
    from app.models.producto import Producto
    from app.models.nota_venta import NotaVenta, NotaVentaLinea

    db = TestingSession()
    try:
        cliente = Cliente(nombre="Test Cliente NV Margen")
        db.add(cliente)
        db.flush()

        producto = Producto(
            nombre="Prod NV Margen",
            precio_costo=Decimal("500"),
            precio_venta=Decimal("1000"),
            stock_actual=10,
        )
        db.add(producto)
        db.flush()

        total_neto = Decimal("1000")
        iva = total_neto * Decimal("0.19")
        total = total_neto + iva
        margen = (Decimal("1000") - Decimal("500")) / Decimal("1000")  # 0.5

        nv = NotaVenta(
            numero=99002,
            cliente_id=cliente.id,
            vendedor_id=vendedor_user.id,
            fecha=date(2026, 4, 28),
            estado="pendiente",
            total_neto=total_neto,
            total_iva=iva,
            total=total,
        )
        db.add(nv)
        db.flush()

        linea = NotaVentaLinea(
            nv_id=nv.id,
            orden=1,
            producto_id=producto.id,
            sku="SKU-NV-TEST",
            descripcion="Producto NV test",
            cantidad=1,
            valor_neto=Decimal("1000"),
            total_neto=total_neto,
            iva=iva,
            total=total,
            margen=margen,
        )
        db.add(linea)
        db.commit()
        return nv.id
    finally:
        db.close()


def _make_factura_with_margen(vendedor_user):
    """Insert a Factura with one linea that has a non-null margen value."""
    from tests.conftest import TestingSession
    from app.models.cliente import Cliente
    from app.models.producto import Producto
    from app.models.factura import Factura, FacturaLinea

    db = TestingSession()
    try:
        cliente = Cliente(nombre="Test Cliente Factura Margen")
        db.add(cliente)
        db.flush()

        producto = Producto(
            nombre="Prod Factura Margen",
            precio_costo=Decimal("500"),
            precio_venta=Decimal("1000"),
            stock_actual=10,
        )
        db.add(producto)
        db.flush()

        total_neto = Decimal("1000")
        iva = total_neto * Decimal("0.19")
        total = total_neto + iva
        margen = (Decimal("1000") - Decimal("500")) / Decimal("1000")  # 0.5

        factura = Factura(
            numero=99003,
            cliente_id=cliente.id,
            vendedor_id=vendedor_user.id,
            fecha=date(2026, 4, 28),
            estado="emitida",
            total_neto=total_neto,
            total_iva=iva,
            total=total,
        )
        db.add(factura)
        db.flush()

        linea = FacturaLinea(
            factura_id=factura.id,
            orden=1,
            producto_id=producto.id,
            sku="SKU-FAC-TEST",
            descripcion="Producto factura test",
            cantidad=1,
            valor_neto=Decimal("1000"),
            total_neto=total_neto,
            iva=iva,
            total=total,
            margen=margen,
        )
        db.add(linea)
        db.commit()
        return factura.id
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Detail endpoint margen-hiding tests
# ---------------------------------------------------------------------------

def test_vendedor_cotizacion_detail_hides_margen(client, vendedor_user, vendedor_token):
    cot_id = _make_cotizacion_with_margen(vendedor_user)
    resp = client.get(
        f"/api/cotizaciones/{cot_id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    for linea in data.get("lineas", []):
        assert linea["margen"] is None


def test_vendedor_factura_detail_hides_margen(client, vendedor_user, vendedor_token):
    fac_id = _make_factura_with_margen(vendedor_user)
    resp = client.get(
        f"/api/facturas/{fac_id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    for linea in data.get("lineas", []):
        assert linea["margen"] is None


def test_vendedor_nv_detail_hides_margen(client, vendedor_user, vendedor_token):
    nv_id = _make_nv_with_margen(vendedor_user)
    resp = client.get(
        f"/api/nota_ventas/{nv_id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    for linea in data.get("lineas", []):
        assert linea["margen"] is None


# ---------------------------------------------------------------------------
# Timeline scoping tests
# ---------------------------------------------------------------------------

def _make_tareas_for_timeline(vendedor_user, admin_user):
    """Create a cotizacion with two tasks: one for vendedor, one for admin."""
    from tests.conftest import TestingSession
    from app.models.cliente import Cliente
    from app.models.cotizacion import Cotizacion
    from app.models.tarea import Tarea
    from decimal import Decimal

    db = TestingSession()
    try:
        cliente = Cliente(nombre="Cliente Timeline Test")
        db.add(cliente)
        db.flush()

        total_neto = Decimal("1000")
        iva = total_neto * Decimal("0.19")
        total = total_neto + iva

        cot = Cotizacion(
            numero=99901,
            cliente_id=cliente.id,
            vendedor_id=vendedor_user.id,
            fecha=date(2026, 4, 28),
            estado="no_definido",
            total_neto=total_neto,
            total_iva=iva,
            total=total,
            validez_dias=5,
        )
        db.add(cot)
        db.flush()

        tarea_vendedor = Tarea(
            titulo="Tarea del vendedor",
            due_date=date(2026, 5, 1),
            estado="pendiente",
            origen="manual",
            asignado_id=vendedor_user.id,
            creado_por_id=vendedor_user.id,
            cotizacion_id=cot.id,
        )
        tarea_admin = Tarea(
            titulo="Tarea del admin",
            due_date=date(2026, 5, 2),
            estado="pendiente",
            origen="manual",
            asignado_id=admin_user.id,
            creado_por_id=admin_user.id,
            cotizacion_id=cot.id,
        )
        db.add(tarea_vendedor)
        db.add(tarea_admin)
        db.commit()
        return cot.id
    finally:
        db.close()


def test_vendedor_timeline_sees_only_own_tasks(
    client, vendedor_user, vendedor_token, admin_user, admin_token
):
    cot_id = _make_tareas_for_timeline(vendedor_user, admin_user)
    resp = client.get(
        f"/api/tareas/timeline/cotizacion/{cot_id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    tareas = resp.json()
    assert len(tareas) == 1
    assert tareas[0]["asignado_id"] == vendedor_user.id
    assert tareas[0]["titulo"] == "Tarea del vendedor"


def test_admin_timeline_sees_all_tasks(
    client, vendedor_user, vendedor_token, admin_user, admin_token
):
    cot_id = _make_tareas_for_timeline(vendedor_user, admin_user)
    resp = client.get(
        f"/api/tareas/timeline/cotizacion/{cot_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    tareas = resp.json()
    assert len(tareas) == 2
    asignados = {t["asignado_id"] for t in tareas}
    assert vendedor_user.id in asignados
    assert admin_user.id in asignados
