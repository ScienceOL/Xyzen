import json
import logging
from typing import TYPE_CHECKING
from uuid import UUID

from langchain_core.messages import HumanMessage

from core.providers import get_user_provider_manager
from middleware.database.connection import AsyncSessionLocal
from models.topic import TopicUpdate
from repos.agent import AgentRepository
from repos.session import SessionRepository
from repos.topic import TopicRepository

if TYPE_CHECKING:
    from handler.ws.v1.chat import ConnectionManager

logger = logging.getLogger(__name__)


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
            agent_repo = AgentRepository(db)

            topic = await topic_repo.get_topic_by_id(topic_id)
            if not topic:
                logger.warning(f"Topic {topic_id} not found for title generation")
                return
            session = await session_repo.get_session_by_id(session_id)
            agent = None
            if session and session.agent_id:
                agent = await agent_repo.get_agent_by_id(session.agent_id)

            provider_name = None
            if agent and agent.provider_id:
                provider_name = str(agent.provider_id)

            user_provider_manager = await get_user_provider_manager(user_id, db)
            prompt = (
                "Please generate a short, concise title (3-5 words) based on the following user query. "
                "Do not use quotes. "
                "Return ONLY the title text.\n\n"
                f"{message_text}"
            )

            # Use the active model
            llm = user_provider_manager.create_langchain_model(provider_name)
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
