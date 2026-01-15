from celery import Celery
from celery.signals import worker_process_init

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


@worker_process_init.connect
def init_worker_process(**kwargs: object) -> None:
    """
    Initialize builtin tools when Celery worker process starts.

    This is required because the BuiltinToolRegistry uses class variables
    that are not shared between the FastAPI process and Celery worker process.
    """
    from app.tools.registry import register_builtin_tools

    register_builtin_tools()
