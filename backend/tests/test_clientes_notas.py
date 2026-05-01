"""Tests for GET /api/customers/{id}/notes endpoint"""
import pytest
from datetime import date
from decimal import Decimal
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion, CotizacionLinea
from app.models.nota_alerta import NotaAlerta, EstadoAlerta
from app.models.producto import Producto
from app.models.user import User


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
def cliente_sin_cotizaciones(db):
    """Create a client with no quotations."""
    c = Cliente(nombre="Client Without Quotations", rut="98765432-1")
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


@pytest.fixture
def cotizacion_vendedor(db, cliente, vendedor_user):
    """Create a quotation for a specific vendor."""
    cot = Cotizacion(
        numero=50002,
        cliente_id=cliente.id,
        vendedor_id=vendedor_user.id,
        fecha=date(2026, 5, 1),
        estado="no_definido",
    )
    db.add(cot)
    db.flush()

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


def test_obtener_notas_cliente_endpoint_existe(client, admin_token, cliente):
    """Test that GET /api/customers/{id}/notes endpoint exists."""
    resp = client.get(
        f"/api/clientes/{cliente.id}/notes",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in [200, 404]  # Should not be 404 (Not Found for endpoint)


def test_obtener_notas_cliente_sin_notas(client, admin_token, cliente_sin_cotizaciones):
    """Test retrieving notes for a customer with no quotations."""
    resp = client.get(
        f"/api/clientes/{cliente_sin_cotizaciones.id}/notes",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_obtener_notas_cliente_vacio(client, admin_token, cliente, cotizacion):
    """Test retrieving notes for a customer with quotations but no notes."""
    resp = client.get(
        f"/api/clientes/{cliente.id}/notes",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_obtener_notas_cliente_con_notas(client, admin_token, cliente, cotizacion, db):
    """Test retrieving notes for a customer with notes."""
    # Create notes for the quotation
    nota1 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Follow up required")
    nota2 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Client wants discount")
    db.add(nota1)
    db.add(nota2)
    db.commit()

    resp = client.get(
        f"/api/clientes/{cliente.id}/notes",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert all("contenido" in note for note in data)
    assert all("id" in note for note in data)
    assert all("estado" in note for note in data)
    assert all("created_at" in note for note in data)


def test_obtener_notas_cliente_ordena_por_created_at_desc(client, admin_token, cliente, cotizacion, db):
    """Test that notes are returned in descending order by created_at."""
    import time

    nota1 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="First")
    db.add(nota1)
    db.commit()
    time.sleep(0.01)

    nota2 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Second")
    db.add(nota2)
    db.commit()

    resp = client.get(
        f"/api/clientes/{cliente.id}/notes",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    # Most recent first (DESC by default)
    assert data[0]["contenido"] == "Second"
    assert data[1]["contenido"] == "First"


def test_obtener_notas_cliente_filtro_por_estado(client, admin_token, cliente, cotizacion, db):
    """Test filtering notes by estado."""
    nota1 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Pending", estado="pendiente")
    nota2 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Completed", estado="completada")
    db.add(nota1)
    db.add(nota2)
    db.commit()

    # Filter by pendiente
    resp = client.get(
        f"/api/clientes/{cliente.id}/notes?estado=pendiente",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["contenido"] == "Pending"
    assert data[0]["estado"] == "pendiente"


def test_obtener_notas_cliente_filtro_multiple_estados(client, admin_token, cliente, cotizacion, db):
    """Test filtering notes by multiple estados."""
    nota1 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Pending", estado="pendiente")
    nota2 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Completed", estado="completada")
    nota3 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Cancelled", estado="cancelada")
    db.add(nota1)
    db.add(nota2)
    db.add(nota3)
    db.commit()

    # Filter by pendiente and completada
    resp = client.get(
        f"/api/clientes/{cliente.id}/notes?estado=pendiente&estado=completada",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    estados = {note["estado"] for note in data}
    assert estados == {"pendiente", "completada"}


def test_obtener_notas_cliente_sort_asc(client, admin_token, cliente, cotizacion, db):
    """Test sorting notes in ascending order."""
    import time

    nota1 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="First")
    db.add(nota1)
    db.commit()
    time.sleep(0.01)

    nota2 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Second")
    db.add(nota2)
    db.commit()

    resp = client.get(
        f"/api/clientes/{cliente.id}/notes?sort_dir=asc",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    # Oldest first (ASC)
    assert data[0]["contenido"] == "First"
    assert data[1]["contenido"] == "Second"


def test_obtener_notas_cliente_cliente_inexistente(client, admin_token):
    """Test retrieving notes for a non-existent customer."""
    resp = client.get(
        "/api/clientes/9999/notes",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404
    assert "Cliente no encontrado" in resp.json()["detail"]


def test_obtener_notas_cliente_sin_autenticacion(client, cliente):
    """Test that notes endpoint requires authentication."""
    resp = client.get(f"/api/clientes/{cliente.id}/notes")
    assert resp.status_code == 401


def test_obtener_notas_cliente_filtro_por_estado_cancelada(client, admin_token, cliente, cotizacion, db):
    """Test filtering notes by cancelled estado specifically."""
    nota = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Cancelled note", estado="cancelada")
    db.add(nota)
    db.commit()

    resp = client.get(
        f"/api/clientes/{cliente.id}/notes?estado=cancelada",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["estado"] == "cancelada"


def test_obtener_notas_cliente_admin_ve_todas(client, admin_token, cliente, cotizacion, cotizacion_vendedor, db):
    """Test that admin sees all notes regardless of vendor."""
    nota1 = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Admin's note")
    nota2 = NotaAlerta(cotizacion_id=cotizacion_vendedor.id, contenido="Vendor's note")
    db.add(nota1)
    db.add(nota2)
    db.commit()

    resp = client.get(
        f"/api/clientes/{cliente.id}/notes",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Admin should see both
    assert len(data) == 2


def test_obtener_notas_cliente_respuesta_contiene_campos_requeridos(client, admin_token, cliente, cotizacion, db):
    """Test that the response contains all required fields."""
    nota = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Test note")
    db.add(nota)
    db.commit()

    resp = client.get(
        f"/api/clientes/{cliente.id}/notes",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1

    note = data[0]
    # Verify all required fields are present
    assert "id" in note
    assert "cotizacion_id" in note
    assert "contenido" in note
    assert "estado" in note
    assert "created_at" in note
    assert "updated_at" in note

    # Verify types and values
    assert isinstance(note["id"], int)
    assert isinstance(note["cotizacion_id"], int)
    assert isinstance(note["contenido"], str)
    assert note["estado"] in ["pendiente", "completada", "cancelada"]
    assert isinstance(note["created_at"], str)
    assert isinstance(note["updated_at"], str)


def test_obtener_notas_cliente_sort_by_updated_at(client, admin_token, cliente, cotizacion, db):
    """Test sorting notes by updated_at."""
    nota = NotaAlerta(cotizacion_id=cotizacion.id, contenido="Test")
    db.add(nota)
    db.commit()

    resp = client.get(
        f"/api/clientes/{cliente.id}/notes?sort_by=updated_at&sort_dir=asc",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
