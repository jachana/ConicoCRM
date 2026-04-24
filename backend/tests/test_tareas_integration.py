from datetime import date, timedelta

import pytest

from app.models.cotizacion import Cotizacion
from app.models.tarea import Tarea
from app.tasks.tareas import ejecutar_generacion


@pytest.fixture
def reglas_seeded(db):
    from app.models.regla_tarea import ReglaTarea
    reglas = [
        ReglaTarea(tipo="cotizacion_vence", activa=True, offset_dias=2, asignado_rol="owner"),
        ReglaTarea(tipo="factura_vencida", activa=True, offset_dias=1, asignado_rol="owner"),
        ReglaTarea(tipo="aprobacion_pendiente", activa=True, offset_dias=1, asignado_rol="admin"),
        ReglaTarea(tipo="nv_despachada_sin_avanzar", activa=True, offset_dias=3, asignado_rol="owner"),
        ReglaTarea(tipo="cliente_sin_actividad", activa=True, offset_dias=30, asignado_rol="owner"),
        ReglaTarea(tipo="stock_bajo_minimo", activa=True, offset_dias=0, asignado_rol="admin"),
    ]
    for r in reglas:
        db.add(r)
    db.commit()
    return reglas


def test_e2e_cotizacion_vence_lifecycle(
    client,
    db,
    admin_token,
    vendedor_token,
    vendedor_user,
    cliente_demo,
    reglas_seeded,
):
    # 1. Arrange: cotización que vence hoy+2 días → regla cotizacion_vence (offset=2) dispara hoy.
    # Fecha = hoy - 3, validez_dias = 5  →  vencimiento = hoy + 2  (queda dentro del offset)
    today = date.today()
    cot = Cotizacion(
        numero=77777,
        cliente_id=cliente_demo.id,
        vendedor_id=vendedor_user.id,
        fecha=today - timedelta(days=3),
        estado="abierta",
        validez_dias=5,
    )
    db.add(cot)
    db.commit()
    db.refresh(cot)

    # 2. Run generator → crea tarea auto
    ejecutar_generacion(db)

    tareas = db.query(Tarea).filter(Tarea.tipo_regla == "cotizacion_vence").all()
    assert len(tareas) == 1
    tarea = tareas[0]
    assert tarea.asignado_id == vendedor_user.id
    assert tarea.cotizacion_id == cot.id
    assert tarea.estado == "pendiente"
    assert tarea.origen == "auto"
    assert "77777" in tarea.titulo
    tarea_id = tarea.id

    # 3. Vendedor la ve en /mis-pendientes
    resp = client.get(
        "/api/tareas/mis-pendientes",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    titulos = [t["titulo"] for t in data["tareas"]]
    assert any("77777" in t for t in titulos), f"Tarea no encontrada en mis-pendientes: {titulos}"
    assert data["total"] >= 1

    # 4. Timeline por cotización devuelve la tarea
    resp = client.get(
        f"/api/tareas/timeline/cotizacion/{cot.id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["id"] == tarea_id
    assert items[0]["cotizacion_id"] == cot.id

    # 5. Vendedor completa la tarea → estado == "hecha"
    resp = client.post(
        f"/api/tareas/{tarea_id}/completar",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["estado"] == "hecha"
    assert resp.json()["completada_at"] is not None

    # Refrescar sesión local para ver cambios hechos vía API (otra sesión)
    db.expire_all()
    tarea_post = db.query(Tarea).filter(Tarea.id == tarea_id).first()
    assert tarea_post.estado == "hecha"

    # 6. Correr generador de nuevo → como la previa ya no está pendiente, dedup libera → nueva tarea
    ejecutar_generacion(db)

    tareas_all = (
        db.query(Tarea)
        .filter(Tarea.tipo_regla == "cotizacion_vence", Tarea.cotizacion_id == cot.id)
        .order_by(Tarea.id)
        .all()
    )
    assert len(tareas_all) == 2
    nueva = tareas_all[1]
    assert nueva.id != tarea_id
    assert nueva.estado == "pendiente"
    assert nueva.asignado_id == vendedor_user.id

    # 7. Cerrar la cotización → nuevo generador debe auto-descartar pendientes
    cot.estado = "cerrada_fv"
    db.commit()

    ejecutar_generacion(db)

    db.expire_all()
    pendientes = (
        db.query(Tarea)
        .filter(
            Tarea.tipo_regla == "cotizacion_vence",
            Tarea.cotizacion_id == cot.id,
            Tarea.estado == "pendiente",
        )
        .all()
    )
    assert len(pendientes) == 0, "Tareas pendientes deberían haberse auto-descartado"

    descartadas = (
        db.query(Tarea)
        .filter(
            Tarea.tipo_regla == "cotizacion_vence",
            Tarea.cotizacion_id == cot.id,
            Tarea.estado == "descartada",
        )
        .all()
    )
    assert len(descartadas) >= 1
    assert all(t.motivo_descarte == "evento resuelto" for t in descartadas)
