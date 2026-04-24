from celery import Celery
from app.config import settings

celery_app = Celery(
    "conico",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.dte", "app.tasks.tareas"],
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
    },
)
