from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import pytest
from freezegun import freeze_time

from app.models.tarea import Tarea
from app.models.cotizacion import Cotizacion
from app.models.factura import Factura
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


@freeze_time("2026-05-01")
def test_cotizacion_vence_genera_tarea(db, cliente_demo, vendedor_user, reglas_seeded):
    cot = Cotizacion(
        numero=99001, cliente_id=cliente_demo.id, vendedor_id=vendedor_user.id,
        fecha=date(2026, 4, 28),
        estado="abierta", validez_dias=5,
    )
    db.add(cot); db.commit()

    ejecutar_generacion(db)

    tareas = db.query(Tarea).filter(Tarea.tipo_regla == "cotizacion_vence").all()
    assert len(tareas) == 1
    assert tareas[0].asignado_id == vendedor_user.id
    assert tareas[0].cotizacion_id == cot.id


@freeze_time("2026-05-01")
def test_cotizacion_vence_idempotente(db, cliente_demo, vendedor_user, reglas_seeded):
    cot = Cotizacion(
        numero=99002, cliente_id=cliente_demo.id, vendedor_id=vendedor_user.id,
        fecha=date(2026, 4, 28), estado="abierta", validez_dias=5,
    )
    db.add(cot); db.commit()

    ejecutar_generacion(db)
    ejecutar_generacion(db)

    tareas = db.query(Tarea).filter(Tarea.tipo_regla == "cotizacion_vence").all()
    assert len(tareas) == 1


@freeze_time("2026-05-01")
def test_cotizacion_auto_descarte_al_cerrar(db, cliente_demo, vendedor_user, reglas_seeded):
    cot = Cotizacion(
        numero=99003, cliente_id=cliente_demo.id, vendedor_id=vendedor_user.id,
        fecha=date(2026, 4, 28), estado="abierta", validez_dias=5,
    )
    db.add(cot); db.commit()
    ejecutar_generacion(db)

    cot.estado = "cerrada_fv"
    db.commit()
    ejecutar_generacion(db)

    tareas = db.query(Tarea).filter(Tarea.tipo_regla == "cotizacion_vence").all()
    assert len(tareas) == 1
    assert tareas[0].estado == "descartada"
    assert tareas[0].motivo_descarte == "evento resuelto"


@freeze_time("2026-05-01")
def test_factura_vencida_genera_tarea(db, cliente_demo, empresa_demo, vendedor_user, reglas_seeded):
    f = Factura(
        numero=1001, cliente_id=cliente_demo.id, empresa_id=empresa_demo.id,
        vendedor_id=vendedor_user.id, fecha=date(2026, 4, 1),
        fecha_vencimiento=date(2026, 4, 29),
        estado="emitida", total=Decimal("10000"),
    )
    db.add(f); db.commit()

    ejecutar_generacion(db)

    tareas = db.query(Tarea).filter(Tarea.tipo_regla == "factura_vencida").all()
    assert len(tareas) == 1
    assert tareas[0].factura_id == f.id


@freeze_time("2026-05-01")
def test_aprobacion_pendiente_credito(db, admin_user, vendedor_user, reglas_seeded):
    from app.models.aprobacion_credito import AprobacionCredito
    a = AprobacionCredito(
        origen="directa",
        estado="pendiente",
        vendedor_id=vendedor_user.id,
        created_at=datetime(2026, 4, 29, tzinfo=timezone.utc),
    )
    db.add(a); db.commit()

    ejecutar_generacion(db)
    tareas = db.query(Tarea).filter(Tarea.tipo_regla == "aprobacion_pendiente").all()
    assert len(tareas) == 1
    assert tareas[0].asignado_id == admin_user.id


@freeze_time("2026-05-01")
def test_nv_despachada_sin_avanzar(db, cliente_demo, vendedor_user, reglas_seeded):
    from app.models.nota_venta import NotaVenta
    nv = NotaVenta(
        numero=5001,
        cliente_id=cliente_demo.id,
        vendedor_id=vendedor_user.id,
        fecha=date(2026, 4, 25),
        estado="despachada",
        updated_at=datetime(2026, 4, 26, tzinfo=timezone.utc),
        total=Decimal("10000"),
    )
    db.add(nv); db.commit()

    ejecutar_generacion(db)
    tareas = db.query(Tarea).filter(Tarea.tipo_regla == "nv_despachada_sin_avanzar").all()
    assert len(tareas) == 1
    assert tareas[0].nota_venta_id == nv.id
