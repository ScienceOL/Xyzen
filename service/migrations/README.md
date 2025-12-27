# Generic single-database configuration.

Generate a migration after changing your models:(Run it in container or anywhere you can connect your postgresql)

注意！你需要把模型在 models/__init\__.py 中注册，否则 alembic 无法检测到模型变化。

## Use in local

<!-- Generate migration files -->

```sh
uv run alembic revision --autogenerate -m "Some message"
```

<!-- Apply migrates -->

```sh
uv run alembic upgrade head
```

## Use in Docker

```sh
docker exec -it sciol-xyzen-service-1 sh -c "uv run alembic revision --autogenerate -m 'Some message'"
```

```sh
docker exec -it sciol-xyzen-service-1 sh -c "uv run alembic upgrade head"
```
