"""
Tests para Guías de Despacho — Phase 1 Backend.

Guías de despacho son documentos logísticos internos: NO se emite DTE 52 al SII
(commit 7eb9355). Por tanto crear_guia_despacho ya no crea DteEmision ni dispara
emit_dte.delay. Los tests de pipeline DTE construyen DteEmision manualmente para
ejercitar _process_emit / _sync_dte_estado de forma aislada.

Cubre: CRUD básico, permisos, validaciones, invariante stock (D-13),
_process_emit (path guia_despacho_id), anulación vía NC aceptada (D-16), PDF,
audit log (DTE-07), DELETE 409, y test concurrencia Postgres-only (D-28).
"""

import os
import uuid

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


def test_crear_guia_basica(client, admin_token):
    """Happy path: POST /api/guias-despacho/ crea guía. dte_estado='no_emitida' (no se emite DTE 52)."""
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
    assert body["dte_estado"] == "no_emitida"
    assert body["numero"] >= 1


# ── 2. Permisos (DTE-06) ───────────────────────────────────────────────────────


def test_crear_guia_sin_permiso_403(client, admin_token, vendedor_token):
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


def test_guia_no_descuenta_stock(client, admin_token, db):
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


# ── 5. Pipeline DTE — guía NO emite DTE 52 al crear (commit 7eb9355) ─────────


def test_crear_guia_no_emite_dte(client, admin_token, db):
    """Guía es doc logístico interno: POST NO debe crear DteEmision ni dejar dte_estado='pendiente'."""
    from app.models.dte_emision import DteEmision

    emisiones_antes = db.query(DteEmision).count()

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
    emisiones_despues = (
        db.query(DteEmision).filter(DteEmision.guia_despacho_id == guia_id).all()
    )
    assert emisiones_despues == [], (
        f"Crear guía NO debe crear DteEmision; encontradas: {emisiones_despues}"
    )
    assert db.query(DteEmision).count() == emisiones_antes
    assert r.json()["dte_estado"] == "no_emitida"


# ── 6. Pipeline DTE — _process_emit asigna track_id (DTE-02 polling path) ─────
# B-1: cubre el path completo _process_emit(db, emision, svc) → svc.emit() → emision.track_id = ...
# Mockea DteService.emit para no tocar la red Lioren.
# Valida que la asignación de track_id ocurre y persiste.


def test_process_emit_guia_asigna_track_id(client, admin_token, db):
    """_process_emit con guia_despacho_id asigna emision.track_id tras svc.emit() mockeado.

    Se construye DteEmision manualmente porque crear_guia_despacho ya no lo hace
    (commit 7eb9355). El endpoint del pipeline DTE sigue soportando guías por si
    se reactiva la emisión en el futuro.
    """
    from unittest.mock import patch as _patch
    from app.models.dte_emision import DteEmision
    from app.tasks.dte import _process_emit
    from app.services.dte_service import DteService

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

    emision = DteEmision(
        tipo="052",
        guia_despacho_id=guia_id,
        monto_neto=1000,
        monto_iva=190,
        monto_total=1190,
    )
    db.add(emision)
    db.commit()
    db.refresh(emision)
    assert emision.track_id in (None, "")

    with _patch.object(DteService, "__init__", return_value=None), \
         _patch.object(
             DteService, "emit", return_value={"track_id": "TRK-12345", "estado": "procesando"}
         ) as mock_emit_svc:
        svc = DteService()
        _process_emit(db=db, emision=emision, svc=svc)
        mock_emit_svc.assert_called_once()

    assert emision.track_id == "TRK-12345", (
        f"_process_emit no asignó track_id: got {emision.track_id!r}"
    )

    db.commit()
    db.expire_all()
    emision_post = db.get(DteEmision, emision.id)
    assert emision_post.track_id == "TRK-12345", (
        f"track_id no persistió en DB: got {emision_post.track_id!r}"
    )


# ── 7. Anulación vía NC (DTE-04 / D-16) ───────────────────────────────────────


def test_anular_guia_via_nc_aceptada(client, admin_token, db):
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


def test_anular_guia_nc_pendiente_no_anula(client, admin_token, db):
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


def test_pdf_genera(client, admin_token):
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


def test_delete_guia_emitida_409(client, admin_token, db):
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

    # crear_guia_despacho ya no emite DTE (commit 7eb9355): por defecto dte_estado='no_emitida'.
    # Forzamos 'aceptada' para ejercitar el guard que pide anular vía NC en lugar de DELETE.
    db.expire_all()
    guia = db.get(GuiaDespacho, guia_id)
    guia.dte_estado = "aceptada"
    db.commit()

    rd = client.delete(
        f"/api/guias-despacho/{guia_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert rd.status_code == 409, rd.text
    assert "anular" in rd.json()["detail"].lower(), (
        f"Detail debe mencionar 'anular': {rd.json()['detail']}"
    )


# ── 10. Audit log (DTE-07) ────────────────────────────────────────────────────


def test_audit_log_diff(client, admin_token, audit_enabled, db):
    """Crear + editar guía → AuditLog tiene ≥ 2 entries con model_name='GuiaDespacho' (DTE-07)."""
    from app.models.audit_log import AuditLog

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

    logs = db.query(AuditLog).filter_by(entity_type="GuiaDespacho").all()
    assert len(logs) >= 2, (
        f"Esperaba ≥ 2 audit entries para GuiaDespacho, hay {len(logs)}"
    )


# ── 11. Concurrencia Postgres-only (D-28) ─────────────────────────────────────


@pytest.mark.skipif(
    "sqlite" in os.environ.get("DATABASE_URL", "sqlite"),
    reason="row-level lock with_for_update requires Postgres",
)
def test_numeracion_concurrente_guias(client, admin_token):
    """Numeración concurrente bajo Postgres — dos transacciones no colisionan en numero."""
    # TODO(W1-05-followup): implementar test threaded (ver test_boletas.py:280-310)
    # si se decide habilitar en sprint futuro. Por ahora esqueleto skipif en SQLite.
    pytest.skip("TODO(W1-05-followup): implementar concurrencia threaded cuando corra en Postgres")


# ── 12. Export Excel ───────────────────────────────────────────────────────────


def test_exportar_excel_admin(client, admin_token, db):
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
