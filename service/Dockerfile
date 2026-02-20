# Stage 1: Build dependencies
FROM python:3.13.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-cache

# Stage 2: Runtime image
FROM python:3.13.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Build-time args for version info
ARG XYZEN_VERSION=unknown
ARG XYZEN_COMMIT_SHA=unknown
ARG XYZEN_BUILD_TIME=unknown

# Set as environment variables for runtime
ENV XYZEN_VERSION=${XYZEN_VERSION}
ENV XYZEN_COMMIT_SHA=${XYZEN_COMMIT_SHA}
ENV XYZEN_BUILD_TIME=${XYZEN_BUILD_TIME}

WORKDIR /app

# Copy uv for runtime dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy venv from builder
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Copy only runtime code
COPY app/ /app/app/
COPY migrations/ /app/migrations/
COPY alembic.ini /app/
COPY pyproject.toml /app/

EXPOSE 48196

CMD ["python", "-m", "app.main"]

LABEL org.opencontainers.image.source=https://github.com/scienceol/xyzen
LABEL org.opencontainers.image.description="AI Research Interface"
