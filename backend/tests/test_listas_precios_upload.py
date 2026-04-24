import io
from decimal import Decimal
from datetime import datetime, timezone

import openpyxl


def _xlsx(rows, header=("sku", "costo")):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(header))
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def test_upload_updates_matching_productos(client, admin_token, db):
    from app.models.producto import Producto
    p1 = Producto(nombre="A", sku="ABC-1", precio_costo=Decimal("10"))
    p2 = Producto(nombre="B", sku="XYZ-2", precio_costo=Decimal("20"))
    db.add_all([p1, p2]); db.commit()

    buf = _xlsx([("ABC-1", 100), ("XYZ-2", 200), ("NOT-IN-DB", 999)])
    resp = client.post(
        "/api/listas-precios/",
        files={"archivo": ("lista.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total_filas"] == 3
    assert body["productos_actualizados"] == 2
    assert body["skus_sin_producto"] == ["NOT-IN-DB"]

    db.refresh(p1); db.refresh(p2)
    assert p1.precio_costo == Decimal("100")
    assert p2.precio_costo == Decimal("200")
    assert p1.precio_costo_actualizado_en is not None


def test_upload_archives_previous_active_list(client, admin_token, db):
    buf1 = _xlsx([("A", 10)])
    client.post("/api/listas-precios/", files={"archivo": ("a.xlsx", buf1, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers={"Authorization": f"Bearer {admin_token}"})
    buf2 = _xlsx([("A", 20)])
    client.post("/api/listas-precios/", files={"archivo": ("b.xlsx", buf2, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers={"Authorization": f"Bearer {admin_token}"})

    resp = client.get("/api/listas-precios/", headers={"Authorization": f"Bearer {admin_token}"})
    rows = resp.json()["items"]
    assert len(rows) == 2
    activas = [r for r in rows if r["activa"]]
    assert len(activas) == 1
    assert activas[0]["nombre_archivo"] == "b.xlsx"


def test_upload_refreshes_actualizado_en_even_if_cost_same(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="ABC", precio_costo=Decimal("50"))
    db.add(p); db.commit()

    buf1 = _xlsx([("ABC", 50)])
    client.post("/api/listas-precios/", files={"archivo": ("a.xlsx", buf1, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers={"Authorization": f"Bearer {admin_token}"})
    db.refresh(p)
    first_ts = p.precio_costo_actualizado_en
    assert first_ts is not None

    buf2 = _xlsx([("ABC", 50)])
    client.post("/api/listas-precios/", files={"archivo": ("b.xlsx", buf2, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers={"Authorization": f"Bearer {admin_token}"})
    db.refresh(p)
    assert p.precio_costo_actualizado_en > first_ts


def test_upload_keeps_cost_for_products_not_in_new_list(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="ABC", precio_costo=Decimal("50"))
    db.add(p); db.commit()

    buf = _xlsx([("OTHER-SKU", 100)])
    client.post("/api/listas-precios/", files={"archivo": ("a.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers={"Authorization": f"Bearer {admin_token}"})
    db.refresh(p)
    assert p.precio_costo == Decimal("50")
    assert p.precio_costo_actualizado_en is None


def test_upload_rejects_duplicate_sku(client, admin_token):
    buf = _xlsx([("ABC", 10), ("ABC", 20)])
    resp = client.post(
        "/api/listas-precios/",
        files={"archivo": ("dup.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400


def test_upload_requires_admin(client, vendedor_token):
    buf = _xlsx([("A", 10)])
    resp = client.post(
        "/api/listas-precios/",
        files={"archivo": ("a.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403
