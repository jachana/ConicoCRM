# backend/tests/test_empleados_documentos.py
import io
import pytest
import app.api.empleados_documentos as docs_module


@pytest.fixture
def empleado(client, admin_token):
    r = client.post(
        "/api/empleados/",
        json={"nombre": "Test Emp", "cargo": "Dev"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    return r.json()


def test_listar_docs_sin_auth(client, empleado):
    r = client.get(f"/api/empleados/{empleado['id']}/documentos/")
    assert r.status_code == 401


def test_subir_documento(client, admin_token, empleado, tmp_path, monkeypatch):
    monkeypatch.setattr(docs_module, "UPLOAD_DIR", tmp_path)
    r = client.post(
        f"/api/empleados/{empleado['id']}/documentos/",
        files={"file": ("contrato.pdf", io.BytesIO(b"%PDF-1.4 content"), "application/pdf")},
        data={"tipo": "contrato"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "contrato.pdf"
    assert data["tipo"] == "contrato"
    assert data["empleado_id"] == empleado["id"]
    assert "id" in data


def test_subir_documento_tipo_invalido(client, admin_token, empleado, tmp_path, monkeypatch):
    monkeypatch.setattr(docs_module, "UPLOAD_DIR", tmp_path)
    r = client.post(
        f"/api/empleados/{empleado['id']}/documentos/",
        files={"file": ("doc.pdf", io.BytesIO(b"content"), "application/pdf")},
        data={"tipo": "tipo_invalido"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_subir_empleado_inexistente(client, admin_token, tmp_path, monkeypatch):
    monkeypatch.setattr(docs_module, "UPLOAD_DIR", tmp_path)
    r = client.post(
        "/api/empleados/99999/documentos/",
        files={"file": ("doc.pdf", io.BytesIO(b"content"), "application/pdf")},
        data={"tipo": "otro"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


def test_listar_documentos(client, admin_token, empleado, tmp_path, monkeypatch):
    monkeypatch.setattr(docs_module, "UPLOAD_DIR", tmp_path)
    client.post(
        f"/api/empleados/{empleado['id']}/documentos/",
        files={"file": ("a.pdf", io.BytesIO(b"a"), "application/pdf")},
        data={"tipo": "contrato"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    client.post(
        f"/api/empleados/{empleado['id']}/documentos/",
        files={"file": ("b.pdf", io.BytesIO(b"b"), "application/pdf")},
        data={"tipo": "liquidacion"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r = client.get(f"/api/empleados/{empleado['id']}/documentos/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_descargar_documento(client, admin_token, empleado, tmp_path, monkeypatch):
    monkeypatch.setattr(docs_module, "UPLOAD_DIR", tmp_path)
    upload = client.post(
        f"/api/empleados/{empleado['id']}/documentos/",
        files={"file": ("test.pdf", io.BytesIO(b"PDF data"), "application/pdf")},
        data={"tipo": "otro"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    r = client.get(
        f"/api/empleados/{empleado['id']}/documentos/{upload['id']}/download",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.content == b"PDF data"


def test_eliminar_documento(client, admin_token, empleado, tmp_path, monkeypatch):
    monkeypatch.setattr(docs_module, "UPLOAD_DIR", tmp_path)
    doc = client.post(
        f"/api/empleados/{empleado['id']}/documentos/",
        files={"file": ("del.pdf", io.BytesIO(b"x"), "application/pdf")},
        data={"tipo": "otro"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    r = client.delete(
        f"/api/empleados/{empleado['id']}/documentos/{doc['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 204
    r2 = client.get(f"/api/empleados/{empleado['id']}/documentos/", headers={"Authorization": f"Bearer {admin_token}"})
    assert len(r2.json()) == 0


def test_subadmin_no_puede_subir(client, subadmin_token, empleado, tmp_path, monkeypatch):
    monkeypatch.setattr(docs_module, "UPLOAD_DIR", tmp_path)
    r = client.post(
        f"/api/empleados/{empleado['id']}/documentos/",
        files={"file": ("x.pdf", io.BytesIO(b"x"), "application/pdf")},
        data={"tipo": "otro"},
        headers={"Authorization": f"Bearer {subadmin_token}"},
    )
    assert r.status_code == 403
