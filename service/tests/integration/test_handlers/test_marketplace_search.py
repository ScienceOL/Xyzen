import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.agent import AgentCreate, AgentScope
from app.repos.agent import AgentRepository


@pytest.mark.asyncio
async def test_marketplace_search_pagination(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    test_user_id = "test-user-id"
    agent_repo = AgentRepository(db_session)

    total_agents = 21
    for idx in range(total_agents):
        agent = await agent_repo.create_agent(
            AgentCreate(
                name=f"Pagination Agent {idx:02d}",
                description="Pagination coverage",
                scope=AgentScope.USER,
                model="gpt-4",
                prompt="Pagination test prompt",
            ),
            test_user_id,
        )
        await db_session.commit()

        response = await async_client.post(
            "/xyzen/api/v1/marketplace/publish",
            json={
                "agent_id": str(agent.id),
                "commit_message": f"Publish {idx}",
                "is_published": True,
            },
        )
        assert response.status_code == 200

    first_page_response = await async_client.get(
        "/xyzen/api/v1/marketplace/",
        params={"query": "Pagination Agent", "sort_by": "recent"},
    )
    assert first_page_response.status_code == 200
    first_page = first_page_response.json()
    assert len(first_page) == 20

    second_page_response = await async_client.get(
        "/xyzen/api/v1/marketplace/",
        params={
            "query": "Pagination Agent",
            "sort_by": "recent",
            "limit": 20,
            "offset": 20,
        },
    )
    assert second_page_response.status_code == 200
    second_page = second_page_response.json()
    assert len(second_page) == 1

    first_page_ids = {listing["id"] for listing in first_page}
    second_page_ids = {listing["id"] for listing in second_page}
    assert first_page_ids.isdisjoint(second_page_ids)
    assert len(first_page_ids | second_page_ids) == total_agents


@pytest.mark.asyncio
async def test_marketplace_recent_sort_uses_latest_listing_update(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    test_user_id = "test-user-id"
    agent_repo = AgentRepository(db_session)

    first_agent = await agent_repo.create_agent(
        AgentCreate(
            name="Recent Sort Agent A",
            description="Recent sort coverage",
            scope=AgentScope.USER,
            model="gpt-4",
            prompt="Recent sort prompt A",
        ),
        test_user_id,
    )
    await db_session.commit()

    first_publish_response = await async_client.post(
        "/xyzen/api/v1/marketplace/publish",
        json={
            "agent_id": str(first_agent.id),
            "commit_message": "Publish A",
            "is_published": True,
        },
    )
    assert first_publish_response.status_code == 200
    first_listing_id = first_publish_response.json()["marketplace_id"]

    second_agent = await agent_repo.create_agent(
        AgentCreate(
            name="Recent Sort Agent B",
            description="Recent sort coverage",
            scope=AgentScope.USER,
            model="gpt-4",
            prompt="Recent sort prompt B",
        ),
        test_user_id,
    )
    await db_session.commit()

    second_publish_response = await async_client.post(
        "/xyzen/api/v1/marketplace/publish",
        json={
            "agent_id": str(second_agent.id),
            "commit_message": "Publish B",
            "is_published": True,
        },
    )
    assert second_publish_response.status_code == 200

    patch_response = await async_client.patch(
        f"/xyzen/api/v1/marketplace/{first_listing_id}",
        json={"readme": "# Updated"},
    )
    assert patch_response.status_code == 200

    search_response = await async_client.get(
        "/xyzen/api/v1/marketplace/",
        params={"query": "Recent Sort Agent", "sort_by": "recent"},
    )
    assert search_response.status_code == 200
    search_results = search_response.json()
    assert len(search_results) >= 2
    assert search_results[0]["id"] == first_listing_id
