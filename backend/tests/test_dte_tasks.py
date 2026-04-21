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


def test_lioren_to_estado_mapping():
    from app.tasks.dte import _lioren_to_estado
    assert _lioren_to_estado("aceptado") == "aceptado"
    assert _lioren_to_estado("rechazado") == "rechazado"
    assert _lioren_to_estado("procesando") == "procesando"
    assert _lioren_to_estado("unknown") == "procesando"
