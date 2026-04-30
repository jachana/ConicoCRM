from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.models.notification import Notification
from app.models.user import User


@pytest.fixture
def otro_vendedor(db):
    user = User(
        email="otro_v@test.com",
        name="Otro V",
        hashed_password="x",
        role="vendedor",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_listar_vacio(client: TestClient, vendedor_token):
    resp = client.get("/api/notifications", headers=auth(vendedor_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["unread"] == 0


def test_unread_count_endpoint(client: TestClient, vendedor_token, vendedor_user, db):
    db.add(
        Notification(
            user_id=vendedor_user.id,
            tipo="tarea_asignada",
            titulo="A",
            payload={},
        )
    )
    db.add(
        Notification(
            user_id=vendedor_user.id,
            tipo="tarea_asignada",
            titulo="B",
            payload={},
        )
    )
    db.commit()
    resp = client.get(
        "/api/notifications/unread-count", headers=auth(vendedor_token)
    )
    assert resp.status_code == 200
    assert resp.json() == {"unread": 2}


def test_marcar_leida(client: TestClient, vendedor_token, vendedor_user, db):
    n = Notification(
        user_id=vendedor_user.id,
        tipo="tarea_asignada",
        titulo="A",
        payload={},
    )
    db.add(n)
    db.commit()
    db.refresh(n)

    resp = client.post(
        f"/api/notifications/{n.id}/read", headers=auth(vendedor_token)
    )
    assert resp.status_code == 200
    assert resp.json()["leida_at"] is not None

    # idempotente
    resp2 = client.post(
        f"/api/notifications/{n.id}/read", headers=auth(vendedor_token)
    )
    assert resp2.status_code == 200


def test_marcar_leida_otro_usuario_404(
    client: TestClient, vendedor_token, otro_vendedor, db
):
    n = Notification(
        user_id=otro_vendedor.id,
        tipo="tarea_asignada",
        titulo="X",
        payload={},
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    resp = client.post(
        f"/api/notifications/{n.id}/read", headers=auth(vendedor_token)
    )
    assert resp.status_code == 404


def test_read_all(client: TestClient, vendedor_token, vendedor_user, db):
    for i in range(3):
        db.add(
            Notification(
                user_id=vendedor_user.id,
                tipo="tarea_asignada",
                titulo=f"N{i}",
                payload={},
            )
        )
    db.commit()
    resp = client.post("/api/notifications/read-all", headers=auth(vendedor_token))
    assert resp.status_code == 200
    assert resp.json() == {"marked": 3}

    resp2 = client.get(
        "/api/notifications/unread-count", headers=auth(vendedor_token)
    )
    assert resp2.json() == {"unread": 0}


def test_filtro_unread_only(
    client: TestClient, vendedor_token, vendedor_user, db
):
    from datetime import datetime, timezone

    db.add(
        Notification(
            user_id=vendedor_user.id,
            tipo="tarea_asignada",
            titulo="leida",
            payload={},
            leida_at=datetime.now(timezone.utc),
        )
    )
    db.add(
        Notification(
            user_id=vendedor_user.id,
            tipo="tarea_asignada",
            titulo="no leida",
            payload={},
        )
    )
    db.commit()

    resp = client.get(
        "/api/notifications", params={"unread": True}, headers=auth(vendedor_token)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["titulo"] == "no leida"
    # unread count siempre refleja todas las no-leidas
    assert body["unread"] == 1


def test_eliminar(client: TestClient, vendedor_token, vendedor_user, db):
    n = Notification(
        user_id=vendedor_user.id,
        tipo="tarea_asignada",
        titulo="bye",
        payload={},
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    resp = client.delete(
        f"/api/notifications/{n.id}", headers=auth(vendedor_token)
    )
    assert resp.status_code == 204
    assert db.query(Notification).filter_by(id=n.id).first() is None


def test_eliminar_otro_404(
    client: TestClient, vendedor_token, otro_vendedor, db
):
    n = Notification(
        user_id=otro_vendedor.id,
        tipo="tarea_asignada",
        titulo="x",
        payload={},
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    resp = client.delete(
        f"/api/notifications/{n.id}", headers=auth(vendedor_token)
    )
    assert resp.status_code == 404


def test_no_auth_401(client: TestClient):
    resp = client.get("/api/notifications")
    assert resp.status_code == 401


def test_aislamiento_por_usuario(
    client: TestClient, vendedor_token, vendedor_user, otro_vendedor, db
):
    db.add(
        Notification(
            user_id=otro_vendedor.id,
            tipo="tarea_asignada",
            titulo="ajena",
            payload={},
        )
    )
    db.add(
        Notification(
            user_id=vendedor_user.id,
            tipo="tarea_asignada",
            titulo="propia",
            payload={},
        )
    )
    db.commit()

    resp = client.get("/api/notifications", headers=auth(vendedor_token))
    assert resp.status_code == 200
    titulos = [i["titulo"] for i in resp.json()["items"]]
    assert titulos == ["propia"]


def test_hook_tarea_creada_genera_notificacion(
    client: TestClient, admin_token, admin_user, vendedor_user, db
):
    resp = client.post(
        "/api/tareas",
        json={
            "titulo": "Llamar cliente",
            "due_date": str(date.today() + timedelta(days=1)),
            "asignado_id": vendedor_user.id,
        },
        headers=auth(admin_token),
    )
    assert resp.status_code == 201

    notes = (
        db.query(Notification)
        .filter(Notification.user_id == vendedor_user.id)
        .all()
    )
    assert len(notes) == 1
    n = notes[0]
    assert n.tipo == "tarea_asignada"
    assert "Llamar cliente" in n.titulo
    assert n.payload["creado_por_id"] == admin_user.id


def test_hook_self_assign_no_genera_notificacion(
    client: TestClient, vendedor_token, vendedor_user, db
):
    resp = client.post(
        "/api/tareas",
        json={
            "titulo": "Tarea propia",
            "due_date": str(date.today() + timedelta(days=1)),
            "asignado_id": vendedor_user.id,
        },
        headers=auth(vendedor_token),
    )
    assert resp.status_code == 201
    n = (
        db.query(Notification)
        .filter(Notification.user_id == vendedor_user.id)
        .count()
    )
    assert n == 0


def test_hook_reasignacion_genera_notificacion(
    client: TestClient, admin_token, admin_user, vendedor_user, otro_vendedor, db
):
    # admin crea tarea asignada a vendedor
    r = client.post(
        "/api/tareas",
        json={
            "titulo": "T",
            "due_date": str(date.today() + timedelta(days=1)),
            "asignado_id": vendedor_user.id,
        },
        headers=auth(admin_token),
    )
    assert r.status_code == 201
    tid = r.json()["id"]

    # admin reasigna
    r2 = client.post(
        f"/api/tareas/{tid}/reasignar",
        json={"asignado_id": otro_vendedor.id},
        headers=auth(admin_token),
    )
    assert r2.status_code == 200

    # otro_vendedor recibe notificación
    notes = (
        db.query(Notification)
        .filter(Notification.user_id == otro_vendedor.id)
        .all()
    )
    assert len(notes) == 1
    assert notes[0].tipo == "tarea_asignada"
    assert "reasignada" in notes[0].titulo.lower()
