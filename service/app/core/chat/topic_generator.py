import json
import logging
from typing import TYPE_CHECKING
from uuid import UUID

from langchain_core.messages import HumanMessage

from app.configs import configs
from app.core.providers import get_user_provider_manager
from app.infra.database import AsyncSessionLocal
from app.models.topic import TopicUpdate
from app.repos.session import SessionRepository
from app.repos.topic import TopicRepository
from app.schemas.provider import ProviderType

if TYPE_CHECKING:
    from app.api.ws.v1.chat import ConnectionManager

logger = logging.getLogger(__name__)


def _select_title_generation_model(
    *,
    provider_type: ProviderType | None,
    session_model: str | None,
    default_model: str | None,
) -> str | None:
    if provider_type == ProviderType.GOOGLE_VERTEX:
        return "gemini-2.5-flash"
    if provider_type == ProviderType.AZURE_OPENAI:
        return "gpt-5-mini"
    return session_model or default_model


async def generate_and_update_topic_title(
    message_text: str,
    topic_id: UUID,
    session_id: UUID,
    user_id: str,
    connection_manager: "ConnectionManager",
    connection_id: str,
) -> None:
    """
    Background task to generate a concise title for a topic based on its content
    and update it in the database.

    Args:
        topic_id: The UUID of the topic to update
        user_id: The user ID (for LLM access)
        connection_manager: WebSocket connection manager to broadcast updates
        connection_id: The specific WebSocket connection ID to send the update to
    """
    logger.info(f"Starting background title generation for topic {topic_id}")

    async with AsyncSessionLocal() as db:
        try:
            topic_repo = TopicRepository(db)
            session_repo = SessionRepository(db)

            topic = await topic_repo.get_topic_by_id(topic_id)
            if not topic:
                logger.warning(f"Topic {topic_id} not found for title generation")
                return

            user_provider_manager = await get_user_provider_manager(user_id, db)

            # Prefer the session-selected provider/model; otherwise fall back to system defaults.
            session = await session_repo.get_session_by_id(session_id)
            provider_id = str(session.provider_id) if session and session.provider_id else None
            session_model = session.model if session and session.model else None

            default_cfg = configs.LLM.default_config
            default_model = default_cfg.model if default_cfg else None

            provider_type: ProviderType | None = None
            if provider_id:
                cfg = user_provider_manager.get_provider_config(provider_id)
                provider_type = cfg.provider_type if cfg else None
            else:
                provider_type = configs.LLM.default_provider

            model_name = _select_title_generation_model(
                provider_type=provider_type,
                session_model=session_model,
                default_model=default_model,
            )

            if not model_name:
                logger.error("No model configured for title generation")
                return
            prompt = (
                "Please generate a short, concise title (3-5 words) based on the following user query. "
                "Do not use quotes. "
                "Return ONLY the title text.\n\n"
                f"{message_text}"
            )

            llm = user_provider_manager.create_langchain_model(provider_id, model_name)
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            logger.debug(f"LLM response: {response}")

            updated_topic = None
            new_title = None

            new_title = response.content
            if isinstance(new_title, str):
                updated_topic = await topic_repo.update_topic(topic_id, TopicUpdate(name=new_title))
                await db.commit()

            if updated_topic:
                logger.info(f"Updated topic {topic_id} title to: {new_title}")
                event = {
                    "type": "topic_updated",  # Custom event type
                    "data": {
                        "id": str(updated_topic.id),
                        "name": updated_topic.name,
                        "updated_at": updated_topic.updated_at.isoformat(),
                    },
                }
                await connection_manager.send_personal_message(json.dumps(event), connection_id)

        except Exception as e:
            logger.error(f"Error in title generation task: {e}")
