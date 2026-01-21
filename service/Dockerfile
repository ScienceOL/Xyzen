# Use the official Python image as a base
FROM python:3.13.5-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libreoffice \
    fonts-noto-cjk \
    fonts-noto-cjk-extra \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

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

ADD . /app

# Install dependencies
RUN uv sync --locked

EXPOSE 48196

CMD ["uv", "run", "python", "-m", "app.main"]

LABEL org.opencontainers.image.source=https://github.com/scienceol/xyzen
