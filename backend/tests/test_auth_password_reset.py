from datetime import datetime, timedelta, timezone
from unittest.mock import patch


def test_password_reset_request_unknown_email_returns_204(client):
    resp = client.post("/api/auth/password-reset/request", json={"email": "nope@conico.cl"})
    assert resp.status_code == 204


def test_password_reset_request_known_user_writes_token(client, admin_user):
    with patch("app.api.auth.enviar_recordatorio") as send:
        resp = client.post("/api/auth/password-reset/request", json={"email": "admin@conico.cl"})
        assert resp.status_code == 204
        assert send.called
        # Body must contain a reset URL.
        args, _ = send.call_args
        assert "/reset-password/" in args[2]

    # Verify token + expires written.
    from tests.conftest import TestingSession
    from app.models.user import User

    db = TestingSession()
    u = db.query(User).filter_by(email="admin@conico.cl").first()
    assert u.password_reset_token_hash
    assert u.password_reset_expires_at
    db.close()


def test_password_reset_confirm_happy_path(client, admin_user):
    from tests.conftest import TestingSession
    from app.models.user import User
    from app.core.security import (
        generate_password_reset_token,
        hash_password_reset_token,
        verify_password,
    )

    token = generate_password_reset_token()
    db = TestingSession()
    u = db.query(User).filter_by(email="admin@conico.cl").first()
    u.password_reset_token_hash = hash_password_reset_token(token)
    u.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.commit()
    db.close()

    resp = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": token, "new_password": "Brand_New_PWD_123"},
    )
    assert resp.status_code == 204

    db = TestingSession()
    u = db.query(User).filter_by(email="admin@conico.cl").first()
    assert verify_password("Brand_New_PWD_123", u.hashed_password)
    assert u.password_reset_token_hash is None
    assert u.password_reset_expires_at is None
    db.close()

    # Old password no longer works.
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    assert resp.status_code == 401
    # New password works.
    resp = client.post(
        "/api/auth/login",
        data={"username": "admin@conico.cl", "password": "Brand_New_PWD_123"},
    )
    assert resp.status_code == 200


def test_password_reset_confirm_expired_token_rejected(client, admin_user):
    from tests.conftest import TestingSession
    from app.models.user import User
    from app.core.security import generate_password_reset_token, hash_password_reset_token

    token = generate_password_reset_token()
    db = TestingSession()
    u = db.query(User).filter_by(email="admin@conico.cl").first()
    u.password_reset_token_hash = hash_password_reset_token(token)
    u.password_reset_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    db.close()

    resp = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": token, "new_password": "Brand_New_PWD_123"},
    )
    assert resp.status_code == 400


def test_password_reset_confirm_invalid_token_rejected(client, admin_user):
    resp = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": "definitely-not-a-real-token-string", "new_password": "Brand_New_PWD_123"},
    )
    assert resp.status_code == 400


def test_password_reset_confirm_token_consumed_once(client, admin_user):
    from tests.conftest import TestingSession
    from app.models.user import User
    from app.core.security import generate_password_reset_token, hash_password_reset_token

    token = generate_password_reset_token()
    db = TestingSession()
    u = db.query(User).filter_by(email="admin@conico.cl").first()
    u.password_reset_token_hash = hash_password_reset_token(token)
    u.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.commit()
    db.close()

    r1 = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": token, "new_password": "Brand_New_PWD_123"},
    )
    assert r1.status_code == 204
    r2 = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": token, "new_password": "Another_Pwd_456"},
    )
    assert r2.status_code == 400
