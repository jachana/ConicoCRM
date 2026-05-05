from celery import Celery
from celery.schedules import crontab
from app.config import settings
from app.core import celery_metrics

celery_app = Celery(
    "conico",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.dte", "app.tasks.tareas", "app.tasks.cobranza", "app.tasks.caf", "app.tasks.telemetry"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Santiago",
    enable_utc=True,
    beat_schedule={
        "poll-dte-status": {
            "task": "app.tasks.dte.poll_dte_status",
            "schedule": 300.0,
        },
        "generar-tareas-automaticas": {
            "task": "app.tasks.tareas.generar_tareas_automaticas",
            "schedule": 3600.0,
        },
        "enviar-recordatorios": {
            "task": "app.tasks.cobranza.enviar_recordatorios_automaticos",
            "schedule": crontab(hour=8, minute=0),
        },
        "enviar-alertas-caf": {
            "task": "app.tasks.caf.send_caf_alerts_email",
            "schedule": crontab(hour=8, minute=30),
        },
        "aggregate-perf-hourly": {
            "task": "app.tasks.telemetry.aggregate_perf_hourly",
            "schedule": crontab(minute=5),  # 5 min past each hour
        },
        "aggregate-cost-hourly": {
            "task": "app.tasks.telemetry.aggregate_cost_hourly",
            "schedule": crontab(minute=10),
        },
        "cleanup-old-rollups": {
            "task": "app.tasks.telemetry.cleanup_old_rollups",
            "schedule": crontab(hour=3, minute=0, day_of_week=0),  # weekly Sunday 3am
        },
    },
)

celery_metrics.connect(celery_app)
