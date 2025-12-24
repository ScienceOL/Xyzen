# This file is used as the entry point for the celery worker
# Command: celery -A app.worker worker --loglevel=info
from app.core.celery_app import celery_app  # noqa: F401 # type: ignore
