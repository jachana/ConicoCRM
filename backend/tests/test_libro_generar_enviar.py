"""Tests for generar/enviar libro endpoints (POST /api/libros/ventas|compras/generar|enviar)"""
from unittest.mock import patch

import pytest

from app.models.libro import LibroVentas, LibroCompras
from app.models.empresa import Empresa
from app.models.user import User
from app.core.security import get_password_hash


@pytest.fixture
def empresa_extra(db, setup_test_db):
    e = Empresa(nombre="Empresa Extra")
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@pytest.fixture
def user_extra(db, empresa_extra):
    from tests.conftest import TestingSession
    session = TestingSession()
    u = User(
        email="extra@test.cl",
        name="Extra User",
        hashed_password=get_password_hash("secret123"),
        role="subadmin",
        empresa_id=empresa_extra.id,
    )
    session.add(u)
    session.commit()
    session.refresh(u)
    session.close()
    return u


@pytest.fixture
def token_extra(client, user_extra):
    resp = client.post("/api/auth/login", data={"username": "extra@test.cl", "password": "secret123"})
    return resp.json()["access_token"]


class TestLibrosGenerar:
    def test_generar_ventas_requires_auth(self, client):
        response = client.post("/api/libros/ventas/generar", json={"periodo": "2026-01"})
        assert response.status_code == 401

    def test_generar_compras_requires_auth(self, client):
        response = client.post("/api/libros/compras/generar", json={"periodo": "2026-01"})
        assert response.status_code == 401

    def test_generar_ventas_creates_libro(self, client, admin_token):
        response = client.post(
            "/api/libros/ventas/generar",
            json={"periodo": "2026-01"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["periodo"] == "2026-01"
        assert data["estado"] == "borrador"
        assert "id" in data

    def test_generar_ventas_idempotent(self, client, admin_token):
        r1 = client.post(
            "/api/libros/ventas/generar",
            json={"periodo": "2026-02"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        r2 = client.post(
            "/api/libros/ventas/generar",
            json={"periodo": "2026-02"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["id"] == r2.json()["id"]

    def test_generar_compras_creates_libro(self, client, admin_token):
        response = client.post(
            "/api/libros/compras/generar",
            json={"periodo": "2026-01"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["periodo"] == "2026-01"
        assert data["estado"] == "borrador"

    def test_generar_ventas_invalid_periodo(self, client, admin_token):
        response = client.post(
            "/api/libros/ventas/generar",
            json={"periodo": "not-valid"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 400

    def test_generar_compras_invalid_periodo(self, client, admin_token):
        response = client.post(
            "/api/libros/compras/generar",
            json={"periodo": "26-1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 400


class TestLibrosEnviar:
    def test_enviar_ventas_requires_auth(self, client, db, admin_user):
        libro = LibroVentas(
            periodo="2026-01", empresa_id=admin_user.empresa_id,
            total_registros=0, monto_total=0,
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)
        response = client.post(f"/api/libros/ventas/{libro.id}/enviar")
        assert response.status_code == 401

    def test_enviar_ventas_not_found(self, client, admin_token):
        response = client.post(
            "/api/libros/ventas/999999/enviar",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 404

    def test_enviar_ventas_wrong_empresa(self, client, token_extra, db, admin_user):
        libro = LibroVentas(
            periodo="2026-01", empresa_id=admin_user.empresa_id,
            total_registros=0, monto_total=0,
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)
        response = client.post(
            f"/api/libros/ventas/{libro.id}/enviar",
            headers={"Authorization": f"Bearer {token_extra}"},
        )
        assert response.status_code == 403

    def test_enviar_ventas_already_sent(self, client, admin_token, db, admin_user):
        libro = LibroVentas(
            periodo="2026-01", empresa_id=admin_user.empresa_id,
            total_registros=0, monto_total=0, estado="enviado",
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)
        response = client.post(
            f"/api/libros/ventas/{libro.id}/enviar",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 409

    def test_enviar_ventas_lioren_error_returns_502(self, client, admin_token, db, admin_user):
        libro = LibroVentas(
            periodo="2026-04", empresa_id=admin_user.empresa_id,
            total_registros=0, monto_total=0, estado="borrador",
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)
        with patch("app.api.libros.get_dte_service") as mock_factory:
            svc = mock_factory.return_value
            svc.build_libro_ventas_payload.return_value = {}
            svc.submit_libro.side_effect = Exception("timeout")
            response = client.post(
                f"/api/libros/ventas/{libro.id}/enviar",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        assert response.status_code == 502

    def test_enviar_ventas_success(self, client, admin_token, db, admin_user):
        libro = LibroVentas(
            periodo="2026-05", empresa_id=admin_user.empresa_id,
            total_registros=0, monto_total=0, estado="borrador",
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)
        with patch("app.api.libros.get_dte_service") as mock_factory:
            svc = mock_factory.return_value
            svc.build_libro_ventas_payload.return_value = {}
            svc.submit_libro.return_value = {"track_id": "abc123"}
            response = client.post(
                f"/api/libros/ventas/{libro.id}/enviar",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["estado"] == "enviado"
        assert data["lioren_response"] == {"track_id": "abc123"}
        db.refresh(libro)
        assert libro.estado == "enviado"

    def test_enviar_compras_not_found(self, client, admin_token):
        response = client.post(
            "/api/libros/compras/999999/enviar",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 404

    def test_enviar_compras_already_sent(self, client, admin_token, db, admin_user):
        libro = LibroCompras(
            periodo="2026-01", empresa_id=admin_user.empresa_id,
            total_registros=0, monto_total=0, estado="enviado",
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)
        response = client.post(
            f"/api/libros/compras/{libro.id}/enviar",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 409

    def test_enviar_compras_wrong_empresa(self, client, token_extra, db, admin_user):
        libro = LibroCompras(
            periodo="2026-01", empresa_id=admin_user.empresa_id,
            total_registros=0, monto_total=0,
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)
        response = client.post(
            f"/api/libros/compras/{libro.id}/enviar",
            headers={"Authorization": f"Bearer {token_extra}"},
        )
        assert response.status_code == 403

    def test_enviar_compras_success(self, client, admin_token, db, admin_user):
        libro = LibroCompras(
            periodo="2026-05", empresa_id=admin_user.empresa_id,
            total_registros=0, monto_total=0, estado="borrador",
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)
        with patch("app.api.libros.get_dte_service") as mock_factory:
            svc = mock_factory.return_value
            svc.build_libro_compras_payload.return_value = {}
            svc.submit_libro.return_value = {"status": "ok"}
            response = client.post(
                f"/api/libros/compras/{libro.id}/enviar",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["estado"] == "enviado"
        db.refresh(libro)
        assert libro.estado == "enviado"
