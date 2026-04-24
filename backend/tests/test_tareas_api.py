from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.models.user import User


@pytest.fixture
def otro_vendedor(db):
    user = User(
        email="otro_vendedor@test.com",
        name="Otro",
        hashed_password="x",
        role="vendedor",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_crear_tarea_manual_vendedor_solo_a_si_mismo(
    client: TestClient, vendedor_token, vendedor_user, otro_vendedor
):
    resp = client.post(
        "/api/tareas",
        json={
            "titulo": "Llamar cliente",
            "due_date": str(date.today() + timedelta(days=1)),
            "asignado_id": vendedor_user.id,
        },
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["origen"] == "manual"
    assert data["asignado_id"] == vendedor_user.id

    # Intentar asignar a otro vendedor → 403
    resp2 = client.post(
        "/api/tareas",
        json={
            "titulo": "Otro",
            "due_date": str(date.today()),
            "asignado_id": otro_vendedor.id,
        },
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp2.status_code == 403


def test_crear_tarea_max_una_fk_valida_body(
    client: TestClient, admin_token, admin_user, cliente_demo, empresa_demo
):
    resp = client.post(
        "/api/tareas",
        json={
            "titulo": "Bad",
            "due_date": str(date.today()),
            "asignado_id": admin_user.id,
            "cliente_id": cliente_demo.id,
            "empresa_id": empresa_demo.id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


def test_listar_tareas_vendedor_solo_ve_propias(
    client, vendedor_token, vendedor_user, admin_user, db
):
    from app.models.tarea import Tarea

    db.add(Tarea(titulo="mine", due_date=date.today(), origen="manual", asignado_id=vendedor_user.id))
    db.add(Tarea(titulo="other", due_date=date.today(), origen="manual", asignado_id=admin_user.id))
    db.commit()

    resp = client.get("/api/tareas", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 200
    data = resp.json()
    titulos = [t["titulo"] for t in data["items"]]
    assert "mine" in titulos
    assert "other" not in titulos
    assert all(t["asignado_id"] == vendedor_user.id for t in data["items"])


def test_listar_tareas_admin_ve_todas(
    client, admin_token, vendedor_user, admin_user, db
):
    from app.models.tarea import Tarea

    db.add(Tarea(titulo="a", due_date=date.today(), origen="manual", asignado_id=vendedor_user.id))
    db.add(Tarea(titulo="b", due_date=date.today(), origen="manual", asignado_id=admin_user.id))
    db.commit()

    resp = client.get("/api/tareas", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    titulos = {t["titulo"] for t in resp.json()["items"]}
    assert {"a", "b"}.issubset(titulos)


def test_listar_filtra_por_cliente_id(
    client, admin_token, cliente_demo, admin_user, db
):
    from app.models.tarea import Tarea

    db.add(
        Tarea(
            titulo="con cliente",
            due_date=date.today(),
            origen="manual",
            asignado_id=admin_user.id,
            cliente_id=cliente_demo.id,
        )
    )
    db.add(
        Tarea(
            titulo="sin cliente",
            due_date=date.today(),
            origen="manual",
            asignado_id=admin_user.id,
        )
    )
    db.commit()

    resp = client.get(
        f"/api/tareas?cliente_id={cliente_demo.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    titulos = [t["titulo"] for t in resp.json()["items"]]
    assert "con cliente" in titulos
    assert "sin cliente" not in titulos


def test_get_detail_403_si_no_es_dueno_ni_admin(client, vendedor_token, otro_vendedor, db):
    from app.models.tarea import Tarea
    t = Tarea(titulo="x", due_date=date.today(), origen="manual", asignado_id=otro_vendedor.id)
    db.add(t); db.commit()
    resp = client.get(f"/api/tareas/{t.id}", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 403


def test_patch_auto_protege_titulo(client, admin_token, admin_user, db):
    from app.models.tarea import Tarea
    t = Tarea(titulo="orig", due_date=date.today(), origen="auto", tipo_regla="cotizacion_vence",
              dedup_key="cotizacion_vence:99", asignado_id=admin_user.id)
    db.add(t); db.commit()
    resp = client.patch(f"/api/tareas/{t.id}",
                        json={"titulo": "nuevo"},
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 400  # titulo protegido en auto


def test_delete_solo_manual(client, admin_token, admin_user, db):
    from app.models.tarea import Tarea
    t_manual = Tarea(titulo="m", due_date=date.today(), origen="manual",
                     asignado_id=admin_user.id, creado_por_id=admin_user.id)
    t_auto = Tarea(titulo="a", due_date=date.today(), origen="auto",
                   tipo_regla="cotizacion_vence", dedup_key="cotizacion_vence:77",
                   asignado_id=admin_user.id)
    db.add_all([t_manual, t_auto]); db.commit()

    r1 = client.delete(f"/api/tareas/{t_manual.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r1.status_code == 204
    r2 = client.delete(f"/api/tareas/{t_auto.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 400


def test_delete_403_si_no_creador_ni_admin(client, vendedor_token, otro_vendedor, db):
    from app.models.tarea import Tarea
    t = Tarea(titulo="x", due_date=date.today(), origen="manual",
              asignado_id=otro_vendedor.id, creado_por_id=otro_vendedor.id)
    db.add(t)
    db.commit()
    resp = client.delete(f"/api/tareas/{t.id}",
                         headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 403
