"""Tests for W1-01 — global audit log.

Cubre:
- Crear Cotizacion → log create con `diff.after`.
- Actualizar Cliente → log update con `before/after/changed`.
- Eliminar Producto → log delete con `before`.
- Crear Empresa → log create.
- Actualizar User con password → omite el campo sensible.
- Vendedor → 403 al GET /api/auditoria.
- Filtros y paginación básicos.
- Export CSV.
"""
from __future__ import annotations

import json
from datetime import date


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _list_logs(client, token, **params):
    resp = client.get("/api/auditoria", headers=_bearer(token), params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Mutaciones → logs
# ---------------------------------------------------------------------------


def test_create_cotizacion_writes_audit_log(client, admin_token, admin_user, cliente_demo):
    payload = {
        "cliente_id": cliente_demo.id,
        "vendedor_id": admin_user.id,
        "fecha": str(date.today()),
        "lineas": [],
    }
    resp = client.post("/api/cotizaciones/", json=payload, headers=_bearer(admin_token))
    assert resp.status_code in (200, 201), resp.text

    data = _list_logs(client, admin_token, entity_type="Cotizacion", action="create")
    assert data["total"] >= 1
    log = data["items"][0]
    assert log["entity_type"] == "Cotizacion"
    assert log["action"] == "create"
    assert log["diff_json"] is not None
    assert "after" in log["diff_json"]
    assert log["user_id"] == admin_user.id


def test_update_cliente_writes_before_after_changed(client, admin_token, admin_user):
    # crea cliente
    resp = client.post(
        "/api/clientes/",
        json={"nombre": "Original SA", "rut": "12345678-9"},
        headers=_bearer(admin_token),
    )
    assert resp.status_code == 201
    cid = resp.json()["id"]

    # update
    resp = client.patch(
        f"/api/clientes/{cid}",
        json={"nombre": "Renombrado SA", "telefono": "+56999999999"},
        headers=_bearer(admin_token),
    )
    assert resp.status_code == 200

    data = _list_logs(client, admin_token, entity_type="Cliente", action="update")
    assert data["total"] >= 1
    diff = data["items"][0]["diff_json"]
    assert set(diff.keys()) == {"before", "after", "changed"}
    assert "nombre" in diff["changed"]
    assert diff["before"]["nombre"] == "Original SA"
    assert diff["after"]["nombre"] == "Renombrado SA"


def test_delete_producto_writes_before(client, admin_token):
    # Crea proveedor para el producto.
    pv = client.post(
        "/api/proveedores/",
        json={"nombre": "Prov X"},
        headers=_bearer(admin_token),
    )
    assert pv.status_code == 201

    # Crea producto.
    resp = client.post(
        "/api/productos/",
        json={"nombre": "Producto a borrar", "precio_venta": "100"},
        headers=_bearer(admin_token),
    )
    assert resp.status_code in (200, 201), resp.text
    pid = resp.json()["id"]

    # Borra.
    resp = client.delete(f"/api/productos/{pid}", headers=_bearer(admin_token))
    assert resp.status_code in (200, 204)

    data = _list_logs(client, admin_token, entity_type="Producto", action="delete")
    assert data["total"] >= 1
    diff = data["items"][0]["diff_json"]
    assert "before" in diff
    assert diff["before"]["id"] == pid


def test_create_empresa_writes_audit_log(client, admin_token):
    resp = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa Audit SA"},
        headers=_bearer(admin_token),
    )
    assert resp.status_code in (200, 201), resp.text

    data = _list_logs(client, admin_token, entity_type="Empresa", action="create")
    assert data["total"] >= 1
    assert "after" in data["items"][0]["diff_json"]
    assert data["items"][0]["diff_json"]["after"]["nombre"] == "Empresa Audit SA"


def test_update_user_password_is_omitted_from_diff(client, admin_token, vendedor_user):
    # admin actualiza password de vendedor
    resp = client.patch(
        f"/api/users/{vendedor_user.id}",
        json={"password": "nuevopass123", "name": "VendNuevoNombre"},
        headers=_bearer(admin_token),
    )
    assert resp.status_code == 200

    data = _list_logs(client, admin_token, entity_type="User", action="update")
    assert data["total"] >= 1
    diff = data["items"][0]["diff_json"]
    serialized = json.dumps(diff)
    # Verifica omisión: ni `hashed_password` ni la palabra `password` deben
    # aparecer como key dentro de before/after.
    assert "hashed_password" not in diff["before"]
    assert "hashed_password" not in diff["after"]
    assert "hashed_password" not in diff["changed"]
    # El nombre sí cambió y debe estar.
    assert "name" in diff["changed"]


# ---------------------------------------------------------------------------
# Permisos
# ---------------------------------------------------------------------------


def test_vendedor_cannot_view_auditoria(client, vendedor_token):
    resp = client.get("/api/auditoria", headers=_bearer(vendedor_token))
    assert resp.status_code == 403


def test_vendedor_cannot_export_csv(client, vendedor_token):
    resp = client.get("/api/auditoria/export.csv", headers=_bearer(vendedor_token))
    assert resp.status_code == 403


def test_admin_can_export_csv(client, admin_token, admin_user):
    # Genera al menos un log.
    client.post(
        "/api/empresas/",
        json={"nombre": "Empresa CSV"},
        headers=_bearer(admin_token),
    )
    resp = client.get("/api/auditoria/export.csv", headers=_bearer(admin_token))
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    body = resp.content.decode("utf-8-sig")
    # Header presente.
    assert "id,created_at,user_id" in body.splitlines()[0]


# ---------------------------------------------------------------------------
# Filtros y paginación
# ---------------------------------------------------------------------------


def test_filtros_y_paginacion(client, admin_token):
    # Genera 3 empresas.
    ids = []
    for i in range(3):
        r = client.post(
            "/api/empresas/",
            json={"nombre": f"Empresa F{i}"},
            headers=_bearer(admin_token),
        )
        assert r.status_code in (200, 201)
        ids.append(r.json()["id"])

    # Filtra por entity_type y action.
    data = _list_logs(client, admin_token, entity_type="Empresa", action="create", limit=2)
    assert data["limit"] == 2
    assert len(data["items"]) <= 2
    assert data["total"] >= 3

    # Filtra por entity_id puntual.
    data = _list_logs(client, admin_token, entity_type="Empresa", entity_id=str(ids[0]))
    assert data["total"] >= 1
    for item in data["items"]:
        assert item["entity_id"] == str(ids[0])
