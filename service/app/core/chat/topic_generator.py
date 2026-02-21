import json
import logging
from uuid import UUID

from langchain_core.messages import HumanMessage

from app.core.providers import get_user_provider_manager
from app.infra.database import AsyncSessionLocal
from app.models.topic import TopicUpdate
from app.repos.topic import TopicRepository
from app.schemas.model_tier import get_topic_rename_config

logger = logging.getLogger(__name__)


async def generate_and_update_topic_title(
    message_text: str,
    topic_id: UUID,
    session_id: UUID,
    user_id: str,
    connection_id: str,
) -> None:
    """
    Background task to generate a concise title for a topic based on its content
    and update it in the database.

    This function publishes the update to Redis pub/sub instead of using a local
    ConnectionManager, ensuring the update reaches the client regardless of which
    pod handles the WebSocket connection.

    Args:
        message_text: The user's message to generate a title from
        topic_id: The UUID of the topic to update
        session_id: The session UUID (unused but kept for API compatibility)
        user_id: The user ID (for LLM access)
        connection_id: The WebSocket connection ID (used as Redis channel key)
    """
    logger.info(f"Starting background title generation for topic {topic_id}")

    async with AsyncSessionLocal() as db:
        try:
            topic_repo = TopicRepository(db)

            topic = await topic_repo.get_topic_by_id(topic_id)
            if not topic:
                logger.warning(f"Topic {topic_id} not found for title generation")
                return

            user_provider_manager = await get_user_provider_manager(user_id, db)

            prompt = (
                "Generate a concise title for the following user message.\n"
                "Rules:\n"
                "- The title MUST be in the same language as the user's message.\n"
                "- Maximum 10 words (or 10 Chinese/Japanese/Korean characters).\n"
                "- Do not use quotes or punctuation.\n"
                "- Return ONLY the title text, nothing else.\n\n"
                f"{message_text}"
            )

            topic_rename_model, topic_rename_provider = get_topic_rename_config()
            llm = await user_provider_manager.create_langchain_model(
                provider_id=topic_rename_provider,
                model=topic_rename_model,
            )
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            logger.debug(f"LLM response: {response}")

            # Record LLM token usage for topic rename
            try:
                from app.core.consume.tracking import record_response_usage_from_context

                await record_response_usage_from_context(
                    response,
                    source="topic_rename",
                    model_name=topic_rename_model,
                    provider=str(topic_rename_provider.value) if topic_rename_provider else None,
                )
            except Exception:
                logger.debug("Failed to record topic rename LLM usage (non-fatal)", exc_info=True)

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
                # Publish to Redis channel for cross-pod delivery
                # The redis_listener in chat.py subscribes to this channel
                from app.infra.redis import get_redis_client

                r = await get_redis_client()
                channel = f"chat:{connection_id}"
                await r.publish(channel, json.dumps(event))
                logger.debug(f"Published topic_updated event to Redis channel: {channel}")

        except Exception as e:
            logger.error(f"Error in title generation task: {e}")
