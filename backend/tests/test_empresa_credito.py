from decimal import Decimal


def _setup(db):
    from app.models.cliente import Cliente
    from app.models.empresa import Empresa
    from app.models.user import User
    from app.core.security import get_password_hash

    emp_sin = Empresa(nombre="SinCredito")
    emp_con = Empresa(nombre="ConCredito", linea_credito=Decimal("1000000"))
    c = Cliente(nombre="Test")
    u = User(email="v@credtest.cl", name="V", hashed_password=get_password_hash("x"), role="admin")
    db.add_all([emp_sin, emp_con, c, u])
    db.commit()
    for obj in [emp_sin, emp_con, c, u]:
        db.refresh(obj)
    return emp_sin, emp_con, c, u


def test_cotizacion_sin_credito_fuerza_al_contado(client, admin_token, db):
    emp_sin, _, c, u = _setup(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "vendedor_id": u.id, "empresa_id": emp_sin.id, "terminos_pago": "30 días", "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["terminos_pago"] == "al_contado"


def test_cotizacion_con_credito_respeta_terminos(client, admin_token, db):
    _, emp_con, c, u = _setup(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "vendedor_id": u.id, "empresa_id": emp_con.id, "terminos_pago": "30 días", "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["terminos_pago"] == "30 días"


def test_cotizacion_sin_empresa_respeta_terminos(client, admin_token, db):
    from app.models.cliente import Cliente
    from app.models.user import User
    from app.core.security import get_password_hash
    c = Cliente(nombre="SinEmp")
    u = User(email="v@noemptest.cl", name="V3", hashed_password=get_password_hash("x"), role="admin")
    db.add_all([c, u]); db.commit(); db.refresh(c); db.refresh(u)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "vendedor_id": u.id, "terminos_pago": "60 días", "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["terminos_pago"] == "60 días"
