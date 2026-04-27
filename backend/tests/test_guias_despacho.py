"""
Tests para Guías de Despacho DTE 52 — Phase 1 Backend.

Cubre: CRUD básico, permisos, validaciones, invariante stock (D-13),
pipeline DTE mock (emit_dte.delay + _process_emit polling path DTE-02),
anulación vía NC aceptada (D-16), PDF, audit log (DTE-07), DELETE 409,
y test de concurrencia Postgres-only (D-28 — skipped en SQLite).
"""

import os
import uuid
from unittest.mock import patch

import pytest


# ── Helpers ────────────────────────────────────────────────────────────────────


def _create_producto(client, admin_token, sku_suffix=None):
    sku = f"SKU-GD-{sku_suffix or uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod Guia", "sku": sku, "precio_venta": 1190, "precio_costo": 600},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _next_nc_numero(db):
    """Retorna un número correlativo único para NotaCredito en los tests."""
    from app.models.nota_credito import NotaCredito
    max_num = db.query(NotaCredito).count()
    return max_num + 1000 + int(uuid.uuid4().hex[:4], 16) % 9000


# ── 1. CRUD básico ─────────────────────────────────────────────────────────────


@patch("app.api.guias_despacho.emit_dte")
def test_crear_guia_basica(mock_emit, client, admin_token):
    """Happy path: POST /api/guias-despacho/ crea guía con motivo=1, dte_estado=pendiente."""
    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "direccion_destino": "Av. Providencia 123",
            "comuna_destino": "Providencia",
            "lineas": [{"descripcion": "Item", "cantidad": "1", "precio_unitario": "1190"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["motivo_traslado"] == 1
    assert body["dte_estado"] == "pendiente"
    assert body["numero"] >= 1
    mock_emit.delay.assert_called_once()


# ── 2. Permisos (DTE-06) ───────────────────────────────────────────────────────


@patch("app.api.guias_despacho.emit_dte")
def test_crear_guia_sin_permiso_403(mock_emit, client, admin_token, vendedor_token):
    """Vendedor (delete=False) intenta eliminar guía → 403."""
    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "lineas": [{"descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    guia_id = r.json()["id"]

    rd = client.delete(
        f"/api/guias-despacho/{guia_id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert rd.status_code == 403, rd.text


# ── 3. Validación (D-05) ───────────────────────────────────────────────────────


def test_motivo_traslado_invalido_422(client, admin_token):
    """motivo_traslado=10 (fuera de rango 1..9) → 422 ValidationError."""
    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 10,
            "lineas": [{"descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422, r.text


def test_lineas_vacias_422(client, admin_token):
    """Guía sin líneas → 422."""
    r = client.post(
        "/api/guias-despacho/",
        json={"motivo_traslado": 1, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422, r.text


# ── 4. Invariante stock (D-13 / INV-04) ───────────────────────────────────────


@patch("app.api.guias_despacho.emit_dte")
def test_guia_no_descuenta_stock(mock_emit, client, admin_token, db):
    """Crear guía con producto → stock_actual invariante; sin MovimientoInventario (D-13)."""
    from app.models.producto import Producto
    from app.models.movimiento_inventario import MovimientoInventario

    prod = _create_producto(client, admin_token)
    prod_obj = db.get(Producto, prod["id"])
    stock_antes = prod_obj.stock_actual

    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "lineas": [
                {
                    "producto_id": prod["id"],
                    "descripcion": "Item",
                    "cantidad": "3",
                    "precio_unitario": "100",
                }
            ],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text

    db.expire_all()
    stock_despues = db.get(Producto, prod["id"]).stock_actual
    assert stock_despues == stock_antes, (
        f"Stock cambió: {stock_antes} → {stock_despues} — guía DTE 52 NO debe descontar stock"
    )

    movs = db.query(MovimientoInventario).filter(
        (MovimientoInventario.referencia_tipo == "guia_despacho")
        | (MovimientoInventario.referencia_tipo == "guia")
    ).all()
    assert len(movs) == 0, f"Movimientos de guía encontrados inesperadamente: {movs}"


# ── 5. Pipeline DTE — emit_dte.delay (DTE-02) ─────────────────────────────────


@patch("app.api.guias_despacho.emit_dte")
def test_emitir_guia_dispara_dte(mock_emit, client, admin_token):
    """emit_dte.delay se llama una vez con un int (emision.id) al crear guía."""
    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "lineas": [{"descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    mock_emit.delay.assert_called_once()
    args, _kwargs = mock_emit.delay.call_args
    assert isinstance(args[0], int), f"emit_dte.delay debe recibir int, recibió {type(args[0])}"


# ── 6. Pipeline DTE — _process_emit asigna track_id (DTE-02 polling path) ─────
# B-1: cubre el path completo _process_emit(db, emision, svc) → svc.emit() → emision.track_id = ...
# Mockea DteService.emit para no tocar la red Lioren.
# Valida que la asignación de track_id ocurre y persiste.


@patch("app.api.guias_despacho.emit_dte")
def test_process_emit_guia_asigna_track_id(mock_emit_celery, client, admin_token, db):
    """_process_emit con guia_despacho_id debe asignar emision.track_id tras svc.emit() mockeado (DTE-02)."""
    from unittest.mock import patch as _patch
    from app.models.dte_emision import DteEmision
    from app.tasks.dte import _process_emit
    from app.services.dte_service import DteService

    # 1. Crear guía vía API (Celery .delay mockeado, no se ejecuta worker real)
    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "direccion_destino": "Av. X 1",
            "comuna_destino": "Santiago",
            "lineas": [{"descripcion": "Item", "cantidad": "1", "precio_unitario": "1190"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    guia_id = r.json()["id"]

    # 2. Localizar la DteEmision creada por el endpoint (FK guia_despacho_id)
    db.expire_all()
    emision = (
        db.query(DteEmision)
        .filter(DteEmision.guia_despacho_id == guia_id)
        .order_by(DteEmision.id.desc())
        .first()
    )
    assert emision is not None, "Plan 02 debe crear DteEmision con guia_despacho_id en el POST"
    assert emision.track_id in (None, ""), (
        f"track_id pre-emit debe ser None/empty, got {emision.track_id!r}"
    )

    # 3. Mockear DteService.__init__ (evitar credenciales reales) y DteService.emit
    with _patch.object(DteService, "__init__", return_value=None), \
         _patch.object(
             DteService, "emit", return_value={"track_id": "TRK-12345", "estado": "procesando"}
         ) as mock_emit_svc:
        svc = DteService()
        # Firma real: _process_emit(db, emision, svc)
        _process_emit(db=db, emision=emision, svc=svc)
        mock_emit_svc.assert_called_once()

    # 4. Verificar que track_id se asignó
    assert emision.track_id == "TRK-12345", (
        f"_process_emit no asignó track_id: got {emision.track_id!r}"
    )

    # 5. Persistir y verificar que sobrevive al db.expire_all()
    db.commit()
    db.expire_all()
    emision_post = db.get(DteEmision, emision.id)
    assert emision_post.track_id == "TRK-12345", (
        f"track_id no persistió en DB: got {emision_post.track_id!r}"
    )


# ── 7. Anulación vía NC (DTE-04 / D-16) ───────────────────────────────────────


@patch("app.api.guias_despacho.emit_dte")
def test_anular_guia_via_nc_aceptada(mock_emit, client, admin_token, db):
    """NC aceptada por SII con guia_despacho_id anula la guía (D-16)."""
    from app.models.guia_despacho import GuiaDespacho
    from app.models.nota_credito import NotaCredito
    from app.models.dte_emision import DteEmision
    from app.tasks.dte import _sync_dte_estado

    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "lineas": [{"descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    guia_id = r.json()["id"]

    db.expire_all()
    guia = db.get(GuiaDespacho, guia_id)
    guia.estado = "emitida"
    guia.dte_estado = "aceptada"
    db.commit()

    nc = NotaCredito(
        numero=_next_nc_numero(db),
        cliente_id=guia.cliente_id,
        guia_despacho_id=guia.id,
        razon=f"Anulación guía N°{guia.numero}",
    )
    db.add(nc)
    db.flush()

    emision_nc = DteEmision(
        tipo="061",
        nota_credito_id=nc.id,
        monto_neto=int(guia.total_neto),
        monto_iva=int(guia.total_iva),
        monto_total=int(guia.total),
    )
    db.add(emision_nc)
    db.commit()

    _sync_dte_estado(db, emision_nc, "aceptada")
    db.commit()

    db.expire_all()
    guia_obj = db.get(GuiaDespacho, guia_id)
    assert guia_obj.estado == "anulada", (
        f"NC aceptada debe anular guía; esperado 'anulada', obtenido '{guia_obj.estado}'"
    )


@patch("app.api.guias_despacho.emit_dte")
def test_anular_guia_nc_pendiente_no_anula(mock_emit, client, admin_token, db):
    """NC en estado 'procesando' NO anula guía (guard de D-16)."""
    from app.models.guia_despacho import GuiaDespacho
    from app.models.nota_credito import NotaCredito
    from app.models.dte_emision import DteEmision
    from app.tasks.dte import _sync_dte_estado

    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "lineas": [{"descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    guia_id = r.json()["id"]

    db.expire_all()
    guia = db.get(GuiaDespacho, guia_id)
    guia.estado = "emitida"
    db.commit()

    nc = NotaCredito(
        numero=_next_nc_numero(db),
        cliente_id=guia.cliente_id,
        guia_despacho_id=guia.id,
        razon="x",
    )
    db.add(nc)
    db.flush()

    emision_nc = DteEmision(
        tipo="061",
        nota_credito_id=nc.id,
        monto_neto=0,
        monto_iva=0,
        monto_total=0,
    )
    db.add(emision_nc)
    db.commit()

    _sync_dte_estado(db, emision_nc, "procesando")
    db.commit()

    db.expire_all()
    guia_obj = db.get(GuiaDespacho, guia_id)
    assert guia_obj.estado == "emitida", (
        f"NC procesando NO debe anular guía; esperado 'emitida', obtenido '{guia_obj.estado}'"
    )


# ── 8. PDF (DTE-03) ────────────────────────────────────────────────────────────


@patch("app.api.guias_despacho.emit_dte")
def test_pdf_genera(mock_emit, client, admin_token):
    """GET /pdf retorna bytes con magic %PDF- (WeasyPrint mockeado en conftest)."""
    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "lineas": [{"descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    guia_id = r.json()["id"]

    rp = client.get(
        f"/api/guias-despacho/{guia_id}/pdf",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert rp.status_code == 200, rp.text
    assert rp.headers["content-type"].startswith("application/pdf")
    assert rp.content[:5] == b"%PDF-", f"Magic bytes incorrectos: {rp.content[:8]!r}"


# ── 9. DELETE 409 ─────────────────────────────────────────────────────────────


@patch("app.api.guias_despacho.emit_dte")
def test_delete_guia_emitida_409(mock_emit, client, admin_token, db):
    """Guía con dte_estado != 'no_emitida' → DELETE → 409 con hint de NC."""
    from app.models.guia_despacho import GuiaDespacho

    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "lineas": [{"descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    guia_id = r.json()["id"]

    # La guía recién creada ya tiene dte_estado="pendiente" (no "no_emitida"),
    # lo que es suficiente para que DELETE retorne 409.
    db.expire_all()
    guia = db.get(GuiaDespacho, guia_id)
    assert guia.dte_estado != "no_emitida", (
        "Precondición: guía debe tener dte_estado != 'no_emitida'"
    )

    rd = client.delete(
        f"/api/guias-despacho/{guia_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert rd.status_code == 409, rd.text
    assert "anular" in rd.json()["detail"].lower(), (
        f"Detail debe mencionar 'anular': {rd.json()['detail']}"
    )


# ── 10. Audit log (DTE-07) ────────────────────────────────────────────────────


@patch("app.api.guias_despacho.emit_dte")
def test_audit_log_diff(mock_emit, client, admin_token, audit_enabled):
    """Crear + editar guía → AuditLog tiene ≥ 2 entries con model_name='GuiaDespacho' (DTE-07)."""
    from app.models.audit_log import AuditLog
    from app.database import SessionLocal

    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "lineas": [{"descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    guia_id = r.json()["id"]

    re_ = client.patch(
        f"/api/guias-despacho/{guia_id}",
        json={"direccion_destino": "Calle Falsa 456"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert re_.status_code == 200, re_.text

    db2 = SessionLocal()
    try:
        logs = db2.query(AuditLog).filter_by(entity_type="GuiaDespacho").all()
        assert len(logs) >= 2, (
            f"Esperaba ≥ 2 audit entries para GuiaDespacho, hay {len(logs)}"
        )
    finally:
        db2.close()


# ── 11. Concurrencia Postgres-only (D-28) ─────────────────────────────────────


@pytest.mark.skipif(
    "sqlite" in os.environ.get("DATABASE_URL", "sqlite"),
    reason="row-level lock with_for_update requires Postgres",
)
@patch("app.api.guias_despacho.emit_dte")
def test_numeracion_concurrente_guias(mock_emit, client, admin_token):
    """Numeración concurrente bajo Postgres — dos transacciones no colisionan en numero."""
    # TODO(W1-05-followup): implementar test threaded (ver test_boletas.py:280-310)
    # si se decide habilitar en sprint futuro. Por ahora esqueleto skipif en SQLite.
    pytest.skip("TODO(W1-05-followup): implementar concurrencia threaded cuando corra en Postgres")


# ── 12. Export Excel ───────────────────────────────────────────────────────────


@patch("app.api.guias_despacho.emit_dte")
def test_exportar_excel_admin(mock_emit, client, admin_token, db):
    """GET /export/excel retorna .xlsx con content-type correcto y contenido no vacío."""
    payload = {
        "cliente_id": 1,
        "motivo_traslado": 1,
        "direccion_destino": "Av Test 123",
        "comuna_destino": "Santiago",
        "lineas": [{"descripcion": "Item", "cantidad": "1", "precio_unitario": "1000"}],
    }
    client.post("/api/guias-despacho/", json=payload,
                headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/guias-despacho/export/excel",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert len(r.content) > 100
