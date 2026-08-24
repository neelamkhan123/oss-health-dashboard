from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "oss_dashboard",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.services.sync"],
)

celery_app.conf.beat_schedule = {
    "sync-repos-every-15-minutes": {
        "task": "app.services.sync.sync_all_repos",
        "schedule": crontab(minute="*/15"),
    },
}