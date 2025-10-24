# Use the official Python image as a base
FROM python:3.13.5-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV TZ=Asia/Shanghai
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

ADD . /app

# Install dependencies
RUN uv sync --locked

EXPOSE 48196

CMD ["uv", "run", "python", "-m", "app.main"]

LABEL org.opencontainers.image.source=https://github.com/scienceol/xyzen
