"""Integration tests for require_modulo gating on RRHH, CRM, libros, DTE recepcion, and aprobaciones routers.

For each gated module we verify:
  - 403 + modulo_disabled detail when the empresa has that module explicitly OFF
  - non-403 (200 or 201) when the empresa has all modules ON (admin_token fixture)
"""

from tests.conftest import TestingSession
from app.core.security import get_password_hash

_BLOCKED_HASH = get_password_hash("secret123")


def _make_blocked_token(client, module_slug: str) -> str:
    from app.models.empresa import Empresa
    from app.models.user import User
    from app.core.modulos import OPTIONAL_MODULES

    db = TestingSession()
    modulos = {slug: True for slug in OPTIONAL_MODULES}
    modulos[module_slug] = False

    empresa = Empresa(nombre=f"Empresa sin {module_slug}", modulos_enabled=modulos)
    db.add(empresa)
    db.flush()

    email = f"blocked_p16_{module_slug}@test.cl"
    user = User(
        email=email,
        name="Blocked",
        hashed_password=_BLOCKED_HASH,
        role="admin",
        empresa_id=empresa.id,
    )
    db.add(user)
    db.commit()
    db.close()

    resp = client.post(
        "/api/auth/login",
        data={"username": email, "password": "secret123"},
    )
    assert resp.status_code == 200, f"login failed for {email}: {resp.text}"
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# rrhh_empleados
# ---------------------------------------------------------------------------

def test_empleados_blocked_when_module_off(client):
    token = _make_blocked_token(client, "rrhh_empleados")
    r = client.get("/api/empleados/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "rrhh_empleados"


def test_empleados_accessible_when_module_on(client, admin_token):
    r = client.get("/api/empleados/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# rrhh_vacaciones
# ---------------------------------------------------------------------------

def test_empleados_vacaciones_blocked_when_module_off(client):
    token = _make_blocked_token(client, "rrhh_vacaciones")
    r = client.get("/api/empleados/1/vacaciones/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "rrhh_vacaciones"


def test_empleados_vacaciones_accessible_when_module_on(client, admin_token):
    r = client.get("/api/empleados/1/vacaciones/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code in (200, 404)


# ---------------------------------------------------------------------------
# oportunidades
# ---------------------------------------------------------------------------

def test_oportunidades_blocked_when_module_off(client):
    token = _make_blocked_token(client, "oportunidades")
    r = client.get("/api/oportunidades/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "oportunidades"


def test_oportunidades_accessible_when_module_on(client, admin_token):
    r = client.get("/api/oportunidades/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# tareas
# ---------------------------------------------------------------------------

def test_tareas_blocked_when_module_off(client):
    token = _make_blocked_token(client, "tareas")
    r = client.get("/api/tareas", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "tareas"


def test_tareas_accessible_when_module_on(client, admin_token):
    r = client.get("/api/tareas", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# reglas_tareas
# ---------------------------------------------------------------------------

def test_reglas_tareas_blocked_when_module_off(client):
    token = _make_blocked_token(client, "reglas_tareas")
    r = client.get("/api/tareas/reglas", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "reglas_tareas"


def test_reglas_tareas_accessible_when_module_on(client, admin_token):
    r = client.get("/api/tareas/reglas", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# libros
# ---------------------------------------------------------------------------

def test_libros_blocked_when_module_off(client):
    token = _make_blocked_token(client, "libros")
    r = client.get("/api/libros/ventas", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "libros"


def test_libros_accessible_when_module_on(client, admin_token):
    r = client.get("/api/libros/ventas", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code in (200, 422)


# ---------------------------------------------------------------------------
# dte_recepcion
# ---------------------------------------------------------------------------

def test_dte_recepcion_blocked_when_module_off(client):
    token = _make_blocked_token(client, "dte_recepcion")
    r = client.get("/api/dte_recepcion/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "dte_recepcion"


def test_dte_recepcion_accessible_when_module_on(client, admin_token):
    r = client.get("/api/dte_recepcion/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# aprobaciones_costo
# ---------------------------------------------------------------------------

def test_aprobaciones_costo_blocked_when_module_off(client):
    token = _make_blocked_token(client, "aprobaciones_costo")
    r = client.post("/api/aprobaciones-costo/1/aprobar", json={"accion": "aprobar"}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "aprobaciones_costo"


def test_aprobaciones_costo_accessible_when_module_on(client, admin_token):
    r = client.post("/api/aprobaciones-costo/999/aprobar", json={"accion": "aprobar"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code in (200, 404, 422)


# ---------------------------------------------------------------------------
# aprobaciones_margen
# ---------------------------------------------------------------------------

def test_aprobaciones_margen_blocked_when_module_off(client):
    token = _make_blocked_token(client, "aprobaciones_margen")
    r = client.get("/api/aprobaciones_margen/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "aprobaciones_margen"


def test_aprobaciones_margen_accessible_when_module_on(client, admin_token):
    r = client.get("/api/aprobaciones_margen/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code in (200, 405)


# ---------------------------------------------------------------------------
# aprobaciones_descuento (solicitudes_descuento router)
# ---------------------------------------------------------------------------

def test_solicitudes_descuento_blocked_when_module_off(client):
    token = _make_blocked_token(client, "aprobaciones_descuento")
    r = client.get("/api/solicitudes-descuento/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "aprobaciones_descuento"


def test_solicitudes_descuento_accessible_when_module_on(client, admin_token):
    r = client.get("/api/solicitudes-descuento/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code in (200, 405)


# ---------------------------------------------------------------------------
# aprobaciones (credit) gated by aprobaciones_costo
# ---------------------------------------------------------------------------

def test_aprobaciones_credito_blocked_when_module_off(client):
    token = _make_blocked_token(client, "aprobaciones_costo")
    r = client.get("/api/aprobaciones/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "aprobaciones_costo"


def test_aprobaciones_credito_accessible_when_module_on(client, admin_token):
    r = client.get("/api/aprobaciones/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
