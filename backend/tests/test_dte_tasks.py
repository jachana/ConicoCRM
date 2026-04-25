from unittest.mock import MagicMock


def test_process_emit_updates_estado_to_procesando():
    from app.tasks.dte import _process_emit

    mock_emision = MagicMock()
    mock_emision.tipo = "033"
    mock_emision.factura_id = 1
    mock_emision.nota_credito_id = None
    mock_emision.nota_debito_id = None

    mock_factura = MagicMock()
    mock_factura.lineas = []
    mock_factura.total_neto = 100
    mock_factura.total_iva = 19
    mock_factura.total = 119

    mock_db = MagicMock()
    mock_db.query.return_value.options.return_value.filter_by.return_value.first.return_value = mock_factura

    mock_svc = MagicMock()
    mock_svc.emit.return_value = {"track_id": "TR999", "folio": 7}
    mock_svc.build_factura_payload.return_value = {"tipo_dte": 33}

    _process_emit(mock_db, mock_emision, mock_svc)

    assert mock_emision.estado == "procesando"
    assert mock_emision.track_id == "TR999"
    assert mock_emision.folio == 7


def test_poll_maps_lioren_aceptado_to_aceptada():
    from app.tasks.dte import _lioren_to_estado
    assert _lioren_to_estado("aceptado") == "aceptada"
    assert _lioren_to_estado("rechazado") == "rechazada"
    assert _lioren_to_estado("procesando") == "procesando"
    assert _lioren_to_estado("unknown") == "procesando"


from app.models.boleta import Boleta
from app.models.dte_emision import DteEmision
from app.tasks.dte import _process_emit, _sync_dte_estado
from unittest.mock import MagicMock


def test_process_emit_for_boleta(db, monkeypatch):
    boleta = Boleta(
        numero=100, tipo_dte="39", vendedor_id=1, metodo_pago="efectivo",
        total_neto=1000, total_iva=190, total=1190,
    )
    db.add(boleta)
    db.flush()
    emision = DteEmision(
        tipo="039", boleta_id=boleta.id,
        monto_neto=1000, monto_iva=190, monto_total=1190,
    )
    db.add(emision)
    db.flush()

    svc = MagicMock()
    svc.build_boleta_payload.return_value = {"tipo_dte": 39}
    svc.emit.return_value = {"track_id": "TR99", "folio": 7}

    _process_emit(db, emision, svc)

    assert emision.track_id == "TR99"
    assert emision.folio == 7
    assert emision.estado == "procesando"
    assert boleta.dte_estado == "procesando"


def test_sync_dte_estado_boleta_aceptada(db):
    boleta = Boleta(numero=101, tipo_dte="39", vendedor_id=1, metodo_pago="efectivo")
    db.add(boleta)
    db.flush()
    emision = DteEmision(
        tipo="039", boleta_id=boleta.id,
        monto_neto=0, monto_iva=0, monto_total=0,
    )
    db.add(emision)
    db.flush()
    _sync_dte_estado(db, emision, "aceptada")
    assert boleta.dte_estado == "aceptada"


def test_process_emit_raises_when_no_document_fk(db):
    from app.models.dte_emision import DteEmision
    from app.tasks.dte import _process_emit
    import pytest

    emision = DteEmision(tipo="033", monto_neto=0, monto_iva=0, monto_total=0)

    with pytest.raises(ValueError, match="no document FK"):
        _process_emit(db, emision, MagicMock())
