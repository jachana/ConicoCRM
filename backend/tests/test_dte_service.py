import hmac
import hashlib
import pytest
from unittest.mock import patch, MagicMock
from app.services.dte_service import DteService


@pytest.fixture
def svc():
    return DteService(api_key="test_key", api_url="https://api.lioren.cl/v1", webhook_secret="secret123")


def test_validate_webhook_signature_valid(svc):
    body = b'{"track_id": "abc"}'
    expected_sig = hmac.new(b"secret123", body, hashlib.sha256).hexdigest()
    assert svc.validate_webhook_signature(body, expected_sig) is True


def test_validate_webhook_signature_invalid(svc):
    body = b'{"track_id": "abc"}'
    assert svc.validate_webhook_signature(body, "wrong_sig") is False


def test_emit_returns_track_id_and_folio(svc):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"track_id": "TR123", "folio": 42, "estado": "procesando"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.post", return_value=mock_response):
        result = svc.emit({"tipo_dte": 33, "receptor": {}})

    assert result["track_id"] == "TR123"
    assert result["folio"] == 42


def test_check_status_returns_estado(svc):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"track_id": "TR123", "estado": "aceptado", "detalle": "OK"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.get", return_value=mock_response):
        result = svc.check_status("TR123")

    assert result["estado"] == "aceptado"
