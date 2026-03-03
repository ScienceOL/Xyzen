"""OpenTelemetry initialization and instrumentation helpers."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.configs import configs

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

_initialized = False


def init_telemetry(service_name_override: str | None = None) -> bool:
    """Initialize the OpenTelemetry TracerProvider.

    Returns ``True`` if telemetry was (or already had been) initialized,
    ``False`` if telemetry is disabled via config.
    """
    global _initialized  # noqa: PLW0603

    if not configs.Telemetry.Enabled:
        return False

    if _initialized:
        return True

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.sdk.trace.sampling import TraceIdRatioBasedSampler

    service_name = service_name_override or configs.Telemetry.ServiceName

    resource = Resource.create({"service.name": service_name})
    sampler = TraceIdRatioBasedSampler(configs.Telemetry.SampleRate)
    provider = TracerProvider(resource=resource, sampler=sampler)

    exporter = OTLPSpanExporter(
        endpoint=configs.Telemetry.Endpoint,
        insecure=configs.Telemetry.Insecure,
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)
    _initialized = True
    logger.info("OpenTelemetry initialized: service=%s endpoint=%s", service_name, configs.Telemetry.Endpoint)
    return True


def instrument_fastapi_app(app: FastAPI) -> None:
    """Instrument a FastAPI application and common HTTP/logging libraries."""
    if not configs.Telemetry.Enabled:
        return

    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.logging import LoggingInstrumentor

    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()
    LoggingInstrumentor().instrument(set_logging_format=False)
    logger.info("FastAPI + HTTPX + Logging instrumentation applied")
