"""Tool repository

Provides data access interface for tools, tool versions, and tool functions
"""

import logging
import uuid
from datetime import datetime

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.tool import (
    Tool,
    ToolCreate,
    ToolFunction,
    ToolFunctionCreate,
    ToolFunctionUpdate,
    ToolStatus,
    ToolUpdate,
    ToolVersion,
    ToolVersionCreate,
    ToolVersionUpdate,
)

logger = logging.getLogger(__name__)


class ToolRepository:
    """Tool data access layer"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_tool(self, tool_data: ToolCreate, user_id: str) -> Tool:
        """
        Creates a new tool.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the tool object is populated with DB-defaults before being returned.

        Args:
            tool_data: The Pydantic model containing the data for the new tool.
            user_id: The user ID (from authentication).

        Returns:
            The newly created Tool instance.
        """
        logger.debug(f"Creating new tool for user_id: {user_id}, name: {tool_data.name}")

        tool_dict = tool_data.model_dump()
        tool_dict["user_id"] = user_id
        tool = Tool(**tool_dict)

        self.db.add(tool)
        await self.db.flush()
        await self.db.refresh(tool)

        logger.info(f"Created tool: {tool.id} for user {user_id}, name: {tool.name}")
        return tool

    async def get_tool_by_id(self, tool_id: uuid.UUID) -> Tool | None:
        """
        Fetches a tool by its ID.

        Args:
            tool_id: The ID of the tool to fetch.

        Returns:
            The Tool, or None if not found.
        """
        logger.debug(f"Fetching tool with id: {tool_id}")
        result = await self.db.exec(select(Tool).where(Tool.id == tool_id))
        tool = result.one_or_none()
        logger.debug(f"Found tool {tool_id}: {'Yes' if tool else 'No'}")
        return tool

    async def get_tool_by_user_and_name(self, user_id: str, name: str) -> Tool | None:
        """
        Fetches a tool by user ID and name (unique constraint).

        Args:
            user_id: The user ID to search for.
            name: The tool name to search for.

        Returns:
            The Tool, or None if not found.
        """
        logger.debug(f"Fetching tool for user_id: {user_id}, name: {name}")
        result = await self.db.exec(select(Tool).where(Tool.user_id == user_id, Tool.name == name))
        tool = result.one_or_none()
        logger.debug(f"Found tool for user {user_id}, name '{name}': {'Yes' if tool else 'No'}")
        return tool

    async def update_tool(self, tool_id: uuid.UUID, tool_data: ToolUpdate) -> Tool | None:
        """
        Updates an existing tool.
        This function does NOT commit the transaction.

        Args:
            tool_id: The ID of the tool to update.
            tool_data: The Pydantic model containing the update data.

        Returns:
            The updated Tool instance, or None if not found.
        """
        logger.debug(f"Updating tool with id: {tool_id}")
        tool = await self.db.get(Tool, tool_id)
        if not tool:
            logger.debug(f"Tool {tool_id} not found for update")
            return None

        # Only update fields that are not None to avoid null constraint violations
        update_data = tool_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(tool, key):
                setattr(tool, key, value)

        self.db.add(tool)
        await self.db.flush()
        await self.db.refresh(tool)

        logger.info(f"Updated tool: {tool.id}")
        return tool

    async def list_tools_by_user(
        self, user_id: str, is_active: bool | None = None, limit: int = 100, offset: int = 0
    ) -> list[Tool]:
        """
        Get list of tools for a user.

        Args:
            user_id: The user ID to fetch tools for.
            is_active: Filter by active status (None for all).
            limit: Maximum number of tools to return.
            offset: Number of tools to skip.

        Returns:
            List of Tool instances ordered by creation time (desc).
        """
        logger.debug(
            f"Fetching tools for user_id: {user_id}, is_active: {is_active}, limit: {limit}, offset: {offset}"
        )

        query = select(Tool).where(Tool.user_id == user_id)
        if is_active is not None:
            query = query.where(Tool.is_active == is_active)

        query = query.order_by(Tool.created_at.desc()).limit(limit).offset(offset)  # type: ignore
        result = await self.db.exec(query)
        tools = list(result.all())

        logger.debug(f"Found {len(tools)} tools for user {user_id}")
        return tools

    async def delete_tool(self, tool_id: uuid.UUID) -> bool:
        """
        Soft delete a tool by setting is_active to False.
        This function does NOT commit the transaction.

        Args:
            tool_id: The ID of the tool to delete.

        Returns:
            True if tool was found and deleted, False otherwise.
        """
        logger.debug(f"Soft deleting tool with id: {tool_id}")
        tool = await self.db.get(Tool, tool_id)
        if not tool:
            logger.debug(f"Tool {tool_id} not found for deletion")
            return False

        tool.is_active = False
        self.db.add(tool)
        await self.db.flush()

        logger.info(f"Soft deleted tool: {tool_id}")
        return True

    # ========== ToolVersion CRUD operations ==========

    async def create_tool_version(self, version_data: ToolVersionCreate, user_id: str) -> ToolVersion:
        """
        Creates a new tool version.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the version object is populated with DB-defaults before being returned.

        Args:
            version_data: The Pydantic model containing the data for the new version.
            user_id: The user ID (from authentication).

        Returns:
            The newly created ToolVersion instance.
        """
        logger.debug(f"Creating new tool version for user_id: {user_id}, tool_id: {version_data.tool_id}")

        version_dict = version_data.model_dump()
        version_dict["user_id"] = user_id
        version = ToolVersion(**version_dict)

        self.db.add(version)
        await self.db.flush()
        await self.db.refresh(version)

        logger.info(f"Created tool version: {version.id} for tool {version_data.tool_id}, version: {version.version}")
        return version

    async def get_tool_version_by_id(self, version_id: uuid.UUID) -> ToolVersion | None:
        """
        Fetches a tool version by its ID.

        Args:
            version_id: The ID of the version to fetch.

        Returns:
            The ToolVersion, or None if not found.
        """
        logger.debug(f"Fetching tool version with id: {version_id}")
        result = await self.db.exec(select(ToolVersion).where(ToolVersion.id == version_id))
        version = result.one_or_none()
        logger.debug(f"Found tool version {version_id}: {'Yes' if version else 'No'}")
        return version

    async def get_latest_tool_version(self, tool_id: uuid.UUID) -> ToolVersion | None:
        """
        Get the latest version of a tool.

        Args:
            tool_id: The tool ID to get the latest version for.

        Returns:
            The latest ToolVersion, or None if no versions found.
        """
        logger.debug(f"Fetching latest tool version for tool_id: {tool_id}")
        result = await self.db.exec(
            select(ToolVersion)
            .where(ToolVersion.tool_id == tool_id)
            .order_by(ToolVersion.version.desc())  # type: ignore
            .limit(1)
        )
        version = result.one_or_none()
        logger.debug(f"Found latest version for tool {tool_id}: {'Yes' if version else 'No'}")
        return version

    async def list_tool_versions_by_tool(
        self, tool_id: uuid.UUID, status: ToolStatus | None = None, limit: int = 100, offset: int = 0
    ) -> list[ToolVersion]:
        """
        Get list of tool versions for a tool.

        Args:
            tool_id: The tool ID to fetch versions for.
            status: Filter by status (None for all).
            limit: Maximum number of versions to return.
            offset: Number of versions to skip.

        Returns:
            List of ToolVersion instances ordered by version number (desc).
        """
        logger.debug(
            f"Fetching tool versions for tool_id: {tool_id}, status: {status}, limit: {limit}, offset: {offset}"
        )

        query = select(ToolVersion).where(ToolVersion.tool_id == tool_id)
        if status is not None:
            query = query.where(ToolVersion.status == status)

        query = query.order_by(ToolVersion.version.desc()).limit(limit).offset(offset)  # type: ignore
        result = await self.db.exec(query)
        versions = list(result.all())

        logger.debug(f"Found {len(versions)} versions for tool {tool_id}")
        return versions

    async def update_tool_version(self, version_id: uuid.UUID, version_data: ToolVersionUpdate) -> ToolVersion | None:
        """
        Updates an existing tool version.
        This function does NOT commit the transaction.

        Args:
            version_id: The ID of the version to update.
            version_data: The Pydantic model containing the update data.

        Returns:
            The updated ToolVersion instance, or None if not found.
        """
        logger.debug(f"Updating tool version with id: {version_id}")
        version = await self.db.get(ToolVersion, version_id)
        if not version:
            logger.debug(f"Tool version {version_id} not found for update")
            return None

        # Only update fields that are not None to avoid null constraint violations
        update_data = version_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(version, key):
                setattr(version, key, value)

        self.db.add(version)
        await self.db.flush()
        await self.db.refresh(version)

        logger.info(f"Updated tool version: {version.id}")
        return version

    async def create_tool_function(self, function_data: ToolFunctionCreate, user_id: str) -> ToolFunction:
        """
        Creates a new tool function.
        This function does NOT commit the transaction, but it does flush the session
        to ensure the function object is populated with DB-defaults before being returned.

        Args:
            function_data: The Pydantic model containing the data for the new function.
            user_id: The user ID (from authentication).

        Returns:
            The newly created ToolFunction instance.
        """
        logger.debug(
            f"Creating new tool function for user_id: {user_id}, function_name: {function_data.function_name}"
        )
        function_dict = function_data.model_dump()
        function_dict["user_id"] = user_id
        function = ToolFunction(**function_dict)
        self.db.add(function)
        await self.db.flush()
        await self.db.refresh(function)
        return function

    async def get_tool_function_by_id(self, function_id: uuid.UUID) -> ToolFunction | None:
        """
        Fetches a tool function by its ID.

        Args:
            function_id: The ID of the function to fetch.

        Returns:
            The ToolFunction, or None if not found.
        """
        logger.debug(f"Fetching tool function with id: {function_id}")
        result = await self.db.exec(select(ToolFunction).where(ToolFunction.id == function_id))
        function = result.one_or_none()
        return function

    async def list_tool_functions_by_version(self, tool_version_id: uuid.UUID) -> list[ToolFunction]:
        """
        Get list of tool functions for a tool version.

        Args:
            tool_version_id: The tool version ID to fetch functions for.

        Returns:
            List of ToolFunction instances ordered by function name.
        """
        logger.debug(f"Fetching tool functions for tool_version_id: {tool_version_id}")
        result = await self.db.exec(
            select(ToolFunction)
            .where(ToolFunction.tool_version_id == tool_version_id)
            .order_by(ToolFunction.function_name)
        )
        functions = list(result.all())
        return functions

    async def update_tool_function(
        self, function_id: uuid.UUID, function_data: ToolFunctionUpdate
    ) -> ToolFunction | None:
        """
        Updates an existing tool function.
        This function does NOT commit the transaction.

        Args:
            function_id: The ID of the function to update.
            function_data: The Pydantic model containing the update data.

        Returns:
            The updated ToolFunction instance, or None if not found.
        """
        logger.debug(f"Updating tool function with id: {function_id}")
        function = await self.db.get(ToolFunction, function_id)
        if not function:
            logger.debug(f"Tool function {function_id} not found for update")
            return None
        # Only update fields that are not None to avoid null constraint violations
        update_data = function_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(function, key):
                setattr(function, key, value)

        self.db.add(function)
        await self.db.flush()
        await self.db.refresh(function)
        return function

    async def delete_tool_function(self, function_id: uuid.UUID) -> bool:
        """
        Hard delete a tool function.
        This function does NOT commit the transaction.

        Args:
            function_id: The ID of the function to delete.

        Returns:
            True if function was found and deleted, False otherwise.
        """
        logger.debug(f"Deleting tool function with id: {function_id}")
        function = await self.db.get(ToolFunction, function_id)
        if not function:
            logger.debug(f"Tool function {function_id} not found for deletion")
            return False

        await self.db.delete(function)
        await self.db.flush()

        logger.info(f"Deleted tool function: {function_id}")
        return True

    async def get_tool_count_by_user(self, user_id: str, is_active: bool | None = None) -> int:
        """Get user's tool count"""
        logger.debug(f"Getting tool count for user_id: {user_id}, is_active: {is_active}")

        query = select(func.count()).select_from(Tool).where(Tool.user_id == user_id)
        if is_active is not None:
            query = query.where(Tool.is_active == is_active)

        result = await self.db.exec(query)
        count = result.one() or 0
        logger.debug(f"Tool count for user {user_id}: {count}")
        return count

    async def get_tool_version_count_by_tool(self, tool_id: uuid.UUID, status: ToolStatus | None = None) -> int:
        """Get tool version count for a tool"""
        logger.debug(f"Getting version count for tool_id: {tool_id}, status: {status}")

        query = select(func.count()).select_from(ToolVersion).where(ToolVersion.tool_id == tool_id)
        if status is not None:
            query = query.where(ToolVersion.status == status)

        result = await self.db.exec(query)
        count = result.one() or 0
        logger.debug(f"Version count for tool {tool_id}: {count}")
        return count

    async def get_ready_tools_by_user(self, user_id: str) -> list[Tool]:
        """
        Get all tools that have at least one READY version.

        Args:
            user_id: The user ID to fetch tools for.

        Returns:
            List of Tool instances that have ready versions.
        """
        logger.debug(f"Getting ready tools for user_id: {user_id}")

        ready_tool_ids = select(ToolVersion.tool_id).where(ToolVersion.status == ToolStatus.READY).distinct()

        result = await self.db.exec(
            select(Tool)
            .where(Tool.user_id == user_id, Tool.is_active, Tool.id.in_(ready_tool_ids))  # type: ignore
            .order_by(Tool.created_at.desc())  # type: ignore
        )
        tools = list(result.all())

        logger.debug(f"Found {len(tools)} ready tools for user {user_id}")
        return tools

    async def get_tool_function_by_version_and_name(
        self, tool_version_id: uuid.UUID, function_name: str
    ) -> ToolFunction | None:
        """
        Get a tool function by version ID and function name.

        Args:
            tool_version_id: The tool version ID.
            function_name: The function name to search for.

        Returns:
            The ToolFunction, or None if not found.
        """
        logger.debug(f"Fetching tool function for version_id: {tool_version_id}, function_name: {function_name}")
        result = await self.db.exec(
            select(ToolFunction).where(
                ToolFunction.tool_version_id == tool_version_id,
                ToolFunction.function_name == function_name,
            )
        )
        function = result.one_or_none()
        return function

    async def get_functions_by_names(
        self, tool_version_id: uuid.UUID, function_names: list[str]
    ) -> list[ToolFunction]:
        """
        Get tool functions by version ID and list of function names.

        Args:
            tool_version_id: The tool version ID.
            function_names: List of function names to search for.

        Returns:
            List of ToolFunction instances.
        """
        logger.debug(f"Fetching functions for version_id: {tool_version_id}, names: {function_names}")
        result = await self.db.exec(
            select(ToolFunction).where(
                ToolFunction.tool_version_id == tool_version_id,
                ToolFunction.function_name.in_(function_names),  # type: ignore
            )
        )
        functions = list(result.all())
        return functions

    async def hard_delete_tool(self, tool_id: uuid.UUID) -> bool:
        """
        Hard delete a tool and all its related data (versions and functions).
        This function does NOT commit the transaction.

        Args:
            tool_id: The ID of the tool to delete.

        Returns:
            True if tool was found and deleted, False otherwise.
        """
        logger.debug(f"Hard deleting tool with id: {tool_id}")
        tool = await self.db.get(Tool, tool_id)
        if not tool:
            logger.debug(f"Tool {tool_id} not found for deletion")
            return False

        versions_result = await self.db.exec(select(ToolVersion).where(ToolVersion.tool_id == tool_id))
        versions = list(versions_result.all())

        for version in versions:
            functions_result = await self.db.exec(
                select(ToolFunction).where(ToolFunction.tool_version_id == version.id)
            )
            functions = list(functions_result.all())
            for function in functions:
                await self.db.delete(function)

        for version in versions:
            await self.db.delete(version)
        await self.db.delete(tool)
        await self.db.flush()

        logger.info(f"Hard deleted tool: {tool_id}")
        return True

    async def get_tools_updated_since(self, user_id: str, since: datetime, limit: int = 50) -> list[Tool]:
        """
        Get tools updated since a specific datetime.

        Args:
            user_id: The user ID to filter by.
            since: The datetime threshold.
            limit: Maximum number of tools to return.

        Returns:
            List of Tool instances ordered by updated_at desc.
        """
        logger.debug(f"Fetching tools updated since {since} for user_id: {user_id}")
        result = await self.db.exec(
            select(Tool)
            .where(Tool.user_id == user_id, Tool.updated_at >= since)
            .order_by(Tool.updated_at.desc())  # type: ignore
            .limit(limit)
        )
        tools = list(result.all())
        return tools

    async def get_tool_versions_created_since(
        self, user_id: str, since: datetime, limit: int = 50
    ) -> list[ToolVersion]:
        """
        Get tool versions created since a specific datetime for a user.

        Args:
            user_id: The user ID to filter by.
            since: The datetime threshold.
            limit: Maximum number of versions to return.

        Returns:
            List of ToolVersion instances ordered by created_at desc.
        """
        logger.debug(f"Fetching versions created since {since} for user_id: {user_id}")
        result = await self.db.exec(
            select(ToolVersion)
            .join(Tool, ToolVersion.tool_id == Tool.id)  # type: ignore
            .where(Tool.user_id == user_id, ToolVersion.created_at >= since)
            .order_by(ToolVersion.created_at.desc())  # type: ignore
            .limit(limit)
        )
        versions = list(result.all())
        return versions

    async def get_all_tool_versions_by_user(self, user_id: str) -> list[ToolVersion]:
        """
        Get all tool versions for a user.

        Args:
            user_id: The user ID to filter by.

        Returns:
            List of ToolVersion instances.
        """
        logger.debug(f"Fetching all versions for user_id: {user_id}")
        result = await self.db.exec(
            select(ToolVersion)
            .join(Tool, ToolVersion.tool_id == Tool.id)  # type: ignore
            .where(Tool.user_id == user_id)
        )
        versions = list(result.all())
        return versions

    async def get_all_tool_functions_by_user(self, user_id: str) -> list[ToolFunction]:
        """
        Get all tool functions for a user.

        Args:
            user_id: The user ID to filter by.

        Returns:
            List of ToolFunction instances.
        """
        logger.debug(f"Fetching all functions for user_id: {user_id}")
        result = await self.db.exec(
            select(ToolFunction)
            .join(ToolVersion, ToolFunction.tool_version_id == ToolVersion.id)  # type: ignore
            .join(Tool, ToolVersion.tool_id == Tool.id)  # type: ignore
            .where(Tool.user_id == user_id)
        )
        functions = list(result.all())
        return functions
