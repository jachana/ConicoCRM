import io


def _make_prod(client, token, nombre="ProdDoc"):
    return client.post("/api/productos/", json={"nombre": nombre, "precio_venta": "10"},
                       headers={"Authorization": f"Bearer {token}"}).json()


def test_subir_pdf(client, admin_token):
    prod = _make_prod(client, admin_token)
    pdf_content = b"%PDF-1.4 fake"
    resp = client.post(
        f"/api/productos/{prod['id']}/documentos/",
        files={"file": ("ficha.pdf", io.BytesIO(pdf_content), "application/pdf")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["nombre"] == "ficha.pdf"


def test_listar_documentos(client, admin_token):
    prod = _make_prod(client, admin_token, "ProdDoc2")
    client.post(f"/api/productos/{prod['id']}/documentos/",
                files={"file": ("a.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
                headers={"Authorization": f"Bearer {admin_token}"})
    resp = client.get(f"/api/productos/{prod['id']}/documentos/",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_max_5_documentos(client, admin_token):
    prod = _make_prod(client, admin_token, "ProdDoc3")
    for i in range(5):
        client.post(f"/api/productos/{prod['id']}/documentos/",
                    files={"file": (f"f{i}.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
                    headers={"Authorization": f"Bearer {admin_token}"})
    resp = client.post(f"/api/productos/{prod['id']}/documentos/",
                       files={"file": ("extra.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
                       headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 400


def test_rechaza_no_pdf(client, admin_token):
    prod = _make_prod(client, admin_token, "ProdDoc4")
    resp = client.post(f"/api/productos/{prod['id']}/documentos/",
                       files={"file": ("img.png", io.BytesIO(b"PNG"), "image/png")},
                       headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 400


def test_eliminar_documento(client, admin_token):
    prod = _make_prod(client, admin_token, "ProdDoc5")
    doc = client.post(f"/api/productos/{prod['id']}/documentos/",
                      files={"file": ("del.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
                      headers={"Authorization": f"Bearer {admin_token}"}).json()
    resp = client.delete(f"/api/productos/{prod['id']}/documentos/{doc['id']}",
                         headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 204
