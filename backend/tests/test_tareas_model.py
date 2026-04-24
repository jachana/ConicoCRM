from datetime import date, timedelta
import pytest
from sqlalchemy.exc import IntegrityError

from app.models.tarea import Tarea
from app.models.regla_tarea import ReglaTarea
from app.models.user import User


@pytest.fixture
def tareas_user(db):
    user = User(email="tareas_owner@test.com", name="Owner", hashed_password="x", role="admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_tarea_creada_con_defaults(db, tareas_user):
    t = Tarea(
        titulo="Llamar cliente",
        due_date=date.today() + timedelta(days=1),
        origen="manual",
        asignado_id=tareas_user.id,
        creado_por_id=tareas_user.id,
    )
    db.add(t)
    db.commit()
    assert t.id is not None
    assert t.estado == "pendiente"
    assert t.descripcion is None


def test_check_constraint_max_una_fk(db, tareas_user, cliente_demo, empresa_demo):
    t = Tarea(
        titulo="Bad",
        due_date=date.today(),
        origen="manual",
        asignado_id=tareas_user.id,
        cliente_id=cliente_demo.id,
        empresa_id=empresa_demo.id,
    )
    db.add(t)
    with pytest.raises(IntegrityError):
        db.commit()


def test_dedup_key_unique_parcial_solo_pendiente(db, tareas_user):
    t1 = Tarea(
        titulo="x", due_date=date.today(), origen="auto",
        tipo_regla="cotizacion_vence", dedup_key="cotizacion_vence:1",
        asignado_id=tareas_user.id,
    )
    db.add(t1)
    db.commit()

    t2 = Tarea(
        titulo="x", due_date=date.today(), origen="auto",
        tipo_regla="cotizacion_vence", dedup_key="cotizacion_vence:1",
        asignado_id=tareas_user.id,
    )
    db.add(t2)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    t1.estado = "descartada"
    t1.motivo_descarte = "test"
    db.commit()

    t3 = Tarea(
        titulo="x", due_date=date.today(), origen="auto",
        tipo_regla="cotizacion_vence", dedup_key="cotizacion_vence:1",
        asignado_id=tareas_user.id,
    )
    db.add(t3)
    db.commit()
    assert t3.id != t1.id


def test_regla_tarea_seed_placeholders(db):
    r = ReglaTarea(tipo="cotizacion_vence", offset_dias=-1, asignado_rol="vendedor_asignado")
    db.add(r)
    db.commit()
    assert r.id is not None
    assert r.activa is True
