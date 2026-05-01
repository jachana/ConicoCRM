"""Tests for Libros API endpoints"""
import pytest
from datetime import datetime, timezone

from app.models.libro import LibroVentas, LibroCompras
from app.models.empresa import Empresa
from app.models.user import User
from app.core.security import get_password_hash


@pytest.fixture
def empresa1(db, setup_test_db):
    """Create a test empresa"""
    empresa = Empresa(nombre="Empresa Test 1")
    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    return empresa


@pytest.fixture
def empresa2(db, setup_test_db):
    """Create a second test empresa"""
    empresa = Empresa(nombre="Empresa Test 2")
    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    return empresa


@pytest.fixture
def user_empresa1(db, empresa1):
    """Create a user assigned to empresa1"""
    from tests.conftest import TestingSession
    session = TestingSession()
    user = User(
        email="user_empresa1@test.cl",
        name="User Empresa 1",
        hashed_password=get_password_hash("secret123"),
        role="subadmin",
        empresa_id=empresa1.id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    session.close()
    return user


@pytest.fixture
def user_empresa2(db, empresa2):
    """Create a user assigned to empresa2"""
    from tests.conftest import TestingSession
    session = TestingSession()
    user = User(
        email="user_empresa2@test.cl",
        name="User Empresa 2",
        hashed_password=get_password_hash("secret123"),
        role="subadmin",
        empresa_id=empresa2.id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    session.close()
    return user


@pytest.fixture
def token_empresa1(client, user_empresa1):
    """Get auth token for user_empresa1"""
    resp = client.post("/api/auth/login", data={"username": "user_empresa1@test.cl", "password": "secret123"})
    return resp.json()["access_token"]


@pytest.fixture
def token_empresa2(client, user_empresa2):
    """Get auth token for user_empresa2"""
    resp = client.post("/api/auth/login", data={"username": "user_empresa2@test.cl", "password": "secret123"})
    return resp.json()["access_token"]


@pytest.fixture
def sample_libros_ventas(db, setup_test_db, admin_user):
    """Create sample LibroVentas records for admin user's empresa"""
    libros = [
        LibroVentas(
            periodo="2026-01",
            empresa_id=admin_user.empresa_id,
            folio_inicio=1,
            folio_fin=100,
            total_registros=50,
            monto_total=500000,
            estado="borrador",
        ),
        LibroVentas(
            periodo="2026-02",
            empresa_id=admin_user.empresa_id,
            folio_inicio=101,
            folio_fin=200,
            total_registros=75,
            monto_total=750000,
            estado="borrador",
        ),
        LibroVentas(
            periodo="2026-03",
            empresa_id=admin_user.empresa_id,
            folio_inicio=1,
            folio_fin=50,
            total_registros=25,
            monto_total=250000,
            estado="enviado",
        ),
    ]
    db.add_all(libros)
    db.commit()
    return libros


@pytest.fixture
def sample_libros_compras(db, setup_test_db, admin_user, empresa2):
    """Create sample LibroCompras records for admin user's empresa and empresa2"""
    libros = [
        LibroCompras(
            periodo="2026-01",
            empresa_id=admin_user.empresa_id,
            rut_proveedor=None,
            total_registros=30,
            monto_total=300000,
            estado="borrador",
        ),
        LibroCompras(
            periodo="2026-01",
            empresa_id=empresa2.id,
            rut_proveedor="12.345.678-9",
            total_registros=15,
            monto_total=150000,
            estado="enviado",
        ),
        LibroCompras(
            periodo="2026-02",
            empresa_id=admin_user.empresa_id,
            rut_proveedor="12.345.678-9",
            total_registros=40,
            monto_total=400000,
            estado="borrador",
        ),
    ]
    db.add_all(libros)
    db.commit()
    return libros


class TestLibrosAuthorizationVentas:
    """Tests for authorization checks on Libros de Ventas endpoints"""

    def test_get_libro_ventas_forbidden_different_empresa(self, client, token_empresa1, token_empresa2, db, empresa1, empresa2):
        """Test that user from empresa2 cannot access libro from empresa1"""
        # Create libro for empresa1
        libro = LibroVentas(
            periodo="2026-01",
            empresa_id=empresa1.id,
            folio_inicio=1,
            folio_fin=100,
            total_registros=50,
            monto_total=500000,
            estado="borrador",
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)

        # Try to access with token from empresa2 user
        response = client.get(
            f"/api/libros/ventas/{libro.id}",
            headers={"Authorization": f"Bearer {token_empresa2}"}
        )
        assert response.status_code == 403
        assert "Not authorized" in response.json()["detail"]

    def test_list_libros_ventas_filtered_by_empresa(self, client, token_empresa1, token_empresa2, db, empresa1, empresa2):
        """Test that list endpoint filters libros by user's empresa"""
        # Create libros for both empresas
        libro_e1 = LibroVentas(
            periodo="2026-01",
            empresa_id=empresa1.id,
            folio_inicio=1,
            folio_fin=100,
            total_registros=50,
            monto_total=500000,
            estado="borrador",
        )
        libro_e2 = LibroVentas(
            periodo="2026-01",
            empresa_id=empresa2.id,
            folio_inicio=1,
            folio_fin=50,
            total_registros=25,
            monto_total=250000,
            estado="borrador",
        )
        db.add_all([libro_e1, libro_e2])
        db.commit()

        # empresa1 user should see only empresa1 libro
        response = client.get(
            "/api/libros/ventas",
            headers={"Authorization": f"Bearer {token_empresa1}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 1
        assert data["data"][0]["empresa_id"] == empresa1.id

        # empresa2 user should see only empresa2 libro
        response = client.get(
            "/api/libros/ventas",
            headers={"Authorization": f"Bearer {token_empresa2}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 1
        assert data["data"][0]["empresa_id"] == empresa2.id

    def test_get_libro_ventas_allowed_same_empresa(self, client, token_empresa1, db, empresa1):
        """Test that user can access libro from their own empresa"""
        # Create libro for empresa1
        libro = LibroVentas(
            periodo="2026-01",
            empresa_id=empresa1.id,
            folio_inicio=1,
            folio_fin=100,
            total_registros=50,
            monto_total=500000,
            estado="borrador",
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)

        # Access with token from empresa1 user should succeed
        response = client.get(
            f"/api/libros/ventas/{libro.id}",
            headers={"Authorization": f"Bearer {token_empresa1}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == libro.id
        assert data["empresa_id"] == empresa1.id


class TestLibrosAuthorizationCompras:
    """Tests for authorization checks on Libros de Compras endpoints"""

    def test_get_libro_compras_forbidden_different_empresa(self, client, token_empresa1, token_empresa2, db, empresa1, empresa2):
        """Test that user from empresa2 cannot access libro from empresa1"""
        # Create libro for empresa1
        libro = LibroCompras(
            periodo="2026-01",
            empresa_id=empresa1.id,
            rut_proveedor=None,
            total_registros=30,
            monto_total=300000,
            estado="borrador",
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)

        # Try to access with token from empresa2 user
        response = client.get(
            f"/api/libros/compras/{libro.id}",
            headers={"Authorization": f"Bearer {token_empresa2}"}
        )
        assert response.status_code == 403
        assert "Not authorized" in response.json()["detail"]

    def test_list_libros_compras_filtered_by_empresa(self, client, token_empresa1, token_empresa2, db, empresa1, empresa2):
        """Test that list endpoint filters libros by user's empresa"""
        # Create libros for both empresas
        libro_e1 = LibroCompras(
            periodo="2026-01",
            empresa_id=empresa1.id,
            rut_proveedor=None,
            total_registros=30,
            monto_total=300000,
            estado="borrador",
        )
        libro_e2 = LibroCompras(
            periodo="2026-01",
            empresa_id=empresa2.id,
            rut_proveedor=None,
            total_registros=15,
            monto_total=150000,
            estado="borrador",
        )
        db.add_all([libro_e1, libro_e2])
        db.commit()

        # empresa1 user should see only empresa1 libro
        response = client.get(
            "/api/libros/compras",
            headers={"Authorization": f"Bearer {token_empresa1}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 1
        assert data["data"][0]["empresa_id"] == empresa1.id

        # empresa2 user should see only empresa2 libro
        response = client.get(
            "/api/libros/compras",
            headers={"Authorization": f"Bearer {token_empresa2}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 1
        assert data["data"][0]["empresa_id"] == empresa2.id

    def test_get_libro_compras_allowed_same_empresa(self, client, token_empresa1, db, empresa1):
        """Test that user can access libro from their own empresa"""
        # Create libro for empresa1
        libro = LibroCompras(
            periodo="2026-01",
            empresa_id=empresa1.id,
            rut_proveedor=None,
            total_registros=30,
            monto_total=300000,
            estado="borrador",
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)

        # Access with token from empresa1 user should succeed
        response = client.get(
            f"/api/libros/compras/{libro.id}",
            headers={"Authorization": f"Bearer {token_empresa1}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == libro.id
        assert data["empresa_id"] == empresa1.id


class TestLibrosVentasList:
    """Tests for GET /api/libros/ventas"""

    def test_list_libros_ventas_without_auth(self, client):
        """Test that endpoint requires authentication"""
        response = client.get("/api/libros/ventas")
        assert response.status_code == 401

    def test_list_libros_ventas_success(self, client, admin_token, sample_libros_ventas):
        """Test successful listing of libros ventas"""
        response = client.get(
            "/api/libros/ventas",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "pagination" in data
        assert len(data["data"]) == 3
        assert data["pagination"]["total"] == 3
        assert data["pagination"]["limit"] == 50
        assert data["pagination"]["offset"] == 0

    def test_list_libros_ventas_with_periodo_filter(self, client, admin_token, sample_libros_ventas):
        """Test filtering libros ventas by periodo"""
        response = client.get(
            "/api/libros/ventas",
            params={"periodo": "2026-01"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["pagination"]["total"] == 1
        assert data["data"][0]["periodo"] == "2026-01"

    def test_list_libros_ventas_with_pagination(self, client, admin_token, sample_libros_ventas):
        """Test pagination parameters"""
        response = client.get(
            "/api/libros/ventas",
            params={"limit": 1, "offset": 0},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 1
        assert data["pagination"]["limit"] == 1
        assert data["pagination"]["offset"] == 0
        assert data["pagination"]["total"] == 3

    def test_list_libros_ventas_pagination_offset(self, client, admin_token, sample_libros_ventas):
        """Test pagination offset"""
        response = client.get(
            "/api/libros/ventas",
            params={"limit": 2, "offset": 1},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 2
        assert data["pagination"]["offset"] == 1

    def test_list_libros_ventas_invalid_periodo_format(self, client, admin_token):
        """Test invalid periodo format returns 400"""
        response = client.get(
            "/api/libros/ventas",
            params={"periodo": "2026/01"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400
        assert "YYYY-MM" in response.json()["detail"]

    def test_list_libros_ventas_invalid_limit(self, client, admin_token):
        """Test invalid limit (zero) returns 422"""
        response = client.get(
            "/api/libros/ventas",
            params={"limit": 0},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 422

    def test_list_libros_ventas_invalid_offset(self, client, admin_token):
        """Test invalid offset (negative) returns 422"""
        response = client.get(
            "/api/libros/ventas",
            params={"offset": -1},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 422

    def test_list_libros_ventas_empty_result(self, client, admin_token):
        """Test listing when no libros exist"""
        response = client.get(
            "/api/libros/ventas",
            params={"periodo": "2099-12"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 0
        assert data["pagination"]["total"] == 0

    def test_list_libros_ventas_max_limit(self, client, admin_token, sample_libros_ventas):
        """Test that limit is capped at 500"""
        response = client.get(
            "/api/libros/ventas",
            params={"limit": 500},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["pagination"]["limit"] == 500

    def test_list_libros_ventas_limit_over_max(self, client, admin_token):
        """Test that limit > 500 returns 422"""
        response = client.get(
            "/api/libros/ventas",
            params={"limit": 501},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 422


class TestLibrosVentasDetail:
    """Tests for GET /api/libros/ventas/{id}"""

    def test_get_libro_ventas_success(self, client, admin_token, sample_libros_ventas):
        """Test retrieving a specific libro ventas"""
        libro_id = sample_libros_ventas[0].id
        response = client.get(
            f"/api/libros/ventas/{libro_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == libro_id
        assert data["periodo"] == "2026-01"
        assert data["empresa_id"] == 1
        assert data["total_registros"] == 50

    def test_get_libro_ventas_not_found(self, client, admin_token):
        """Test 404 when libro doesn't exist"""
        response = client.get(
            "/api/libros/ventas/9999",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_libro_ventas_without_auth(self, client, sample_libros_ventas):
        """Test that endpoint requires authentication"""
        libro_id = sample_libros_ventas[0].id
        response = client.get(f"/api/libros/ventas/{libro_id}")
        assert response.status_code == 401

    def test_get_libro_ventas_response_format(self, client, admin_token, sample_libros_ventas):
        """Test response has all required fields"""
        libro_id = sample_libros_ventas[0].id
        response = client.get(
            f"/api/libros/ventas/{libro_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "periodo" in data
        assert "empresa_id" in data
        assert "folio_inicio" in data
        assert "folio_fin" in data
        assert "total_registros" in data
        assert "monto_total" in data
        assert "estado" in data
        assert "created_at" in data


class TestLibrosComprasList:
    """Tests for GET /api/libros/compras"""

    def test_list_libros_compras_without_auth(self, client):
        """Test that endpoint requires authentication"""
        response = client.get("/api/libros/compras")
        assert response.status_code == 401

    def test_list_libros_compras_success(self, client, admin_token, sample_libros_compras):
        """Test successful listing of libros compras"""
        response = client.get(
            "/api/libros/compras",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "pagination" in data
        # Admin user should see only their empresa's records (2 out of 3 total)
        assert len(data["data"]) == 2
        assert data["pagination"]["total"] == 2

    def test_list_libros_compras_with_periodo_filter(self, client, admin_token, sample_libros_compras):
        """Test filtering libros compras by periodo"""
        response = client.get(
            "/api/libros/compras",
            params={"periodo": "2026-01"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Admin user should see only their empresa's record for 2026-01 (the other is from empresa2)
        assert data["pagination"]["total"] == 1
        assert all(item["periodo"] == "2026-01" for item in data["data"])

    def test_list_libros_compras_with_pagination(self, client, admin_token, sample_libros_compras):
        """Test pagination for libros compras"""
        response = client.get(
            "/api/libros/compras",
            params={"limit": 2, "offset": 0},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 2
        # Admin user sees 2 total records from their empresa
        assert data["pagination"]["total"] == 2

    def test_list_libros_compras_invalid_periodo_format(self, client, admin_token):
        """Test invalid periodo format returns 400"""
        response = client.get(
            "/api/libros/compras",
            params={"periodo": "invalid"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400
        assert "YYYY-MM" in response.json()["detail"]

    def test_list_libros_compras_empty_result(self, client, admin_token):
        """Test listing when no libros exist"""
        response = client.get(
            "/api/libros/compras",
            params={"periodo": "2099-12"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 0
        assert data["pagination"]["total"] == 0


class TestLibrosComprasDetail:
    """Tests for GET /api/libros/compras/{id}"""

    def test_get_libro_compras_success(self, client, admin_token, sample_libros_compras):
        """Test retrieving a specific libro compras"""
        libro_id = sample_libros_compras[0].id
        response = client.get(
            f"/api/libros/compras/{libro_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == libro_id
        assert data["periodo"] == "2026-01"
        assert data["empresa_id"] == 1
        assert data["total_registros"] == 30

    def test_get_libro_compras_not_found(self, client, admin_token):
        """Test 404 when libro doesn't exist"""
        response = client.get(
            "/api/libros/compras/9999",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404

    def test_get_libro_compras_without_auth(self, client, sample_libros_compras):
        """Test that endpoint requires authentication"""
        libro_id = sample_libros_compras[0].id
        response = client.get(f"/api/libros/compras/{libro_id}")
        assert response.status_code == 401

    def test_get_libro_compras_response_format(self, client, admin_token, sample_libros_compras):
        """Test response has all required fields"""
        libro_id = sample_libros_compras[0].id
        response = client.get(
            f"/api/libros/compras/{libro_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "periodo" in data
        assert "empresa_id" in data
        assert "rut_proveedor" in data
        assert "total_registros" in data
        assert "monto_total" in data
        assert "estado" in data
        assert "created_at" in data


class TestPaginationEdgeCases:
    """Tests for edge cases in pagination"""

    def test_pagination_boundary_offset_equals_total(self, client, admin_token, sample_libros_ventas):
        """Test offset equal to total returns empty list"""
        response = client.get(
            "/api/libros/ventas",
            params={"offset": 3, "limit": 50},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 0
        assert data["pagination"]["total"] == 3

    def test_pagination_boundary_offset_greater_than_total(self, client, admin_token, sample_libros_ventas):
        """Test offset > total returns empty list"""
        response = client.get(
            "/api/libros/ventas",
            params={"offset": 100, "limit": 50},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 0
        assert data["pagination"]["total"] == 3

    def test_pagination_large_limit(self, client, admin_token, sample_libros_ventas):
        """Test very large limit returns 422"""
        response = client.get(
            "/api/libros/ventas",
            params={"limit": 1000},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 422


class TestPeriodoValidation:
    """Tests for periodo format validation"""

    def test_periodo_valid_formats(self, client, admin_token):
        """Test valid periodo formats"""
        valid_periodos = ["2026-01", "2025-12", "2020-05"]
        for periodo in valid_periodos:
            response = client.get(
                "/api/libros/ventas",
                params={"periodo": periodo},
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            assert response.status_code == 200

    def test_periodo_invalid_formats(self, client, admin_token):
        """Test invalid periodo formats"""
        invalid_periodos = ["2026/01", "2026-1", "202601", "01-2026", "2026"]
        for periodo in invalid_periodos:
            response = client.get(
                "/api/libros/ventas",
                params={"periodo": periodo},
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            assert response.status_code == 400

    def test_periodo_with_leading_zeros(self, client, admin_token, db):
        """Test periodo with leading zeros in month"""
        libro = LibroVentas(
            periodo="2026-05",
            empresa_id=1,
            total_registros=10,
            monto_total=100000,
            estado="borrador",
        )
        db.add(libro)
        db.commit()

        response = client.get(
            "/api/libros/ventas",
            params={"periodo": "2026-05"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert len(response.json()["data"]) == 1
