# backend/tests/test_dashboard.py
import json
import pytest
from tests.conftest import TestingSession
from app.models.user import User
from app.core.security import get_password_hash


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_user(role: str, email: str) -> User:
    db = TestingSession()
    user = User(
        email=email,
        name=role.capitalize(),
        hashed_password=get_password_hash("secret"),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def _token(client, email: str) -> str:
    r = client.post("/api/auth/login", data={"username": email, "password": "secret"})
    return r.json()["access_token"]


SAMPLE_LAYOUT = {
    "widgets": [
        {"id": "w1", "type": "ventas_periodo", "chart": "bar", "date_range": "month", "limit": 10}
    ]
}


# ── layout CRUD ───────────────────────────────────────────────────────────────

class TestLayoutCRUD:
    def test_get_layout_no_saved_returns_empty(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/layout/admin", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "admin"
        assert body["layout"]["widgets"] == []

    def test_put_layout_saves_and_returns(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.put(
            "/api/dashboard/layout/admin",
            json=SAMPLE_LAYOUT,
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 200
        assert r.json()["layout"]["widgets"][0]["id"] == "w1"

    def test_get_layout_returns_saved(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        client.put("/api/dashboard/layout/admin", json=SAMPLE_LAYOUT,
                   headers={"Authorization": f"Bearer {tok}"})
        r = client.get("/api/dashboard/layout/admin",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.json()["layout"]["widgets"][0]["type"] == "ventas_periodo"

    def test_put_layout_forbidden_for_vendedor(self, client, setup_test_db):
        _make_user("vendedor", "v@test.cl")
        tok = _token(client, "v@test.cl")
        r = client.put(
            "/api/dashboard/layout/vendedor",
            json=SAMPLE_LAYOUT,
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 403

    def test_subadmin_layout_falls_back_to_admin_when_missing(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        _make_user("subadmin", "s@test.cl")
        admin_tok = _token(client, "a@test.cl")
        subadmin_tok = _token(client, "s@test.cl")
        client.put("/api/dashboard/layout/admin", json=SAMPLE_LAYOUT,
                   headers={"Authorization": f"Bearer {admin_tok}"})
        r = client.get("/api/dashboard/layout/subadmin",
                       headers={"Authorization": f"Bearer {subadmin_tok}"})
        assert r.status_code == 200
        assert r.json()["layout"]["widgets"][0]["type"] == "ventas_periodo"

    def test_unauthenticated_returns_401(self, client, setup_test_db):
        r = client.get("/api/dashboard/layout/admin")
        assert r.status_code == 401
