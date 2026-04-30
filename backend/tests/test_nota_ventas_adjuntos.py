import io
import shutil
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _cleanup_uploads():
    yield
    target = Path("uploads/nota_ventas")
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)


def _make_cliente(client, token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Cliente Adj Test"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _make_nv(client, token, **extra):
    cid = _make_cliente(client, token)
    payload = {"cliente_id": cid, "retiro_en_conico": True, **extra}
    r = client.post(
        "/api/nota_ventas/",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def test_subir_pdf(client, admin_token):
    nv = _make_nv(client, admin_token)
    r = client.post(
        f"/api/nota_ventas/{nv['id']}/adjuntos/",
        files={"file": ("oc-1234.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["nombre"] == "oc-1234.pdf"
    assert body["mime_type"] == "application/pdf"
    assert body["nv_id"] == nv["id"]


def test_subir_jpg_y_png(client, admin_token):
    nv = _make_nv(client, admin_token)
    for fname, ctype in [("oc.jpg", "image/jpeg"), ("oc.png", "image/png")]:
        r = client.post(
            f"/api/nota_ventas/{nv['id']}/adjuntos/",
            files={"file": (fname, io.BytesIO(b"binarydata"), ctype)},
            headers=_h(admin_token),
        )
        assert r.status_code == 201, f"{fname}: {r.text}"


def test_rechaza_otros_formatos(client, admin_token):
    nv = _make_nv(client, admin_token)
    r = client.post(
        f"/api/nota_ventas/{nv['id']}/adjuntos/",
        files={"file": ("a.txt", io.BytesIO(b"hi"), "text/plain")},
        headers=_h(admin_token),
    )
    assert r.status_code == 400


def test_listar(client, admin_token):
    nv = _make_nv(client, admin_token)
    client.post(
        f"/api/nota_ventas/{nv['id']}/adjuntos/",
        files={"file": ("a.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        headers=_h(admin_token),
    )
    r = client.get(f"/api/nota_ventas/{nv['id']}/adjuntos/", headers=_h(admin_token))
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_descargar(client, admin_token):
    nv = _make_nv(client, admin_token)
    payload = b"%PDF-1.4 contents"
    upload = client.post(
        f"/api/nota_ventas/{nv['id']}/adjuntos/",
        files={"file": ("doc.pdf", io.BytesIO(payload), "application/pdf")},
        headers=_h(admin_token),
    )
    adj_id = upload.json()["id"]
    r = client.get(
        f"/api/nota_ventas/{nv['id']}/adjuntos/{adj_id}/download",
        headers=_h(admin_token),
    )
    assert r.status_code == 200
    assert r.content == payload


def test_eliminar(client, admin_token):
    nv = _make_nv(client, admin_token)
    upload = client.post(
        f"/api/nota_ventas/{nv['id']}/adjuntos/",
        files={"file": ("d.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        headers=_h(admin_token),
    )
    adj_id = upload.json()["id"]
    r = client.delete(
        f"/api/nota_ventas/{nv['id']}/adjuntos/{adj_id}", headers=_h(admin_token)
    )
    assert r.status_code == 204
    r2 = client.get(f"/api/nota_ventas/{nv['id']}/adjuntos/", headers=_h(admin_token))
    assert r2.json() == []


def test_max_10_por_nv(client, admin_token):
    nv = _make_nv(client, admin_token)
    for i in range(10):
        r = client.post(
            f"/api/nota_ventas/{nv['id']}/adjuntos/",
            files={"file": (f"x{i}.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
            headers=_h(admin_token),
        )
        assert r.status_code == 201
    r = client.post(
        f"/api/nota_ventas/{nv['id']}/adjuntos/",
        files={"file": ("over.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        headers=_h(admin_token),
    )
    assert r.status_code == 400


def test_nv_inexistente(client, admin_token):
    r = client.post(
        "/api/nota_ventas/999999/adjuntos/",
        files={"file": ("a.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        headers=_h(admin_token),
    )
    assert r.status_code == 404


def test_numero_oc_cliente_persiste(client, admin_token):
    cid = _make_cliente(client, admin_token)
    r = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cid,
            "retiro_en_conico": True,
            "numero_oc_cliente": "OC-42",
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    assert r.json()["numero_oc_cliente"] == "OC-42"

    nv_id = r.json()["id"]
    r2 = client.patch(
        f"/api/nota_ventas/{nv_id}",
        json={"numero_oc_cliente": "OC-99"},
        headers=_h(admin_token),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["numero_oc_cliente"] == "OC-99"
