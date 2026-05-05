"""Tests for Lioren instrumentation wrapper (T1.3)."""
from unittest.mock import MagicMock, patch
import httpx
import pytest

from app.services.lioren_metrics import lioren_call, _TIPO_TO_SLUG, _lookup_cost


# --------------------------------------------------------------------------- #
# lioren_call context manager                                                   #
# --------------------------------------------------------------------------- #

def test_lioren_call_logs_on_success(caplog):
    """lioren.call log line is emitted with the captured state fields."""
    log_records = []

    with patch("app.services.lioren_metrics.logger") as mock_logger:
        bound = MagicMock()
        mock_logger.bind.return_value = bound

        with lioren_call("https://api.lioren.cl/documentos", "POST",
                         empresa_id=5, dte_tipo="033", req_size=100) as state:
            state["status"] = 200
            state["resp_size"] = 42

        mock_logger.bind.assert_called_once()
        kwargs = mock_logger.bind.call_args.kwargs
        assert kwargs["endpoint"] == "https://api.lioren.cl/documentos"
        assert kwargs["method"] == "POST"
        assert kwargs["empresa_id"] == 5
        assert kwargs["dte_tipo"] == "033"
        assert kwargs["http_status"] == 200
        assert kwargs["resp_size"] == 42
        assert kwargs["req_size"] == 100
        assert isinstance(kwargs["latency_ms"], int)
        bound.info.assert_called_once_with("lioren.call")


def test_lioren_call_logs_even_on_exception():
    """Log line is always emitted even when the body raises."""
    with patch("app.services.lioren_metrics.logger") as mock_logger:
        bound = MagicMock()
        mock_logger.bind.return_value = bound

        with pytest.raises(RuntimeError):
            with lioren_call("https://api.lioren.cl/documentos", "POST") as state:
                raise RuntimeError("network error")

        bound.info.assert_called_once_with("lioren.call")


def test_lioren_call_zero_cost_without_db():
    """When no db is passed, cost_clp defaults to 0."""
    with patch("app.services.lioren_metrics.logger") as mock_logger:
        bound = MagicMock()
        mock_logger.bind.return_value = bound

        with lioren_call("https://api.lioren.cl/documentos", "POST", dte_tipo="033") as state:
            state["status"] = 200

        kwargs = mock_logger.bind.call_args.kwargs
        assert kwargs["cost_clp"] == 0


# --------------------------------------------------------------------------- #
# _lookup_cost                                                                  #
# --------------------------------------------------------------------------- #

def test_lookup_cost_returns_tariff_value():
    mock_db = MagicMock()
    mock_tariff = MagicMock()
    mock_tariff.costo_clp = 350
    mock_db.query.return_value.filter_by.return_value.first.return_value = mock_tariff

    result = _lookup_cost(mock_db, "factura_emision")
    assert result == 350


def test_lookup_cost_returns_zero_when_not_found():
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.return_value = None

    result = _lookup_cost(mock_db, "factura_emision")
    assert result == 0


# --------------------------------------------------------------------------- #
# DteService.emit instrumentation                                               #
# --------------------------------------------------------------------------- #

def test_emit_passes_empresa_id_and_dte_tipo_to_lioren_call():
    """DteService.emit forwards empresa_id and dte_tipo so the log is enriched."""
    from app.services.dte_service import DteService

    svc = DteService(api_key="k", api_url="https://api.lioren.cl/v1", webhook_secret="s")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b'{"track_id":"abc","folio":1}'
    mock_resp.json.return_value = {"track_id": "abc", "folio": 1}

    captured_kwargs = {}

    def fake_lioren_call(endpoint, method, **kwargs):
        captured_kwargs.update(kwargs)
        from contextlib import contextmanager

        @contextmanager
        def _ctx():
            state = {}
            yield state
            state["status"] = 200
            state["resp_size"] = 10

        return _ctx()

    with patch("app.services.dte_service.lioren_call", side_effect=fake_lioren_call):
        with patch("httpx.post", return_value=mock_resp):
            svc.emit({"tipo_dte": 33}, empresa_id=7, dte_tipo="033")

    assert captured_kwargs.get("empresa_id") == 7
    assert captured_kwargs.get("dte_tipo") == "033"


# --------------------------------------------------------------------------- #
# Slug mapping completeness                                                     #
# --------------------------------------------------------------------------- #

def test_all_known_dte_tipos_have_slugs():
    expected = {"033", "034", "039", "041", "046", "052", "056", "061", "ventas", "compras"}
    assert expected.issubset(set(_TIPO_TO_SLUG.keys()))
