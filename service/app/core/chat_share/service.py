from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCode
from app.core.fga.client import FgaClient
from app.models.chat_share import (
    ChatShare,
    ChatShareCreate,
    ChatSharePublicRead,
    ChatShareRead,
    ShareStatus,
)
from app.models.message import MessageRead
from app.models.sessions import SessionCreate
from app.models.topic import TopicCreate
from app.repos import AgentRepository, MessageRepository, SessionRepository, TopicRepository
from app.repos.chat_share import ChatShareRepository


class ChatShareService:
    def __init__(self, db: AsyncSession, fga: FgaClient | None = None) -> None:
        self.db = db
        self.fga = fga
        self.share_repo = ChatShareRepository(db)
        self.session_repo = SessionRepository(db)
        self.topic_repo = TopicRepository(db)
        self.message_repo = MessageRepository(db)
        self.agent_repo = AgentRepository(db)

    async def create_share(
        self,
        user_id: str,
        data: ChatShareCreate,
    ) -> ChatShareRead:
        # Verify topic belongs to session
        topic = await self.topic_repo.get_topic_by_id(data.topic_id)
        if not topic or topic.session_id != data.session_id:
            raise ErrCode.TOPIC_NOT_FOUND.with_messages("Topic not found or does not belong to session")

        # Verify session ownership
        session = await self.session_repo.get_session_by_id(data.session_id)
        if not session or session.user_id != user_id:
            raise ErrCode.SESSION_ACCESS_DENIED.with_messages("Session not found or access denied")

        # Build messages snapshot
        if data.messages_snapshot:
            # Frontend sent pre-processed messages (includes toolCalls, etc.)
            messages_snapshot = data.messages_snapshot
        elif data.message_ids:
            all_msgs = await self.message_repo.get_messages_by_topic(data.topic_id)
            id_set = set(data.message_ids)
            messages = [m for m in all_msgs if m.id in id_set]
            messages_snapshot = [MessageRead(**m.model_dump()).model_dump(mode="json") for m in messages]
        else:
            messages = await self.message_repo.get_messages_by_topic(data.topic_id)
            messages_snapshot = [MessageRead(**m.model_dump()).model_dump(mode="json") for m in messages]

        # Snapshot agent config
        agent_snapshot: dict[str, object] | None = None
        agent_id = session.agent_id
        if agent_id:
            agent = await self.agent_repo.get_agent_by_id(agent_id)
            if agent:
                agent_snapshot = agent.model_dump(mode="json")

        share = ChatShare(
            user_id=user_id,
            session_id=data.session_id,
            topic_id=data.topic_id,
            agent_id=agent_id,
            messages_snapshot=messages_snapshot,
            agent_snapshot=agent_snapshot,
            title=data.title or topic.name,
            message_count=len(messages_snapshot),
            allow_fork=data.allow_fork,
            expires_at=data.expires_at,
            max_uses=data.max_uses,
        )

        created = await self.share_repo.create(share)
        await self.db.commit()

        return ChatShareRead(**created.model_dump())

    async def get_share_public(self, token: str) -> ChatSharePublicRead:
        share = await self._get_valid_share(token)
        return ChatSharePublicRead(
            token=share.token,
            title=share.title,
            message_count=share.message_count,
            allow_fork=share.allow_fork,
            messages_snapshot=share.messages_snapshot,
            agent_snapshot=share.agent_snapshot,
            created_at=share.created_at,
        )

    async def fork_conversation(
        self,
        token: str,
        recipient_user_id: str,
    ) -> dict[str, UUID]:
        share = await self._get_valid_share(token)

        if not share.allow_fork:
            raise ErrCode.SHARE_FORK_NOT_ALLOWED.with_messages("This share does not allow forking")

        from app.models.agent import AgentCreate, AgentScope
        from app.repos.root_agent import RootAgentRepository

        agent_snapshot = share.agent_snapshot or {}
        original_agent_id = agent_snapshot.get("id")  # UUID string of the source agent
        original_tags: list[str] = agent_snapshot.get("tags") or []
        is_root_share = "root_agent" in original_tags

        existing_agent = None
        created_new_agent = False

        if is_root_share:
            # Case 1: Shared from a root agent → use recipient's own root agent
            root_agent_repo = RootAgentRepository(self.db)
            existing_agent = await root_agent_repo.get_agent_for_user(recipient_user_id)

        elif original_agent_id:
            # Case 2: Check if recipient already has an agent forked from the same source
            all_agents = await self.agent_repo.get_agents_by_user(recipient_user_id)
            source_uuid = UUID(original_agent_id)
            for a in all_agents:
                if a.id == source_uuid or a.original_source_id == source_uuid:
                    existing_agent = a
                    break

        if existing_agent:
            new_agent = existing_agent
        else:
            # Case 3: Create new agent (with original_source_id for future dedup)
            agent_name = agent_snapshot.get("name", "Chat")
            existing_agents = await self.agent_repo.get_agents_by_user(recipient_user_id)
            existing_names = {a.name for a in existing_agents}
            final_name = f"{agent_name} (Shared)"
            counter = 1
            while final_name in existing_names:
                counter += 1
                final_name = f"{agent_name} (Shared {counter})"

            agent_create = AgentCreate(
                scope=AgentScope.USER,
                name=final_name,
                description=agent_snapshot.get("description"),
                avatar=agent_snapshot.get("avatar"),
                tags=agent_snapshot.get("tags"),
                model=agent_snapshot.get("model"),
                temperature=agent_snapshot.get("temperature"),
                prompt=agent_snapshot.get("prompt"),
                graph_config=agent_snapshot.get("graph_config"),
                provider_id=None,
                knowledge_set_id=None,
                mcp_server_ids=[],
            )
            new_agent = await self.agent_repo.create_agent(agent_create, recipient_user_id)

            # Track the original source for future fork deduplication
            if original_agent_id:
                new_agent.original_source_id = UUID(original_agent_id)
                self.db.add(new_agent)

            created_new_agent = True

        # Find or create session for the agent
        existing_session = await self.session_repo.get_session_by_user_and_agent(recipient_user_id, new_agent.id)
        if existing_session:
            new_session = existing_session
            created_new_session = False
        else:
            session_data = SessionCreate(
                name=new_agent.name,
                agent_id=new_agent.id,
            )
            new_session = await self.session_repo.create_session(session_data, recipient_user_id)
            created_new_session = True

        # Create topic and copy messages (always new)
        topic_name = share.title or "Shared conversation"
        now = datetime.now(timezone.utc).strftime("%m/%d %H:%M")
        topic_data = TopicCreate(
            name=f"{topic_name} · {now}",
            session_id=new_session.id,
        )
        new_topic = await self.topic_repo.create_topic(topic_data)

        from app.models.message import MessageCreate

        for msg_data in share.messages_snapshot:
            # Skip tool-only assistant messages with no content (e.g. toolCalls-only)
            if not msg_data.get("content") and msg_data.get("role") != "user":
                continue
            msg = MessageCreate(
                role=msg_data["role"],
                content=msg_data["content"],
                topic_id=new_topic.id,
                thinking_content=msg_data.get("thinking_content"),
                agent_metadata=msg_data.get("agent_metadata"),
            )
            await self.message_repo.create_message(msg)

        await self.share_repo.increment_use_count(share.id)
        await self.db.commit()

        # FGA tuples — only for newly created resources
        if self.fga:
            if created_new_agent:
                try:
                    await self.fga.write_tuple(recipient_user_id, "owner", "agent", str(new_agent.id))
                except Exception:
                    pass
            if created_new_session:
                try:
                    await self.fga.write_tuple(recipient_user_id, "owner", "session", str(new_session.id))
                except Exception:
                    pass

        return {"session_id": new_session.id, "topic_id": new_topic.id, "agent_id": new_agent.id}

    async def revoke_share(self, share_id: UUID, user_id: str) -> ChatShareRead:
        share = await self.share_repo.get_by_id(share_id)
        if not share:
            raise ErrCode.SHARE_NOT_FOUND.with_messages("Share not found")
        if share.user_id != user_id:
            raise ErrCode.SHARE_ACCESS_DENIED.with_messages("Only the creator can revoke a share")

        updated = await self.share_repo.update_status(share_id, ShareStatus.REVOKED)
        await self.db.commit()
        return ChatShareRead(**(updated or share).model_dump())

    async def list_shares(self, user_id: str) -> list[ChatShareRead]:
        shares = await self.share_repo.get_by_user(user_id)
        return [ChatShareRead(**s.model_dump()) for s in shares]

    # ── Helpers ──────────────────────────────────────────────

    async def _get_valid_share(self, token: str) -> ChatShare:
        share = await self.share_repo.get_by_token(token)
        if not share:
            raise ErrCode.SHARE_NOT_FOUND.with_messages("Share not found")

        if share.status == ShareStatus.REVOKED:
            raise ErrCode.SHARE_REVOKED.with_messages("This share has been revoked")

        if share.expires_at and share.expires_at < datetime.now(timezone.utc):
            # Auto-expire
            await self.share_repo.update_status(share.id, ShareStatus.EXPIRED)
            await self.db.commit()
            raise ErrCode.SHARE_EXPIRED.with_messages("This share has expired")

        if share.max_uses and share.use_count >= share.max_uses:
            raise ErrCode.SHARE_MAX_USES_REACHED.with_messages("This share has reached its maximum number of uses")

        return share
