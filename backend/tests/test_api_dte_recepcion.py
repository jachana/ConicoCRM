"""Tests for DTE Recepción API endpoints"""
import pytest
from datetime import datetime, timezone

from app.models.libro import DteRecepcion
from app.models.empresa import Empresa
from app.models.user import User
from app.core.security import get_password_hash
from app.core.modulos import OPTIONAL_MODULES


@pytest.fixture
def empresa1(db, setup_test_db):
    """Create a test empresa"""
    empresa = Empresa(
        nombre="Empresa Test 1",
        modulos_enabled={slug: True for slug in OPTIONAL_MODULES},
    )
    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    return empresa


@pytest.fixture
def empresa2(db, setup_test_db):
    """Create a second test empresa"""
    empresa = Empresa(
        nombre="Empresa Test 2",
        modulos_enabled={slug: True for slug in OPTIONAL_MODULES},
    )
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
        email="dte_user1@test.cl",
        name="DTE User 1",
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
        email="dte_user2@test.cl",
        name="DTE User 2",
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
    resp = client.post("/api/auth/login", data={"username": "dte_user1@test.cl", "password": "secret123"})
    return resp.json()["access_token"]


@pytest.fixture
def token_empresa2(client, user_empresa2):
    """Get auth token for user_empresa2"""
    resp = client.post("/api/auth/login", data={"username": "dte_user2@test.cl", "password": "secret123"})
    return resp.json()["access_token"]


@pytest.fixture
def sample_dte_recepciones(db, setup_test_db, user_empresa1):
    """Create sample DteRecepcion records for user_empresa1"""
    recepciones = [
        DteRecepcion(
            empresa_id=user_empresa1.empresa_id,
            tipo="46",
            folio=1000,
            rut_emisor="76123456-7",
            monto=500000,
            xml_raw="<test>xml</test>",
            estado="recibido",
        ),
        DteRecepcion(
            empresa_id=user_empresa1.empresa_id,
            tipo="46",
            folio=1001,
            rut_emisor="76111111-1",
            monto=250000,
            estado="recibido",
        ),
        DteRecepcion(
            empresa_id=user_empresa1.empresa_id,
            tipo="46",
            folio=1002,
            rut_emisor="76123456-7",
            monto=750000,
            estado="aceptado",
        ),
    ]
    for rec in recepciones:
        db.add(rec)
    db.commit()
    for rec in recepciones:
        db.refresh(rec)
    return recepciones


# ── POST /dte/recepcion ────────────────────────────────────────

