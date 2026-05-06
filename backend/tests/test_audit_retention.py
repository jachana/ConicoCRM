"""Tests for audit_log retention: archival task logic + stats endpoint."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_audit_log(db, *, days_ago: int, action: str = "create", entity_type: str = "factura"):
    """Insert an AuditLog row with created_at = now - days_ago."""
    from app.models.audit_log import AuditLog

    created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
    row = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id="1",
        created_at=created_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Task logic tests (call _do_archive directly — no Celery broker needed)
# ---------------------------------------------------------------------------

def test_old_rows_are_archived(db):
    """Rows older than retention_days are moved to audit_log_archive."""
    from app.tasks.audit_retention import _do_archive
    from app.models.audit_log import AuditLog
    from app.models.audit_log_archive import AuditLogArchive
    from app.config import settings

    # Create one old row (past threshold) and one recent row
    old = _make_audit_log(db, days_ago=settings.audit_log_retention_days + 10)
    recent = _make_audit_log(db, days_ago=1)

    # Capture IDs and column values before archival deletes the source rows.
    old_id = old.id
    old_entity_type = old.entity_type
    old_action = old.action
    recent_id = recent.id

    archived = _do_archive(db)

    assert archived == 1

    # Old row gone from source
    assert db.query(AuditLog).filter(AuditLog.id == old_id).first() is None
    # Old row in archive
    arc = db.query(AuditLogArchive).filter(AuditLogArchive.id == old_id).first()
    assert arc is not None
    assert arc.entity_type == old_entity_type
    assert arc.action == old_action

    # Recent row still in source
    assert db.query(AuditLog).filter(AuditLog.id == recent_id).first() is not None
    # Recent row NOT in archive
    assert db.query(AuditLogArchive).filter(AuditLogArchive.id == recent_id).first() is None


def test_new_rows_not_archived(db):
    """Rows newer than retention_days are NOT touched."""
    from app.tasks.audit_retention import _do_archive
    from app.models.audit_log import AuditLog
    from app.models.audit_log_archive import AuditLogArchive
    from app.config import settings

    recent = _make_audit_log(db, days_ago=settings.audit_log_retention_days - 5)

    archived = _do_archive(db)

    assert archived == 0
    assert db.query(AuditLog).filter(AuditLog.id == recent.id).first() is not None
    assert db.query(AuditLogArchive).count() == 0


def test_idempotency(db):
    """Running _do_archive twice does not re-archive (rows already gone)."""
    from app.tasks.audit_retention import _do_archive
    from app.models.audit_log_archive import AuditLogArchive
    from app.config import settings

    _make_audit_log(db, days_ago=settings.audit_log_retention_days + 30)

    first_run = _do_archive(db)
    second_run = _do_archive(db)

    assert first_run == 1
    assert second_run == 0
    # Only one copy in archive
    assert db.query(AuditLogArchive).count() == 1


def test_empty_table_no_error(db):
    """Running on an empty audit_logs table should archive 0 rows cleanly."""
    from app.tasks.audit_retention import _do_archive

    archived = _do_archive(db)
    assert archived == 0


# ---------------------------------------------------------------------------
# Stats endpoint tests
# ---------------------------------------------------------------------------

def test_stats_endpoint_returns_expected_keys(client, admin_token, db):
    """GET /api/auditoria/stats returns 4 expected keys."""
    r = client.get(
        "/api/auditoria/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "active_rows" in data
    assert "archive_rows" in data
    assert "oldest_active" in data
    assert "retention_days" in data
    assert isinstance(data["active_rows"], int)
    assert isinstance(data["archive_rows"], int)
    assert data["retention_days"] == 180


def test_stats_endpoint_counts_correctly(client, admin_token, db):
    """Stats endpoint reports correct active and archive counts."""
    from app.tasks.audit_retention import _do_archive
    from app.config import settings

    # Add 2 old rows + 1 recent
    _make_audit_log(db, days_ago=settings.audit_log_retention_days + 5)
    _make_audit_log(db, days_ago=settings.audit_log_retention_days + 10)
    _make_audit_log(db, days_ago=1)

    # Archive the old ones
    _do_archive(db)

    r = client.get(
        "/api/auditoria/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["active_rows"] == 1
    assert data["archive_rows"] == 2
    assert data["oldest_active"] is not None


def test_stats_endpoint_requires_auth(client):
    r = client.get("/api/auditoria/stats")
    assert r.status_code == 401


def test_stats_endpoint_forbidden_for_vendedor(client, vendedor_token):
    r = client.get(
        "/api/auditoria/stats",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403
