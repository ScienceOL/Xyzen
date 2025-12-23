import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent import AgentCreate, AgentScope
from app.repos.agent import AgentRepository


@pytest.mark.asyncio
async def test_starred_listings(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    test_user_id = "test-user-id"

    # 1. Create a test agent
    agent_repo = AgentRepository(db_session)
    agent_data = AgentCreate(
        name="Star Test Agent",
        description="Testing stars",
        scope=AgentScope.USER,
        model="gpt-4",
        prompt="You are a star.",
    )
    agent = await agent_repo.create_agent(agent_data, test_user_id)
    await db_session.commit()

    # 2. Publish agent
    publish_payload = {
        "agent_id": str(agent.id),
        "commit_message": "Initial release",
        "is_published": True,
    }
    response = await async_client.post(
        "/xyzen/api/v1/marketplace/publish",
        json=publish_payload,
    )
    assert response.status_code == 200
    marketplace_id = response.json()["marketplace_id"]

    # 3. Star the listing
    response = await async_client.post(
        f"/xyzen/api/v1/marketplace/{marketplace_id}/like",
        json={},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_liked"] is True
    assert data["likes_count"] == 1

    # 4. Get starred listings
    response = await async_client.get("/xyzen/api/v1/marketplace/starred")
    assert response.status_code == 200
    starred_list = response.json()
    assert len(starred_list) == 1
    assert starred_list[0]["id"] == marketplace_id

    # 5. Unstar listing
    response = await async_client.post(
        f"/xyzen/api/v1/marketplace/{marketplace_id}/like",
        json={},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_liked"] is False
    assert data["likes_count"] == 0

    # 6. Verify empty starred list
    response = await async_client.get("/xyzen/api/v1/marketplace/starred")
    assert response.status_code == 200
    starred_list = response.json()
    assert len(starred_list) == 0


@pytest.mark.asyncio
async def test_listing_history_and_publishing(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    test_user_id = "test-user-id"

    # 1. Create a test agent
    agent_repo = AgentRepository(db_session)
    agent_data = AgentCreate(
        name="History Test Agent",
        description="Testing history",
        scope=AgentScope.USER,
        model="gpt-4",
        prompt="Version 1 prompt",
    )
    agent = await agent_repo.create_agent(agent_data, test_user_id)
    await db_session.commit()

    # 2. Publish v1
    publish_payload = {
        "agent_id": str(agent.id),
        "commit_message": "Version 1",
        "is_published": True,
    }
    response = await async_client.post(
        "/xyzen/api/v1/marketplace/publish",
        json=publish_payload,
    )
    assert response.status_code == 200
    marketplace_id = response.json()["marketplace_id"]

    # 3. Update Agent and Publish v2
    update_payload = {
        "name": "History Test Agent v2",
        "description": "Updated description",
        "tags": ["v2"],
        "commit_message": "Version 2",
    }
    response = await async_client.patch(
        f"/xyzen/api/v1/marketplace/{marketplace_id}/agent",
        json=update_payload,
    )
    assert response.status_code == 200
    listing_v2_basic = response.json()
    assert listing_v2_basic["name"] == "History Test Agent v2"

    # Check snapshot version by fetching listing details
    response = await async_client.get(f"/xyzen/api/v1/marketplace/{marketplace_id}")
    assert response.status_code == 200
    listing_v2 = response.json()
    assert listing_v2["snapshot"]["version"] == 2

    # 4. Get history
    response = await async_client.get(
        f"/xyzen/api/v1/marketplace/{marketplace_id}/history",
    )
    assert response.status_code == 200
    history = response.json()
    assert len(history) == 2
    # Sort history by version
    history.sort(key=lambda x: x["version"])  # type: ignore
    assert history[0]["version"] == 1
    assert history[1]["version"] == 2

    # 5. Publish specific version (Rollback to v1)
    response = await async_client.post(
        f"/xyzen/api/v1/marketplace/{marketplace_id}/publish-version",
        json={"version": 1},
    )
    assert response.status_code == 200

    # 6. Verify active snapshot via get listing details
    response = await async_client.get(f"/xyzen/api/v1/marketplace/{marketplace_id}")
    assert response.status_code == 200
    listing_rollback = response.json()
    assert listing_rollback["snapshot"]["version"] == 1
