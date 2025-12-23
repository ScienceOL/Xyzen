from typing import Any

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent import AgentCreate, AgentScope
from app.repos.agent import AgentRepository
from app.repos.agent_marketplace import AgentMarketplaceRepository


@pytest.mark.asyncio
async def test_publish_agent_with_readme(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    test_user_id = "test-user-id"

    # 1. Create a test agent
    agent_repo = AgentRepository(db_session)
    agent_data = AgentCreate(
        name="Readme Test Agent",
        description="Testing readme publication",
        scope=AgentScope.USER,
        model="gpt-4",
        prompt="You are a test agent.",
    )
    agent = await agent_repo.create_agent(agent_data, test_user_id)
    await db_session.commit()

    # 2. Publish agent with README
    readme_content = "# Test Readme\n\nThis is a test readme."
    payload: dict[str, Any] = {
        "agent_id": str(agent.id),
        "commit_message": "Initial release with readme",
        "is_published": True,
        "readme": readme_content,
    }

    response = await async_client.post(
        "/xyzen/api/v1/marketplace/publish",
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    marketplace_id = data["marketplace_id"]

    # 3. Verify README in response
    assert data.get("readme") == readme_content

    # 4. Fetch listing to verify persistence
    response = await async_client.get(
        f"/xyzen/api/v1/marketplace/{marketplace_id}",
    )
    assert response.status_code == 200
    listing_data = response.json()
    assert listing_data["readme"] == readme_content

    # 5. Update README via PATCH endpoint
    new_readme = "# Updated Readme\n\nNew content."
    update_payload = {"readme": new_readme}
    response = await async_client.patch(
        f"/xyzen/api/v1/marketplace/{marketplace_id}",
        json=update_payload,
    )
    assert response.status_code == 200
    updated_data = response.json()
    assert updated_data["readme"] == new_readme

    # 6. Verify update persisted in DB
    from uuid import UUID

    repo = AgentMarketplaceRepository(db_session)
    listing = await repo.get_by_id(UUID(marketplace_id))
    assert listing is not None
    assert listing.readme == new_readme
