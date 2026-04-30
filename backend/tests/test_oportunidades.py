"""Tests for Tier A #6 — Pipeline / Oportunidades."""
import pytest

from tests.conftest import TestingSession


@pytest.fixture
def etapas_seed():
    """Seed the default pipeline stages (migration does this in prod)."""
    from app.models.oportunidad import OportunidadEtapa, DEFAULT_ETAPAS

    db = TestingSession()
    try:
        for cfg in DEFAULT_ETAPAS:
            db.add(OportunidadEtapa(**cfg))
        db.commit()
        rows = (
            db.query(OportunidadEtapa).order_by(OportunidadEtapa.orden).all()
        )
        return [{"id": r.id, "nombre": r.nombre, "orden": r.orden} for r in rows]
    finally:
        db.close()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_listar_etapas_returns_seeded(client, admin_token, etapas_seed):
    r = client.get("/api/oportunidades/etapas", headers=_auth(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 6
    assert [e["nombre"] for e in data] == [
        "Lead", "Calificada", "Propuesta", "Negociación", "Ganada", "Perdida",
    ]


def test_admin_can_create_custom_etapa(client, admin_token, etapas_seed):
    r = client.post(
        "/api/oportunidades/etapas",
        json={"nombre": "Demo Realizada", "orden": 35, "color": "#000000"},
        headers=_auth(admin_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["nombre"] == "Demo Realizada"


def test_vendedor_cannot_manage_etapas(client, vendedor_token, etapas_seed):
    r = client.post(
        "/api/oportunidades/etapas",
        json={"nombre": "X", "orden": 99},
        headers=_auth(vendedor_token),
    )
    # vendedor lacks cotizaciones:edit -> 403 from has_permission check
    # OR passes that check but is rejected by role guard inside handler.
    assert r.status_code == 403


def test_create_oportunidad_defaults_first_active_stage(
    client, admin_token, etapas_seed, cliente_demo
):
    r = client.post(
        "/api/oportunidades",
        json={"titulo": "Deal grande", "cliente_id": cliente_demo.id, "monto_estimado": "1500.00"},
        headers=_auth(admin_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["etapa_nombre"] == "Lead"
    assert body["cliente_id"] == cliente_demo.id
    assert float(body["monto_estimado"]) == 1500.0


def test_pipeline_groups_by_etapa(client, admin_token, etapas_seed, cliente_demo):
    for i in range(3):
        client.post(
            "/api/oportunidades",
            json={"titulo": f"Deal {i}", "cliente_id": cliente_demo.id, "monto_estimado": "100.00"},
            headers=_auth(admin_token),
        )
    r = client.get("/api/oportunidades/pipeline", headers=_auth(admin_token))
    assert r.status_code == 200
    data = r.json()
    lead = next(g for g in data["etapas"] if g["etapa"]["nombre"] == "Lead")
    assert lead["count"] == 3
    assert float(lead["total_monto"]) == 300.0


def test_move_to_won_stage_marks_won_at(
    client, admin_token, etapas_seed, cliente_demo
):
    create = client.post(
        "/api/oportunidades",
        json={"titulo": "Won deal", "cliente_id": cliente_demo.id, "monto_estimado": "200"},
        headers=_auth(admin_token),
    )
    op_id = create.json()["id"]
    won_id = next(e["id"] for e in etapas_seed if e["nombre"] == "Ganada")

    r = client.post(
        f"/api/oportunidades/{op_id}/move",
        json={"etapa_id": won_id},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_terminal_won"] is True
    assert body["won_at"] is not None
    assert body["lost_at"] is None


def test_move_to_lost_stage_records_motivo(
    client, admin_token, etapas_seed, cliente_demo
):
    create = client.post(
        "/api/oportunidades",
        json={"titulo": "Lost deal", "cliente_id": cliente_demo.id},
        headers=_auth(admin_token),
    )
    op_id = create.json()["id"]
    lost_id = next(e["id"] for e in etapas_seed if e["nombre"] == "Perdida")

    r = client.post(
        f"/api/oportunidades/{op_id}/move",
        json={"etapa_id": lost_id, "motivo_perdida": "Precio fuera de presupuesto"},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_terminal_lost"] is True
    assert body["lost_at"] is not None
    assert body["motivo_perdida"] == "Precio fuera de presupuesto"


def test_convert_to_cotizacion_creates_linked_cot(
    client, admin_token, etapas_seed, cliente_demo
):
    create = client.post(
        "/api/oportunidades",
        json={
            "titulo": "Convertir deal",
            "cliente_id": cliente_demo.id,
            "monto_estimado": "500.00",
            "descripcion": "Notas previas",
        },
        headers=_auth(admin_token),
    )
    op_id = create.json()["id"]

    r = client.post(
        f"/api/oportunidades/{op_id}/convert",
        headers=_auth(admin_token),
    )
    assert r.status_code == 201, r.text
    payload = r.json()
    assert payload["cotizacion_id"]
    assert payload["cotizacion_numero"]

    # Conflict on second conversion attempt.
    again = client.post(
        f"/api/oportunidades/{op_id}/convert", headers=_auth(admin_token)
    )
    assert again.status_code == 409


def test_convert_requires_cliente(client, admin_token, etapas_seed):
    create = client.post(
        "/api/oportunidades",
        json={"titulo": "Sin cliente", "monto_estimado": "100"},
        headers=_auth(admin_token),
    )
    op_id = create.json()["id"]
    r = client.post(
        f"/api/oportunidades/{op_id}/convert", headers=_auth(admin_token)
    )
    assert r.status_code == 400


def test_vendedor_only_sees_own_oportunidades(
    client, admin_token, vendedor_token, vendedor_user, etapas_seed, cliente_demo
):
    # Admin creates one assigned to themselves (defaults vendedor_id to creator).
    client.post(
        "/api/oportunidades",
        json={"titulo": "Admin's deal", "cliente_id": cliente_demo.id},
        headers=_auth(admin_token),
    )
    # Vendedor creates one — vendedor_id should be forced to themselves.
    own = client.post(
        "/api/oportunidades",
        json={"titulo": "Vendedor's deal", "cliente_id": cliente_demo.id},
        headers=_auth(vendedor_token),
    )
    assert own.status_code == 201, own.text
    assert own.json()["vendedor_id"] == vendedor_user.id

    listing = client.get(
        "/api/oportunidades", headers=_auth(vendedor_token)
    ).json()
    assert all(o["vendedor_id"] == vendedor_user.id for o in listing)
    assert any(o["titulo"] == "Vendedor's deal" for o in listing)
    assert not any(o["titulo"] == "Admin's deal" for o in listing)


def test_reporte_conversion_counts(
    client, admin_token, etapas_seed, cliente_demo
):
    won_id = next(e["id"] for e in etapas_seed if e["nombre"] == "Ganada")
    lost_id = next(e["id"] for e in etapas_seed if e["nombre"] == "Perdida")

    # 2 won, 1 lost, 1 abierta (Lead)
    for monto, etapa_id in [(100, won_id), (200, won_id), (50, lost_id), (300, None)]:
        body = {"titulo": "Deal", "cliente_id": cliente_demo.id, "monto_estimado": str(monto)}
        if etapa_id:
            body["etapa_id"] = etapa_id
        client.post("/api/oportunidades", json=body, headers=_auth(admin_token))

    r = client.get(
        "/api/oportunidades/reportes/conversion", headers=_auth(admin_token)
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ganadas"] == 2
    assert data["perdidas"] == 1
    assert data["abiertas"] == 1
    assert float(data["monto_ganado"]) == 300.0
    assert float(data["monto_perdido"]) == 50.0
    assert float(data["monto_pipeline"]) == 300.0
    assert data["tasa_conversion"] == pytest.approx(2 / 3)


def test_etapa_in_use_cannot_be_deleted(
    client, admin_token, etapas_seed, cliente_demo
):
    # Create an oportunidad on the Lead stage.
    lead_id = next(e["id"] for e in etapas_seed if e["nombre"] == "Lead")
    client.post(
        "/api/oportunidades",
        json={"titulo": "x", "cliente_id": cliente_demo.id, "etapa_id": lead_id},
        headers=_auth(admin_token),
    )
    r = client.delete(
        f"/api/oportunidades/etapas/{lead_id}", headers=_auth(admin_token)
    )
    assert r.status_code == 409
