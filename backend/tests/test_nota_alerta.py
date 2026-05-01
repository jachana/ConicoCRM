"""Tests for NotaAlerta API endpoints"""
import pytest
from datetime import date
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion, CotizacionLinea
from app.models.nota_alerta import NotaAlerta, EstadoAlerta
from app.models.producto import Producto
from app.models.user import User
from decimal import Decimal


@pytest.fixture
def producto(db):
    """Create a test product."""
    p = Producto(
        nombre="Test Product",
        sku="TEST-001",
        precio_costo=Decimal("100"),
        precio_venta=Decimal("150"),
        stock_minimo=0,
        stock_actual=10
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture
def cliente(db):
    """Create a test client."""
    c = Cliente(nombre="Test Client", rut="12345678-9")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def cotizacion(db, cliente):
    """Create a test quotation with a line."""
    cot = Cotizacion(
        numero=50001,
        cliente_id=cliente.id,
        vendedor_id=1,  # Assuming admin user has id 1
        fecha=date(2026, 5, 1),
        estado="no_definido",
    )
    db.add(cot)
    db.flush()

    # Add a line
    linea = CotizacionLinea(
        cotizacion_id=cot.id,
        orden=1,
        descripcion="Test Item",
        cantidad=1,
        valor_neto=Decimal("150"),
        total_neto=Decimal("150"),
        iva=Decimal("28.5"),
        total=Decimal("178.5"),
    )
    db.add(linea)
    db.commit()
    db.refresh(cot)
    return cot


def test_crear_alerta(client, admin_token, cotizacion):
    """Test creating an alert for a quotation."""
    resp = client.post(
        f"/api/cotizaciones/{cotizacion.id}/alertas",
        json={"contenido": "Follow up with customer"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["contenido"] == "Follow up with customer"
    assert data["cotizacion_id"] == cotizacion.id
    assert data["estado"] == "pendiente"
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


def test_crear_alerta_cotizacion_inexistente(client, admin_token):
    """Test creating an alert for a non-existent quotation."""
    resp = client.post(
        "/api/cotizaciones/9999/alertas",
        json={"contenido": "Test"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404
    assert "no encontrada" in resp.json()["detail"]


def test_listar_alertas(client, admin_token, cotizacion, db):
    """Test listing alerts for a quotation."""
    # Create multiple alerts
    alerta1 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Alert 1")
    alerta2 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Alert 2")
    db.add(alerta1)
    db.add(alerta2)
    db.commit()

    resp = client.get(
        f"/api/cotizaciones/{cotizacion.id}/alertas",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["contenido"] in ["Alert 1", "Alert 2"]


def test_listar_alertas_cotizacion_inexistente(client, admin_token):
    """Test listing alerts for a non-existent quotation."""
    resp = client.get(
        "/api/cotizaciones/9999/alertas",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_actualizar_contenido_alerta(client, admin_token, cotizacion, db):
    """Test updating an alert's content."""
    alerta = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Original content")
    db.add(alerta)
    db.commit()
    db.refresh(alerta)

    resp = client.patch(
        f"/api/cotizaciones/{cotizacion.id}/alertas/{alerta.id}",
        json={"contenido": "Updated content"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["contenido"] == "Updated content"
    assert data["id"] == alerta.id


def test_actualizar_estado_alerta(client, admin_token, cotizacion, db):
    """Test updating an alert's status."""
    alerta = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Test", estado="pendiente")
    db.add(alerta)
    db.commit()
    db.refresh(alerta)

    resp = client.patch(
        f"/api/cotizaciones/{cotizacion.id}/alertas/{alerta.id}",
        json={"estado": "completada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["estado"] == "completada"


def test_actualizar_alerta_estado_invalido(client, admin_token, cotizacion, db):
    """Test updating an alert with an invalid status."""
    alerta = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Test")
    db.add(alerta)
    db.commit()
    db.refresh(alerta)

    resp = client.patch(
        f"/api/cotizaciones/{cotizacion.id}/alertas/{alerta.id}",
        json={"estado": "invalid_state"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422
    # Pydantic validation now provides detailed enum error messages
    error_detail = resp.json()["detail"]
    assert any("pendiente" in str(e) for e in error_detail) or "Input should be" in str(error_detail)


def test_actualizar_alerta_inexistente(client, admin_token, cotizacion):
    """Test updating a non-existent alert."""
    resp = client.patch(
        f"/api/cotizaciones/{cotizacion.id}/alertas/9999",
        json={"contenido": "Test"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404
    assert "no encontrada" in resp.json()["detail"]


def test_eliminar_alerta(client, admin_token, cotizacion, db):
    """Test deleting an alert."""
    alerta = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Test")
    db.add(alerta)
    db.commit()
    alerta_id = alerta.id

    resp = client.delete(
        f"/api/cotizaciones/{cotizacion.id}/alertas/{alerta_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204

    # Verify it's deleted
    deleted = db.query(NotaAlerta).filter(NotaAlerta.id == alerta_id).first()
    assert deleted is None


def test_eliminar_alerta_inexistente(client, admin_token, cotizacion):
    """Test deleting a non-existent alert."""
    resp = client.delete(
        f"/api/cotizaciones/{cotizacion.id}/alertas/9999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_alertas_listadas_en_orden_descendente(client, admin_token, cotizacion, db):
    """Test that alerts are listed in descending order by created_at."""
    import time

    alerta1 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="First")
    db.add(alerta1)
    db.commit()
    time.sleep(0.01)  # Ensure different timestamps

    alerta2 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Second")
    db.add(alerta2)
    db.commit()

    resp = client.get(
        f"/api/cotizaciones/{cotizacion.id}/alertas",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    # Most recent first
    assert data[0]["contenido"] == "Second"
    assert data[1]["contenido"] == "First"


def test_permisos_requeridos_para_ver_alertas(client, cotizacion):
    """Test that alerts require authentication to view."""
    resp = client.get(f"/api/cotizaciones/{cotizacion.id}/alertas")
    assert resp.status_code == 401


def test_permisos_requeridos_para_crear_alerta(client, cotizacion):
    """Test that alerts require authentication to create."""
    resp = client.post(
        f"/api/cotizaciones/{cotizacion.id}/alertas",
        json={"contenido": "Test"}
    )
    assert resp.status_code == 401
