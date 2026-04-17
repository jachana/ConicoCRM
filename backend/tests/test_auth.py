def test_login_success(client, admin_user):
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client, admin_user):
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "wrong"})
    assert resp.status_code == 401


def test_login_unknown_user(client):
    resp = client.post("/api/auth/login", data={"username": "nobody@conico.cl", "password": "x"})
    assert resp.status_code == 401


def test_get_me(client, admin_token):
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "admin@conico.cl"
    assert resp.json()["role"] == "admin"


def test_get_me_no_token(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_refresh_token(client, admin_user):
    login = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    refresh_token = login.json()["refresh_token"]
    resp = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