class TestCrearDteRecepcion:
    """Tests for creating DTE recepción records"""

    def test_crear_dte_recepcion_success(self, client, token_empresa1, user_empresa1):
        """Test successful DTE recepción creation"""
        resp = client.post(
            "/api/dte_recepcion",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={
                "tipo": "46",
                "folio": 2000,
                "rut_emisor": "76999999-9",
                "monto": 1000000,
                "xml_raw": "<dte>test</dte>",
                "empresa_id": user_empresa1.empresa_id,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["tipo"] == "46"
        assert data["folio"] == 2000
        assert data["rut_emisor"] == "76999999-9"
        assert data["monto"] == 1000000
        assert data["xml_raw"] == "<dte>test</dte>"
        assert data["estado"] == "recibido"
        assert data["respuesta_sii"] is None
        assert data["rechazo_motivo"] is None

    def test_crear_dte_recepcion_sin_xml(self, client, token_empresa1, user_empresa1):
        """Test DTE recepción creation without xml_raw"""
        resp = client.post(
            "/api/dte_recepcion",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={
                "tipo": "46",
                "folio": 2001,
                "rut_emisor": "76888888-8",
                "monto": 500000,
                "empresa_id": user_empresa1.empresa_id,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["estado"] == "recibido"
        assert data["xml_raw"] is None

    def test_crear_dte_recepcion_empresa_mismatch(self, client, token_empresa1, user_empresa1, empresa2):
        """Test that user cannot create DTE for different empresa"""
        resp = client.post(
            "/api/dte_recepcion",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={
                "tipo": "46",
                "folio": 2002,
                "rut_emisor": "76777777-7",
                "monto": 300000,
                "empresa_id": empresa2.id,
            },
        )
        assert resp.status_code == 403
        assert "different empresa" in resp.json()["detail"]

    def test_crear_dte_recepcion_missing_required_fields(self, client, token_empresa1, user_empresa1):
        """Test DTE creation with missing required fields"""
        resp = client.post(
            "/api/dte_recepcion",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={
                "tipo": "46",
                # Missing folio
                "rut_emisor": "76666666-6",
                "monto": 200000,
                "empresa_id": user_empresa1.empresa_id,
            },
        )
        assert resp.status_code == 422

    def test_crear_dte_recepcion_unauthorized(self, client, user_empresa1):
        """Test DTE creation without authorization"""
        resp = client.post(
            "/api/dte_recepcion",
            json={
                "tipo": "46",
                "folio": 2003,
                "rut_emisor": "76555555-5",
                "monto": 400000,
                "empresa_id": user_empresa1.empresa_id,
            },
        )
        assert resp.status_code == 401


# ── GET /dte/recepcion ────────────────────────────────────────

class TestListarDteRecepciones:
    """Tests for listing DTE recepción records"""

    def test_listar_dte_recepciones_sin_filtro(self, client, token_empresa1, sample_dte_recepciones):
        """Test listing all DTE recepciones for empresa"""
        resp = client.get(
            "/api/dte_recepcion",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "pagination" in data
        assert len(data["data"]) == 3
        assert data["pagination"]["total"] == 3
        assert data["pagination"]["limit"] == 50
        assert data["pagination"]["offset"] == 0

    def test_listar_dte_recepciones_con_pagination(self, client, token_empresa1, sample_dte_recepciones):
        """Test pagination in listing"""
        resp = client.get(
            "/api/dte_recepcion?limit=2&offset=0",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) == 2
        assert data["pagination"]["total"] == 3

    def test_listar_dte_recepciones_offset(self, client, token_empresa1, sample_dte_recepciones):
        """Test offset in pagination"""
        resp = client.get(
            "/api/dte_recepcion?limit=2&offset=2",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) == 1

    def test_listar_dte_recepciones_filter_estado_recibido(self, client, token_empresa1, sample_dte_recepciones):
        """Test filtering by estado=recibido"""
        resp = client.get(
            "/api/dte_recepcion?estado=recibido",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) == 2
        assert all(item["estado"] == "recibido" for item in data["data"])

    def test_listar_dte_recepciones_filter_estado_aceptado(self, client, token_empresa1, sample_dte_recepciones):
        """Test filtering by estado=aceptado"""
        resp = client.get(
            "/api/dte_recepcion?estado=aceptado",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) == 1
        assert data["data"][0]["estado"] == "aceptado"

    def test_listar_dte_recepciones_filter_rut_emisor(self, client, token_empresa1, sample_dte_recepciones):
        """Test filtering by rut_emisor"""
        resp = client.get(
            "/api/dte_recepcion?rut_emisor=76123456-7",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) == 2
        assert all(item["rut_emisor"] == "76123456-7" for item in data["data"])

    def test_listar_dte_recepciones_filter_rut_y_estado(self, client, token_empresa1, sample_dte_recepciones):
        """Test filtering by both rut_emisor and estado"""
        resp = client.get(
            "/api/dte_recepcion?rut_emisor=76123456-7&estado=aceptado",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) == 1
        assert data["data"][0]["rut_emisor"] == "76123456-7"
        assert data["data"][0]["estado"] == "aceptado"

    def test_listar_dte_recepciones_invalid_estado(self, client, token_empresa1):
        """Test invalid estado filter"""
        resp = client.get(
            "/api/dte_recepcion?estado=invalido",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 400
        assert "estado must be one of" in resp.json()["detail"]

    def test_listar_dte_recepciones_limit_exceeded(self, client, token_empresa1):
        """Test limit exceeding max"""
        resp = client.get(
            "/api/dte_recepcion?limit=600",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        # FastAPI's Query validation returns 422 for invalid constraints
        assert resp.status_code == 422

    def test_listar_dte_recepciones_negative_offset(self, client, token_empresa1):
        """Test negative offset"""
        resp = client.get(
            "/api/dte_recepcion?offset=-1",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        # FastAPI's Query validation returns 422 for invalid constraints
        assert resp.status_code == 422

    def test_listar_dte_recepciones_empresa_isolation(self, client, token_empresa1, token_empresa2, sample_dte_recepciones, user_empresa2):
        """Test that users only see their own empresa's DTEs"""
        # Create a DTE for empresa2
        from tests.conftest import TestingSession
        session = TestingSession()
        dte2 = DteRecepcion(
            empresa_id=user_empresa2.empresa_id,
            tipo="46",
            folio=5000,
            rut_emisor="76444444-4",
            monto=100000,
            estado="recibido",
        )
        session.add(dte2)
        session.commit()
        session.close()

        # User 1 should only see their own DTEs
        resp = client.get(
            "/api/dte_recepcion",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) == 3

        # User 2 should only see their own DTE
        resp = client.get(
            "/api/dte_recepcion",
            headers={"Authorization": f"Bearer {token_empresa2}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) == 1

    def test_listar_dte_recepciones_unauthorized(self, client):
        """Test listing without authorization"""
        resp = client.get("/api/dte_recepcion")
        assert resp.status_code == 401


# ── GET /dte/recepcion/{id} ───────────────────────────

class TestObtenerDteRecepcion:
    """Tests for getting a single DTE recepción record"""

    def test_obtener_dte_recepcion_success(self, client, token_empresa1, sample_dte_recepciones):
        """Test successful retrieval of a DTE recepción"""
        dte = sample_dte_recepciones[0]
        dte_id = dte.id

        resp = client.get(
            f"/api/dte_recepcion/{dte_id}",
            headers={"Authorization": f"Bearer {token_empresa1}"}
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == dte_id
        assert data["tipo"] == dte.tipo
        assert data["folio"] == dte.folio
        assert data["estado"] == "recibido"

    def test_obtener_dte_recepcion_no_existe(self, client, token_empresa1):
        """Test retrieval of non-existent DTE recepción"""
        resp = client.get(
            "/api/dte_recepcion/99999",
            headers={"Authorization": f"Bearer {token_empresa1}"}
        )

        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_obtener_dte_recepcion_unauthorized_empresa(self, client, token_empresa1, sample_dte_recepciones, token_empresa2):
        """Test that users cannot access DTEs from other empresas"""
        dte_id = sample_dte_recepciones[0].id

        # Try to access with token_empresa2 (different empresa)
        resp = client.get(
            f"/api/dte_recepcion/{dte_id}",
            headers={"Authorization": f"Bearer {token_empresa2}"}
        )

        assert resp.status_code == 403
        assert "not authorized" in resp.json()["detail"].lower()

    def test_obtener_dte_recepcion_with_respuesta_sii(self, client, token_empresa1, db, empresa1):
        """Test retrieval of DTE with respuesta_sii"""
        dte = DteRecepcion(
            empresa_id=empresa1.id,
            tipo="46",
            folio=54321,
            rut_emisor="99.999.999-9",
            monto=2500000,
            estado="aceptado",
            respuesta_sii={"estado": "aceptado", "timestamp": "2026-04-01T10:35:00Z"}
        )
        db.add(dte)
        db.commit()
        db.refresh(dte)

        resp = client.get(
            f"/api/dte_recepcion/{dte.id}",
            headers={"Authorization": f"Bearer {token_empresa1}"}
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["estado"] == "aceptado"
        assert data["respuesta_sii"]["estado"] == "aceptado"

    def test_obtener_dte_recepcion_unauthorized(self, client):
        """Test retrieval without authorization"""
        resp = client.get("/api/dte_recepcion/1")
        assert resp.status_code == 401


# ── POST /dte/recepcion/{id}/aceptar ───────────────────────────

class TestAceptarDteRecepcion:
    """Tests for accepting DTE recepción records"""

    def test_aceptar_dte_recepcion_success(self, client, token_empresa1, sample_dte_recepciones):
        """Test successful acceptance of DTE"""
        dte_id = sample_dte_recepciones[0].id

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/aceptar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == dte_id
        assert data["estado"] == "aceptado"
        assert data["respuesta_sii"] is not None
        assert data["respuesta_sii"]["estado"] == "aceptado"
        assert "timestamp" in data["respuesta_sii"]

    def test_aceptar_dte_recepcion_no_existe(self, client, token_empresa1):
        """Test accepting non-existent DTE"""
        resp = client.post(
            "/api/dte_recepcion/999999/aceptar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"]

    def test_aceptar_dte_recepcion_unauthorized_empresa(self, client, token_empresa1, token_empresa2, sample_dte_recepciones, user_empresa2):
        """Test accepting DTE from different empresa"""
        dte_id = sample_dte_recepciones[0].id

        # Create a token for user_empresa2
        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/aceptar",
            headers={"Authorization": f"Bearer {token_empresa2}"},
        )
        assert resp.status_code == 403
        assert "Not authorized" in resp.json()["detail"]

    def test_aceptar_dte_recepcion_ya_aceptado(self, client, token_empresa1, sample_dte_recepciones):
        """Test accepting already accepted DTE"""
        dte_id = sample_dte_recepciones[2].id  # Already in aceptado estado

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/aceptar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 400
        assert "Cannot aceptar DTE in estado 'aceptado'" in resp.json()["detail"]

    def test_aceptar_dte_recepcion_ya_rechazado(self, client, token_empresa1, user_empresa1):
        """Test accepting already rejected DTE"""
        from tests.conftest import TestingSession
        session = TestingSession()
        dte = DteRecepcion(
            empresa_id=user_empresa1.empresa_id,
            tipo="46",
            folio=3000,
            rut_emisor="76333333-3",
            monto=600000,
            estado="rechazado",
            rechazo_motivo="Test rechazo",
        )
        session.add(dte)
        session.commit()
        session.refresh(dte)
        dte_id = dte.id
        session.close()

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/aceptar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        assert resp.status_code == 400
        assert "Cannot aceptar DTE in estado 'rechazado'" in resp.json()["detail"]

    def test_aceptar_dte_recepcion_unauthorized(self, client, sample_dte_recepciones):
        """Test accepting DTE without authorization"""
        dte_id = sample_dte_recepciones[0].id

        resp = client.post(f"/api/dte_recepcion/{dte_id}/aceptar")
        assert resp.status_code == 401


# ── POST /dte/recepcion/{id}/rechazar ──────────────────────────

class TestRechazarDteRecepcion:
    """Tests for rejecting DTE recepción records"""

    def test_rechazar_dte_recepcion_success(self, client, token_empresa1, sample_dte_recepciones):
        """Test successful rejection of DTE"""
        dte_id = sample_dte_recepciones[0].id

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/rechazar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={"motivo": "Documento duplicado"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == dte_id
        assert data["estado"] == "rechazado"
        assert data["rechazo_motivo"] == "Documento duplicado"

    def test_rechazar_dte_recepcion_no_existe(self, client, token_empresa1):
        """Test rejecting non-existent DTE"""
        resp = client.post(
            "/api/dte_recepcion/999999/rechazar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={"motivo": "No existe"},
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"]

    def test_rechazar_dte_recepcion_sin_motivo(self, client, token_empresa1, sample_dte_recepciones):
        """Test rejecting without motivo"""
        dte_id = sample_dte_recepciones[0].id

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/rechazar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={"motivo": ""},
        )
        assert resp.status_code == 422  # Validation error due to min_length=1

    def test_rechazar_dte_recepcion_motivo_missing(self, client, token_empresa1, sample_dte_recepciones):
        """Test rejecting without motivo field"""
        dte_id = sample_dte_recepciones[0].id

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/rechazar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={},
        )
        assert resp.status_code == 422

    def test_rechazar_dte_recepcion_unauthorized_empresa(self, client, token_empresa2, sample_dte_recepciones):
        """Test rejecting DTE from different empresa"""
        dte_id = sample_dte_recepciones[0].id

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/rechazar",
            headers={"Authorization": f"Bearer {token_empresa2}"},
            json={"motivo": "No autorizado"},
        )
        assert resp.status_code == 403
        assert "Not authorized" in resp.json()["detail"]

    def test_rechazar_dte_recepcion_ya_aceptado(self, client, token_empresa1, sample_dte_recepciones):
        """Test rejecting already accepted DTE"""
        dte_id = sample_dte_recepciones[2].id  # Already in aceptado estado

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/rechazar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={"motivo": "No puedo rechazar"},
        )
        assert resp.status_code == 400
        assert "Cannot rechazar DTE in estado 'aceptado'" in resp.json()["detail"]

    def test_rechazar_dte_recepcion_ya_rechazado(self, client, token_empresa1, user_empresa1):
        """Test rejecting already rejected DTE"""
        from tests.conftest import TestingSession
        session = TestingSession()
        dte = DteRecepcion(
            empresa_id=user_empresa1.empresa_id,
            tipo="46",
            folio=4000,
            rut_emisor="76222222-2",
            monto=700000,
            estado="rechazado",
            rechazo_motivo="Ya rechazado",
        )
        session.add(dte)
        session.commit()
        session.refresh(dte)
        dte_id = dte.id
        session.close()

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/rechazar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={"motivo": "Intento doble"},
        )
        assert resp.status_code == 400
        assert "Cannot rechazar DTE in estado 'rechazado'" in resp.json()["detail"]

    def test_rechazar_dte_recepcion_unauthorized(self, client, sample_dte_recepciones):
        """Test rejecting DTE without authorization"""
        dte_id = sample_dte_recepciones[0].id

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/rechazar",
            json={"motivo": "No autorizado"},
        )
        assert resp.status_code == 401


# ── Permission tests ───────────────────────────────────────────

class TestDteRecepcionPermissions:
    """Tests for permission checks"""

    def test_crear_dte_requiere_create_permission(self, client, user_empresa1):
        """Test that create requires dte_recepcion:create permission"""
        # Should pass for subadmin (has create=True)
        resp = client.post(
            "/api/auth/login",
            data={"username": user_empresa1.email, "password": "secret123"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        resp = client.post(
            "/api/dte_recepcion",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "tipo": "46",
                "folio": 5001,
                "rut_emisor": "76111111-0",
                "monto": 900000,
                "empresa_id": user_empresa1.empresa_id,
            },
        )
        assert resp.status_code == 200

    def test_listar_dte_requiere_view_permission(self, client, user_empresa1):
        """Test that list requires dte_recepcion:view permission"""
        resp = client.post(
            "/api/auth/login",
            data={"username": user_empresa1.email, "password": "secret123"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        resp = client.get(
            "/api/dte_recepcion",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_aceptar_dte_requiere_edit_permission(self, client, token_empresa1, sample_dte_recepciones):
        """Test that aceptar requires dte_recepcion:edit permission"""
        dte_id = sample_dte_recepciones[0].id

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/aceptar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
        )
        # Should succeed since subadmin has edit=True
        assert resp.status_code == 200

    def test_rechazar_dte_requiere_edit_permission(self, client, token_empresa1, sample_dte_recepciones):
        """Test that rechazar requires dte_recepcion:edit permission"""
        dte_id = sample_dte_recepciones[0].id

        resp = client.post(
            f"/api/dte_recepcion/{dte_id}/rechazar",
            headers={"Authorization": f"Bearer {token_empresa1}"},
            json={"motivo": "Prueba"},
        )
        # Should succeed since subadmin has edit=True
        assert resp.status_code == 200
