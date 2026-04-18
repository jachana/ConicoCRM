"""
Smoke tests — require a running Docker stack (docker compose up).
Run with: pytest -m smoke

These tests will fail until:
  1. Docker Desktop is running
  2. docker compose up --build -d
  3. alembic upgrade head
  4. python scripts/seed_admin.py
"""
import httpx
import pytest

BASE_URL = "http://localhost:8000"
ADMIN_EMAIL = "admin@conico.cl"
ADMIN_PASSWORD = "changeme123"


def _login() -> str:
    r = httpx.post(f"{BASE_URL}/api/auth/login", data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login falló: {r.text}"
    return r.json()["access_token"]


@pytest.mark.smoke
def test_backend_disponible():
    r = httpx.get(f"{BASE_URL}/docs", timeout=5)
    assert r.status_code == 200


@pytest.mark.smoke
def test_login_admin():
    token = _login()
    assert token


@pytest.mark.smoke
def test_refresh_token():
    r = httpx.post(f"{BASE_URL}/api/auth/login", data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    refresh = r.json()["refresh_token"]
    r2 = httpx.post(f"{BASE_URL}/api/auth/refresh", json={"refresh_token": refresh})
    assert r2.status_code == 200
    assert "access_token" in r2.json()


@pytest.mark.smoke
def test_me_retorna_admin():
    token = _login()
    r = httpx.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == ADMIN_EMAIL
    assert data["role"] == "admin"
    assert data["is_active"] is True


@pytest.mark.smoke
def test_lista_usuarios():
    token = _login()
    r = httpx.get(f"{BASE_URL}/api/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    users = r.json()
    assert len(users) >= 1
    emails = [u["email"] for u in users]
    assert ADMIN_EMAIL in emails


@pytest.mark.smoke
def test_permisos_admin():
    token = _login()
    r = httpx.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    admin_id = r.json()["id"]
    perms = httpx.get(f"{BASE_URL}/api/users/{admin_id}/permissions", headers={"Authorization": f"Bearer {token}"})
    assert perms.status_code == 200
    data = perms.json()
    assert data["usuarios"]["view"] is True
    assert data["rrhh"]["view"] is True


@pytest.mark.smoke
def test_endpoint_protegido_sin_token():
    r = httpx.get(f"{BASE_URL}/api/users")
    assert r.status_code == 401
