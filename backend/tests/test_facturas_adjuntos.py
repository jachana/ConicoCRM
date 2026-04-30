import io
import shutil
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _cleanup_uploads():
    yield
    target = Path("uploads/facturas")
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _make_cliente(client, token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Cliente Fac Adj"},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _make_factura(client, token):
    cid = _make_cliente(client, token)
    r = client.post(
        "/api/facturas/",
        json={
            "cliente_id": cid,
            "correo": "f@test.cl",
            "lineas": [{"orden": 0, "descripcion": "Item", "cantidad": 1, "valor_neto": 1000}],
        },
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_subir_pdf(client, admin_token):
    fac = _make_factura(client, admin_token)
    r = client.post(
        f"/api/facturas/{fac['id']}/adjuntos/",
        files={"file": ("oc-1234.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["nombre"] == "oc-1234.pdf"
    assert body["mime_type"] == "application/pdf"
    assert body["factura_id"] == fac["id"]


def test_subir_jpg_y_png(client, admin_token):
    fac = _make_factura(client, admin_token)
    for fname, ctype in [("oc.jpg", "image/jpeg"), ("oc.png", "image/png")]:
        r = client.post(
            f"/api/facturas/{fac['id']}/adjuntos/",
            files={"file": (fname, io.BytesIO(b"binarydata"), ctype)},
            headers=_h(admin_token),
        )
        assert r.status_code == 201, f"{fname}: {r.text}"


def test_rechaza_otros_formatos(client, admin_token):
    fac = _make_factura(client, admin_token)
    r = client.post(
        f"/api/facturas/{fac['id']}/adjuntos/",
        files={"file": ("a.txt", io.BytesIO(b"hi"), "text/plain")},
        headers=_h(admin_token),
    )
    assert r.status_code == 400


def test_listar(client, admin_token):
    fac = _make_factura(client, admin_token)
    client.post(
        f"/api/facturas/{fac['id']}/adjuntos/",
        files={"file": ("a.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        headers=_h(admin_token),
    )
    r = client.get(f"/api/facturas/{fac['id']}/adjuntos/", headers=_h(admin_token))
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_descargar(client, admin_token):
    fac = _make_factura(client, admin_token)
    payload = b"%PDF-1.4 contents"
    upload = client.post(
        f"/api/facturas/{fac['id']}/adjuntos/",
        files={"file": ("doc.pdf", io.BytesIO(payload), "application/pdf")},
        headers=_h(admin_token),
    )
    adj_id = upload.json()["id"]
    r = client.get(
        f"/api/facturas/{fac['id']}/adjuntos/{adj_id}/download",
        headers=_h(admin_token),
    )
    assert r.status_code == 200
    assert r.content == payload


def test_eliminar(client, admin_token):
    fac = _make_factura(client, admin_token)
    upload = client.post(
        f"/api/facturas/{fac['id']}/adjuntos/",
        files={"file": ("d.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        headers=_h(admin_token),
    )
    adj_id = upload.json()["id"]
    r = client.delete(
        f"/api/facturas/{fac['id']}/adjuntos/{adj_id}", headers=_h(admin_token)
    )
    assert r.status_code == 204
    r2 = client.get(f"/api/facturas/{fac['id']}/adjuntos/", headers=_h(admin_token))
    assert r2.json() == []


def test_max_10_por_factura(client, admin_token):
    fac = _make_factura(client, admin_token)
    for i in range(10):
        r = client.post(
            f"/api/facturas/{fac['id']}/adjuntos/",
            files={"file": (f"x{i}.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
            headers=_h(admin_token),
        )
        assert r.status_code == 201
    r = client.post(
        f"/api/facturas/{fac['id']}/adjuntos/",
        files={"file": ("over.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        headers=_h(admin_token),
    )
    assert r.status_code == 400


def test_factura_inexistente(client, admin_token):
    r = client.post(
        "/api/facturas/999999/adjuntos/",
        files={"file": ("a.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        headers=_h(admin_token),
    )
    assert r.status_code == 404
