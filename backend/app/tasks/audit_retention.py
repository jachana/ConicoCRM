"""Weekly audit_log archival: moves rows older than retention_days to audit_log_archive."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from app.celery_app import celery_app
from app.config import settings
from app.core.logging import logger
from app.database import SessionLocal

_BATCH_SIZE = 2_000


def _do_archive(db) -> int:
    """Move AuditLog rows older than retention window into AuditLogArchive.

    Extracted as a plain function so tests can call it directly without
    going through the Celery broker.

    Returns the total number of rows archived.
    """
    # Import inside function to avoid circular imports at Celery startup.
    from app.models.audit_log import AuditLog
    from app.models.audit_log_archive import AuditLogArchive

    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.audit_log_retention_days)
    total = 0

    while True:
        batch = (
            db.query(AuditLog)
            .filter(AuditLog.created_at < cutoff)
            .order_by(AuditLog.created_at)
            .limit(_BATCH_SIZE)
            .with_for_update(skip_locked=True)
            .all()
        )
        if not batch:
            break

        _COLS = ["id", "user_id", "action", "entity_type", "entity_id",
                 "diff_json", "ip", "user_agent", "created_at"]
        archive_rows = [
            AuditLogArchive(**{col: getattr(row, col) for col in _COLS})
            for row in batch
        ]
        db.bulk_save_objects(archive_rows)
        db.flush()  # guarantee inserts are written before source rows are deleted

        batch_ids = [r.id for r in batch]
        db.query(AuditLog).filter(AuditLog.id.in_(batch_ids)).delete(
            synchronize_session=False
        )
        db.commit()
        total += len(batch)

    logger.info("audit_retention.archived", count=total, cutoff=cutoff.isoformat())
    return total


@celery_app.task(
    name="app.tasks.audit_retention.archive_old_audit_logs",
    bind=True,
    max_retries=3,
)
def archive_old_audit_logs(self):
    db = SessionLocal()
    try:
        total = _do_archive(db)
        return {"archived": total}
    except Exception as exc:
        db.rollback()
        raise self.retry(exc=exc, countdown=300)
    finally:
        db.close()
