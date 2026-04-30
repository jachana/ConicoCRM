import pyotp
import pytest


@pytest.fixture
def setup_2fa(client, admin_user, admin_token):
    """Helper that enrolls admin into 2FA and returns (secret, recovery_codes)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = client.post("/api/auth/2fa/setup", headers=headers)
    assert resp.status_code == 200, resp.text
    secret = resp.json()["secret"]
    code = pyotp.TOTP(secret).now()
    resp = client.post("/api/auth/2fa/verify", headers=headers, json={"code": code})
    assert resp.status_code == 200, resp.text
    recovery_codes = resp.json()["recovery_codes"]
    assert len(recovery_codes) == 10
    return secret, recovery_codes


def test_2fa_status_default_disabled(client, admin_token):
    resp = client.get("/api/auth/2fa/status", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json() == {"enabled": False}


def test_2fa_setup_returns_qr_and_uri(client, admin_token):
    resp = client.post("/api/auth/2fa/setup", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["secret"] and len(body["secret"]) >= 16
    assert body["provisioning_uri"].startswith("otpauth://totp/")
    assert body["qr_png_base64"]


def test_2fa_verify_with_valid_code_enables(client, admin_token, setup_2fa):
    resp = client.get("/api/auth/2fa/status", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json()["enabled"] is True


def test_2fa_verify_invalid_code_rejects(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    client.post("/api/auth/2fa/setup", headers=headers)
    resp = client.post("/api/auth/2fa/verify", headers=headers, json={"code": "000000"})
    assert resp.status_code == 400


def test_login_with_2fa_returns_ticket(client, admin_user, setup_2fa):
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("twofa_required") is True
    assert body["ticket"]
    assert "access_token" not in body


def test_login_2fa_with_totp_completes(client, admin_user, setup_2fa):
    secret, _ = setup_2fa
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    ticket = resp.json()["ticket"]

    code = pyotp.TOTP(secret).now()
    resp = client.post("/api/auth/login/2fa", json={"ticket": ticket, "code": code})
    assert resp.status_code == 200, resp.text
    assert "access_token" in resp.json()


def test_login_2fa_with_recovery_code_consumes_it(client, admin_user, setup_2fa):
    _, recovery_codes = setup_2fa
    rc = recovery_codes[0]

    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    ticket = resp.json()["ticket"]
    resp = client.post("/api/auth/login/2fa", json={"ticket": ticket, "code": rc})
    assert resp.status_code == 200

    # Reusing the same recovery code must fail.
    resp2 = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    ticket2 = resp2.json()["ticket"]
    resp3 = client.post("/api/auth/login/2fa", json={"ticket": ticket2, "code": rc})
    assert resp3.status_code == 401


def test_login_2fa_invalid_code_rejected(client, admin_user, setup_2fa):
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    ticket = resp.json()["ticket"]
    resp = client.post("/api/auth/login/2fa", json={"ticket": ticket, "code": "000000"})
    assert resp.status_code == 401


def test_login_2fa_invalid_ticket_rejected(client):
    resp = client.post("/api/auth/login/2fa", json={"ticket": "garbage", "code": "123456"})
    assert resp.status_code == 401


def test_2fa_disable_clears_state(client, admin_token, setup_2fa):
    secret, _ = setup_2fa
    headers = {"Authorization": f"Bearer {admin_token}"}
    code = pyotp.TOTP(secret).now()
    resp = client.post(
        "/api/auth/2fa/disable",
        headers=headers,
        json={"password": "secret123", "code": code},
    )
    assert resp.status_code == 204

    # Login no longer requires 2FA.
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_2fa_disable_wrong_password(client, admin_token, setup_2fa):
    secret, _ = setup_2fa
    code = pyotp.TOTP(secret).now()
    resp = client.post(
        "/api/auth/2fa/disable",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"password": "WRONG", "code": code},
    )
    assert resp.status_code == 401


def test_2fa_recovery_codes_regenerate(client, admin_token, setup_2fa):
    secret, old_codes = setup_2fa
    code = pyotp.TOTP(secret).now()
    resp = client.post(
        "/api/auth/2fa/recovery-codes/regenerate",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"code": code},
    )
    assert resp.status_code == 200
    new_codes = resp.json()["recovery_codes"]
    assert len(new_codes) == 10
    assert set(new_codes).isdisjoint(set(old_codes))

    # Old recovery code no longer works.
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    ticket = resp.json()["ticket"]
    resp = client.post("/api/auth/login/2fa", json={"ticket": ticket, "code": old_codes[0]})
    assert resp.status_code == 401
