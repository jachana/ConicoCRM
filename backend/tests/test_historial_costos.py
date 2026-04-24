import io
import openpyxl


def _xlsx(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["sku", "costo"])
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return buf


def test_historial_costos_returns_all_lists_for_sku(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="ABC")
    db.add(p); db.commit()

    for nombre, costo in [("lista1.xlsx", 100), ("lista2.xlsx", 120), ("lista3.xlsx", 150)]:
        buf = _xlsx([("ABC", costo)])
        client.post("/api/listas-precios/", files={"archivo": (nombre, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                    headers={"Authorization": f"Bearer {admin_token}"})

    resp = client.get(f"/api/productos/{p.id}/historial-costos", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 3
    costos = [b["costo_unitario"] for b in body]
    assert set(costos) == {"100.00", "120.00", "150.00"}
    # most recent first
    assert body[0]["nombre_archivo"] == "lista3.xlsx"


def test_historial_costos_requires_admin(client, vendedor_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="ABC")
    db.add(p); db.commit()
    resp = client.get(f"/api/productos/{p.id}/historial-costos", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 403
