"""Tests for Telemetry T3.1: POST /api/telemetry/web-vitals."""
from __future__ import annotations
import pytest


@pytest.fixture
def payload():
    return {
        "metric": "LCP",
        "value": 1234.56,
        "route": "/facturas",
        "user_agent": "Mozilla/5.0 (Test)",
        "timestamp": "2026-05-06T00:00:00.000Z",
    }


def test_accepts_valid_vital(client, payload):
    resp = client.post("/api/telemetry/web-vitals", json=payload)
    assert resp.status_code == 204


@pytest.mark.parametrize("name", ["LCP", "FID", "INP", "CLS", "TTFB"])
def test_accepts_all_vital_names(client, payload, name):
    resp = client.post("/api/telemetry/web-vitals", json={**payload, "metric": name})
    assert resp.status_code == 204


def test_silently_accepts_unknown_metric(client, payload):
    # Unknown metrics are dropped but not rejected
    resp = client.post("/api/telemetry/web-vitals", json={**payload, "metric": "UNKNOWN"})
    assert resp.status_code == 204


def test_rejects_missing_fields(client):
    resp = client.post("/api/telemetry/web-vitals", json={"metric": "LCP"})
    assert resp.status_code == 422
