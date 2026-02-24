from celery import Celery
from celery.signals import worker_process_init, worker_ready

from app.configs import configs

celery_app = Celery(
    "xyzen_worker",
    broker=configs.Redis.REDIS_URL,
    backend=configs.Redis.REDIS_URL,
    include=["app.tasks.chat", "app.tasks.notification", "app.tasks.sandbox_cleanup", "app.tasks.scheduled"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    beat_schedule={
        "sandbox-cleanup-every-10min": {
            "task": "sandbox_cleanup",
            "schedule": 600.0,  # every 10 minutes
        },
    },
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

    # Bootstrap Novu so the worker has the real API key
    import asyncio

    from app.core.notification.bootstrap import ensure_novu_setup

    try:
        asyncio.run(ensure_novu_setup())
    except Exception:
        pass  # Logged inside ensure_novu_setup


@worker_ready.connect
def on_worker_ready(**kwargs: object) -> None:
    """
    Recover scheduled tasks once when the worker is fully ready.

    Uses worker_ready (fires once per worker instance) instead of
    worker_process_init (fires per child process) to avoid duplicate recovery.
    """
    import asyncio
    import logging

    logger = logging.getLogger(__name__)

    from app.tasks.scheduled import recover_scheduled_tasks

    try:
        asyncio.run(recover_scheduled_tasks())
    except Exception:
        logger.exception("Failed to recover scheduled tasks on worker startup")
