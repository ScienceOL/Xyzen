import logging

from openfga_sdk import (
    CheckRequest,
    ClientConfiguration,
    OpenFgaApi,
    ReadRequest,
    TupleKey,
    TupleKeyWithoutCondition,
    WriteRequest,
    WriteRequestDeletes,
    WriteRequestWrites,
)

from app.configs import configs

logger = logging.getLogger(__name__)


class FgaClient:
    """Thin async wrapper around the OpenFGA SDK."""

    def __init__(self, api: OpenFgaApi) -> None:
        self._api = api

    async def check(
        self,
        user_id: str,
        relation: str,
        object_type: str,
        object_id: str,
    ) -> bool:
        body = CheckRequest(
            tuple_key=TupleKey(
                user=f"user:{user_id}",
                relation=relation,
                object=f"{object_type}:{object_id}",
            ),
        )
        resp = await self._api.check(body)
        if resp is None:
            return False
        return bool(resp.allowed)

    async def write_tuple(
        self,
        user_id: str,
        relation: str,
        object_type: str,
        object_id: str,
    ) -> None:
        body = WriteRequest(
            writes=WriteRequestWrites(
                tuple_keys=[
                    TupleKeyWithoutCondition(
                        user=f"user:{user_id}",
                        relation=relation,
                        object=f"{object_type}:{object_id}",
                    )
                ]
            ),
        )
        await self._api.write(body)

    async def delete_tuple(
        self,
        user_id: str,
        relation: str,
        object_type: str,
        object_id: str,
    ) -> None:
        body = WriteRequest(
            deletes=WriteRequestDeletes(
                tuple_keys=[
                    TupleKeyWithoutCondition(
                        user=f"user:{user_id}",
                        relation=relation,
                        object=f"{object_type}:{object_id}",
                    )
                ]
            ),
        )
        await self._api.write(body)

    async def list_objects(
        self,
        user_id: str,
        relation: str,
        object_type: str,
    ) -> list[str]:
        body = ReadRequest(
            tuple_key=TupleKey(
                user=f"user:{user_id}",
                relation=relation,
                object=f"{object_type}:",
            ),
        )
        resp = await self._api.read(body)
        results: list[str] = []
        if resp is None:
            return results
        for t in resp.tuples or []:
            if t.key is None:
                continue
            obj_str = t.key.object
            if obj_str and ":" in obj_str:
                results.append(obj_str.split(":", 1)[1])
        return results

    async def write_tuple_raw(
        self,
        user: str,
        relation: str,
        object_type: str,
        object_id: str,
    ) -> None:
        """Write a tuple with an arbitrary user string (no ``user:`` prefix)."""
        body = WriteRequest(
            writes=WriteRequestWrites(
                tuple_keys=[
                    TupleKeyWithoutCondition(
                        user=user,
                        relation=relation,
                        object=f"{object_type}:{object_id}",
                    )
                ]
            ),
        )
        await self._api.write(body)

    async def delete_tuple_raw(
        self,
        user: str,
        relation: str,
        object_type: str,
        object_id: str,
    ) -> None:
        """Delete a tuple with an arbitrary user string (no ``user:`` prefix)."""
        body = WriteRequest(
            deletes=WriteRequestDeletes(
                tuple_keys=[
                    TupleKeyWithoutCondition(
                        user=user,
                        relation=relation,
                        object=f"{object_type}:{object_id}",
                    )
                ]
            ),
        )
        await self._api.write(body)

    async def check_capability(self, user_id: str, capability: str) -> bool:
        """Check if a user has a capability via plan→capability FGA relation."""
        body = CheckRequest(
            tuple_key=TupleKey(
                user=f"user:{user_id}",
                relation="granted",
                object=f"capability:{capability}",
            ),
        )
        resp = await self._api.check(body)
        if resp is None:
            return False
        return bool(resp.allowed)

    async def write_public_access(
        self,
        relation: str,
        object_type: str,
        object_id: str,
    ) -> None:
        body = WriteRequest(
            writes=WriteRequestWrites(
                tuple_keys=[
                    TupleKeyWithoutCondition(
                        user="user:*",
                        relation=relation,
                        object=f"{object_type}:{object_id}",
                    )
                ]
            ),
        )
        await self._api.write(body)

    async def revoke_public_access(
        self,
        relation: str,
        object_type: str,
        object_id: str,
    ) -> None:
        body = WriteRequest(
            deletes=WriteRequestDeletes(
                tuple_keys=[
                    TupleKeyWithoutCondition(
                        user="user:*",
                        relation=relation,
                        object=f"{object_type}:{object_id}",
                    )
                ]
            ),
        )
        await self._api.write(body)

    async def close(self) -> None:
        await self._api.close()


# ── Singleton ──────────────────────────────────────────────────

_fga_client: FgaClient | None = None


async def get_fga_client() -> FgaClient:
    """Return a module-level FgaClient singleton (lazily created)."""
    global _fga_client
    if _fga_client is not None:
        return _fga_client

    from .bootstrap import ensure_fga_store

    store_id, model_id = await ensure_fga_store()

    cfg = ClientConfiguration(
        api_url=configs.Fga.ApiUrl,
        store_id=store_id,
        authorization_model_id=model_id,
    )
    api = OpenFgaApi(cfg)
    _fga_client = FgaClient(api)
    logger.info("FGA client initialized (store=%s, model=%s)", store_id, model_id)
    return _fga_client
