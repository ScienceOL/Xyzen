"""Bootstrap OpenFGA store and authorization model on startup."""

import logging

from openfga_sdk import (
    ClientConfiguration,
    CreateStoreRequest,
    ObjectRelation,
    OpenFgaApi,
    TupleToUserset,
    TypeDefinition,
    Userset,
    Usersets,
    WriteAuthorizationModelRequest,
)
from openfga_sdk.models import Metadata, RelationMetadata, RelationReference

from app.configs import configs

logger = logging.getLogger(__name__)

# Authorization model schema version
_SCHEMA_VERSION = "1.1"

# Xyzen authorization model – matches the plan DSL
_TYPE_DEFINITIONS: list[TypeDefinition] = [
    TypeDefinition(type="user"),
    TypeDefinition(
        type="agent",
        relations={
            "owner": Userset(this={}),
            "editor": Usersets(
                child=[Userset(this={}), Userset(computed_userset={"relation": "owner"})],
            ),
            "viewer": Usersets(
                child=[
                    Userset(this={}),
                    Userset(computed_userset={"relation": "editor"}),
                ],
            ),
        },
        metadata=Metadata(
            relations={
                "owner": RelationMetadata(directly_related_user_types=[RelationReference(type="user")]),
                "editor": RelationMetadata(directly_related_user_types=[RelationReference(type="user")]),
                "viewer": RelationMetadata(
                    directly_related_user_types=[
                        RelationReference(type="user"),
                        RelationReference(type="user", wildcard={}),
                    ]
                ),
            }
        ),
    ),
    TypeDefinition(
        type="session",
        relations={
            "owner": Userset(this={}),
            "viewer": Usersets(
                child=[
                    Userset(this={}),
                    Userset(computed_userset={"relation": "owner"}),
                ],
            ),
        },
        metadata=Metadata(
            relations={
                "owner": RelationMetadata(directly_related_user_types=[RelationReference(type="user")]),
                "viewer": RelationMetadata(
                    directly_related_user_types=[
                        RelationReference(type="user"),
                        RelationReference(type="user", wildcard={}),
                    ]
                ),
            }
        ),
    ),
    TypeDefinition(
        type="knowledge_set",
        relations={
            "owner": Userset(this={}),
            "editor": Usersets(
                child=[Userset(this={}), Userset(computed_userset={"relation": "owner"})],
            ),
            "viewer": Usersets(
                child=[
                    Userset(this={}),
                    Userset(computed_userset={"relation": "editor"}),
                ],
            ),
        },
        metadata=Metadata(
            relations={
                "owner": RelationMetadata(directly_related_user_types=[RelationReference(type="user")]),
                "editor": RelationMetadata(directly_related_user_types=[RelationReference(type="user")]),
                "viewer": RelationMetadata(
                    directly_related_user_types=[
                        RelationReference(type="user"),
                        RelationReference(type="user", wildcard={}),
                    ]
                ),
            }
        ),
    ),
    # ── Subscription capability RBAC ──────────────────────────
    TypeDefinition(
        type="plan",
        relations={"subscriber": Userset(this={})},
        metadata=Metadata(
            relations={
                "subscriber": RelationMetadata(
                    directly_related_user_types=[RelationReference(type="user")],
                ),
            }
        ),
    ),
    TypeDefinition(
        type="capability",
        relations={
            "granted": Userset(
                tuple_to_userset=TupleToUserset(
                    tupleset=ObjectRelation(relation="associated_plan"),
                    computed_userset=ObjectRelation(relation="subscriber"),
                ),
            ),
            "associated_plan": Userset(this={}),
        },
        metadata=Metadata(
            relations={
                "granted": RelationMetadata(directly_related_user_types=[]),
                "associated_plan": RelationMetadata(
                    directly_related_user_types=[RelationReference(type="plan")],
                ),
            }
        ),
    ),
]


async def ensure_fga_store() -> tuple[str, str]:
    """Ensure the OpenFGA store and authorization model exist.

    Returns ``(store_id, authorization_model_id)``.
    """
    fga_cfg = configs.Fga

    # If both IDs are already known, return early
    if fga_cfg.StoreId and fga_cfg.AuthorizationModelId:
        return fga_cfg.StoreId, fga_cfg.AuthorizationModelId

    # Connect without a store to bootstrap
    cfg = ClientConfiguration(api_url=fga_cfg.ApiUrl)
    api = OpenFgaApi(cfg)

    try:
        # ── Store ──────────────────────────────────────────────
        store_id = fga_cfg.StoreId
        if not store_id:
            # Check if our store already exists
            stores_resp = await api.list_stores()
            if stores_resp is not None:
                for s in stores_resp.stores or []:
                    if s.name == "xyzen":
                        store_id = s.id or ""
                        break

            if not store_id:
                resp = await api.create_store(CreateStoreRequest(name="xyzen"))
                if resp is None:
                    raise RuntimeError("Failed to create OpenFGA store")
                store_id = resp.id or ""
                logger.info("Created OpenFGA store: %s", store_id)
            else:
                logger.info("Found existing OpenFGA store: %s", store_id)

        # ── Authorization model ────────────────────────────────
        # Reconfigure with the store ID
        cfg.store_id = str(store_id)
        api = OpenFgaApi(cfg)

        model_resp = await api.write_authorization_model(
            WriteAuthorizationModelRequest(
                schema_version=_SCHEMA_VERSION,
                type_definitions=_TYPE_DEFINITIONS,
            )
        )
        if model_resp is None:
            raise RuntimeError("Failed to write OpenFGA authorization model")
        model_id: str = model_resp.authorization_model_id or ""
        logger.info("Wrote OpenFGA authorization model: %s", model_id)

        # Persist so subsequent calls skip bootstrap
        fga_cfg.StoreId = str(store_id)
        fga_cfg.AuthorizationModelId = model_id

        return str(store_id), model_id
    finally:
        await api.close()
