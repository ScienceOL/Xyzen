from celery import Celery

from app.configs import configs

celery_app = Celery(
    "xyzen_worker",
    broker=configs.Redis.REDIS_URL,
    backend=configs.Redis.REDIS_URL,
    include=["app.tasks.chat"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
)
