# backend/tests/test_empleados_vacaciones.py
import pytest


@pytest.fixture
def empleado(client, admin_token):
    r = client.post(
        "/api/empleados/",
        json={"nombre": "Vacaciones Emp", "cargo": "Dev"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    return r.json()


def test_listar_vacaciones_sin_auth(client, empleado):
    r = client.get(f"/api/empleados/{empleado['id']}/vacaciones/")
    assert r.status_code == 401


def test_registrar_vacacion(client, admin_token, empleado):
    r = client.post(
        f"/api/empleados/{empleado['id']}/vacaciones/",
        json={"fecha_inicio": "2026-01-06", "fecha_fin": "2026-01-17", "dias": 10, "descripcion": "Verano"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["fecha_inicio"] == "2026-01-06"
    assert data["fecha_fin"] == "2026-01-17"
    assert data["dias"] == 10
    assert data["descripcion"] == "Verano"
    assert data["empleado_id"] == empleado["id"]


def test_registrar_vacacion_sin_descripcion(client, admin_token, empleado):
    r = client.post(
        f"/api/empleados/{empleado['id']}/vacaciones/",
        json={"fecha_inicio": "2026-07-01", "fecha_fin": "2026-07-05", "dias": 5},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["descripcion"] is None


def test_registrar_vacacion_empleado_inexistente(client, admin_token):
    r = client.post(
        "/api/empleados/99999/vacaciones/",
        json={"fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-05", "dias": 5},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


def test_listar_vacaciones(client, admin_token, empleado):
    client.post(f"/api/empleados/{empleado['id']}/vacaciones/", json={"fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-05", "dias": 5}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post(f"/api/empleados/{empleado['id']}/vacaciones/", json={"fecha_inicio": "2026-07-01", "fecha_fin": "2026-07-10", "dias": 10}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get(f"/api/empleados/{empleado['id']}/vacaciones/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_actualizar_vacacion(client, admin_token, empleado):
    vac = client.post(f"/api/empleados/{empleado['id']}/vacaciones/", json={"fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-05", "dias": 5}, headers={"Authorization": f"Bearer {admin_token}"}).json()
    r = client.patch(
        f"/api/empleados/{empleado['id']}/vacaciones/{vac['id']}",
        json={"descripcion": "Actualizado", "dias": 6},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["descripcion"] == "Actualizado"
    assert r.json()["dias"] == 6


def test_eliminar_vacacion(client, admin_token, empleado):
    vac = client.post(f"/api/empleados/{empleado['id']}/vacaciones/", json={"fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-03", "dias": 3}, headers={"Authorization": f"Bearer {admin_token}"}).json()
    r = client.delete(f"/api/empleados/{empleado['id']}/vacaciones/{vac['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 204
    r2 = client.get(f"/api/empleados/{empleado['id']}/vacaciones/", headers={"Authorization": f"Bearer {admin_token}"})
    assert len(r2.json()) == 0


def test_subadmin_no_puede_registrar(client, subadmin_token, empleado):
    r = client.post(
        f"/api/empleados/{empleado['id']}/vacaciones/",
        json={"fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-05", "dias": 5},
        headers={"Authorization": f"Bearer {subadmin_token}"},
    )
    assert r.status_code == 403
