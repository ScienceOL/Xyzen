"""
Skill repository — CRUD and junction table operations.

Follows the standard repository pattern: flush() only, no commits.
Commits happen at the API layer.
"""

from __future__ import annotations

import logging
from typing import Sequence
from uuid import UUID

import sqlalchemy as sa
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.skill import AgentSkillLink, Skill, SkillCreate, SkillScope, SkillUpdate

logger = logging.getLogger(__name__)


class SkillRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_skill(self, skill_data: SkillCreate, user_id: str | None = None) -> Skill:
        """
        Create a new skill.

        Does NOT commit — only flush() to get DB-generated values.

        Args:
            skill_data: Skill creation data.
            user_id: Owner user ID (None for builtin skills).

        Returns:
            The newly created Skill instance.
        """
        logger.debug(f"Creating skill '{skill_data.name}' for user_id={user_id}")
        skill_dict = skill_data.model_dump()
        skill_dict["user_id"] = user_id
        skill = Skill(**skill_dict)

        self.db.add(skill)
        await self.db.flush()
        await self.db.refresh(skill)
        return skill

    async def get_skill_by_id(self, skill_id: UUID) -> Skill | None:
        """Fetch a skill by its primary key."""
        return await self.db.get(Skill, skill_id)

    async def get_skill_by_name(self, name: str) -> Skill | None:
        """Fetch a skill by its name (returns first match)."""
        result = await self.db.exec(select(Skill).where(Skill.name == name).limit(1))
        return result.first()

    async def get_skills_by_user(self, user_id: str) -> Sequence[Skill]:
        """Fetch all skills owned by a user."""
        result = await self.db.exec(
            select(Skill).where(Skill.user_id == user_id).order_by(col(Skill.created_at).desc())
        )
        return result.all()

    async def list_builtin_skills(self) -> Sequence[Skill]:
        """Fetch all builtin skills."""
        result = await self.db.exec(select(Skill).where(Skill.scope == SkillScope.BUILTIN).order_by(col(Skill.name)))
        return result.all()

    async def get_user_and_builtin_skills(self, user_id: str) -> Sequence[Skill]:
        """Fetch all skills visible to a user (their own + builtin)."""
        from sqlmodel import or_

        result = await self.db.exec(
            select(Skill)
            .where(
                or_(
                    Skill.user_id == user_id,
                    Skill.scope == SkillScope.BUILTIN,
                )
            )
            .order_by(col(Skill.created_at).desc())
        )
        return result.all()

    async def get_visible_skill_by_name(
        self,
        user_id: str,
        name: str,
        *,
        exclude_skill_id: UUID | None = None,
    ) -> Skill | None:
        """Get a visible skill by case-insensitive name (own + builtin)."""
        from sqlmodel import or_

        stmt = (
            select(Skill)
            .where(sa.func.lower(col(Skill.name)) == name.strip().lower())
            .where(
                or_(
                    Skill.user_id == user_id,
                    Skill.scope == SkillScope.BUILTIN,
                )
            )
        )
        if exclude_skill_id:
            stmt = stmt.where(col(Skill.id) != exclude_skill_id)

        result = await self.db.exec(stmt.order_by(col(Skill.created_at).desc()))
        return result.first()

    async def update_skill(self, skill_id: UUID, skill_data: SkillUpdate) -> Skill | None:
        """
        Update an existing skill.

        Does NOT commit. Only updates explicitly set fields.

        Args:
            skill_id: The UUID of the skill to update.
            skill_data: The update data.

        Returns:
            The updated Skill, or None if not found.
        """
        skill = await self.db.get(Skill, skill_id)
        if not skill:
            return None

        update_data = skill_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if hasattr(skill, key):
                setattr(skill, key, value)

        self.db.add(skill)
        await self.db.flush()
        await self.db.refresh(skill)
        return skill

    async def delete_skill(self, skill_id: UUID) -> bool:
        """
        Delete a skill and its agent links.

        Does NOT commit.

        Returns:
            True if deleted, False if not found.
        """
        skill = await self.db.get(Skill, skill_id)
        if not skill:
            return False

        # Remove all agent links first
        link_result = await self.db.exec(select(AgentSkillLink).where(AgentSkillLink.skill_id == skill_id))
        for link in link_result.all():
            await self.db.delete(link)

        await self.db.delete(skill)
        await self.db.flush()
        return True

    # --- Junction table operations ---

    async def attach_skill_to_agent(self, agent_id: UUID, skill_id: UUID) -> bool:
        """
        Link a skill to an agent.

        Returns:
            True if created, False if link already exists.
        """
        result = await self.db.exec(
            select(AgentSkillLink).where(
                AgentSkillLink.agent_id == agent_id,
                AgentSkillLink.skill_id == skill_id,
            )
        )
        if result.first():
            return False

        link = AgentSkillLink(agent_id=agent_id, skill_id=skill_id)
        self.db.add(link)
        await self.db.flush()
        return True

    async def detach_skill_from_agent(self, agent_id: UUID, skill_id: UUID) -> bool:
        """
        Remove a skill link from an agent.

        Returns:
            True if deleted, False if not found.
        """
        result = await self.db.exec(
            select(AgentSkillLink).where(
                AgentSkillLink.agent_id == agent_id,
                AgentSkillLink.skill_id == skill_id,
            )
        )
        link = result.first()
        if not link:
            return False

        await self.db.delete(link)
        await self.db.flush()
        return True

    async def get_skills_for_agent(self, agent_id: UUID) -> Sequence[Skill]:
        """
        Get all enabled skills attached to an agent.

        Uses a join through AgentSkillLink.
        """
        join_condition = col(Skill.id) == col(AgentSkillLink.skill_id)
        result = await self.db.exec(
            select(Skill)
            .join(AgentSkillLink, join_condition)
            .where(
                AgentSkillLink.agent_id == agent_id,
                AgentSkillLink.enabled == True,  # noqa: E712
            )
        )
        return result.all()

    async def get_agent_skill_links(self, agent_id: UUID) -> Sequence[AgentSkillLink]:
        """Get all skill links for an agent (including disabled)."""
        result = await self.db.exec(select(AgentSkillLink).where(AgentSkillLink.agent_id == agent_id))
        return result.all()
