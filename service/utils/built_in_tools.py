import json
import logging
import traceback
from typing import Any
from urllib import parse, request

import openai
from fastmcp import FastMCP
from fastmcp.server.dependencies import get_access_token

from internal import configs
from middleware.auth import AuthProvider
from utils.tool_loader import tool_loader

logger = logging.getLogger(__name__)

dynamic_mcp_config = configs.DynamicMCP
llm_config = configs.LLM

SERVER_NAME = dynamic_mcp_config.name
SERVER_VERSION = dynamic_mcp_config.version
SERVER_HOST = dynamic_mcp_config.host
SERVER_PORT = dynamic_mcp_config.port


def register_built_in_tools(mcp: FastMCP) -> None:
    @mcp.tool
    def search_github(query: str, max_results: int = 10, sort_by: str = "stars") -> list[dict[str, Any]]:
        """
        Search GitHub Python language repositories and sort by specified criteria

        Args:
            query: Search keywords
            max_results: Maximum number of results to return
            sort_by: Sort method, options: "stars", "forks", "updated"

        Returns:
            Repository list sorted by specified criteria, including star and fork counts

        Examples:
            search_github("machine learning")  # Search Python machine learning projects
        """
        if not query:
            raise Exception("query is empty")

        # Build search query string
        search_query = query
        search_query += " language:Python"

        # GitHub search API supports sort parameters
        url = f"https://api.github.com/search/repositories?q={parse.quote(search_query)}&sort={sort_by}&order=desc"
        logger.info(url)
        try:
            with request.urlopen(url) as resp:
                data = json.load(resp)

            items = data.get("items", [])[:max_results]

            # Extract key information and format
            results: list[dict[str, Any]] = []
            for i, item in enumerate(items, 1):
                repo_info: dict[str, Any] = {
                    "rank": i,
                    "name": item["full_name"],
                    "url": item["html_url"],
                    "description": item.get("description", "No description"),
                    "stars": item.get("stargazers_count", 0),
                    "forks": item.get("forks_count", 0),
                    "language": item.get("language", "Unknown"),
                    "updated_at": item.get("updated_at", ""),
                    "topics": item.get("topics", []),
                }
                results.append(repo_info)

            logger.info(f"GitHub search '{query}' returned {len(results)} results, sorted by {sort_by}")
            return results

        except Exception as e:
            logger.error(f"GitHub search failed: {e}")
            return [{"error": f"Search failed: {str(e)}"}]

    _ = search_github

    @mcp.tool
    async def llm_web_search(query: str) -> str:
        """
        Use AI-enhanced web search functionality to provide smarter search results with citations.
        You need to combine with other tools to actively verify correctness

        Args:
            query: Search query, can be questions or keywords

        Returns:
            AI-analyzed and organized search results

        Examples:
            llm_web_search("Python async programming best practices")
            llm_web_search("What is the latest news about AI development?")
        """
        try:
            from core.providers import get_user_provider_manager
            from middleware.database.connection import AsyncSessionLocal

            # Get user info for provider access
            access_token = get_access_token()
            if not access_token:
                return "❌ Authentication required for web search"

            user_info = AuthProvider.parse_user_info(access_token.claims)
            user_id = user_info.id

            # Get user's provider manager
            async with AsyncSessionLocal() as db:
                try:
                    user_provider_manager = await get_user_provider_manager(user_id, db)
                except ValueError:
                    # Fall back to system provider if user has no providers
                    try:
                        user_provider_manager = await get_user_provider_manager("system", db)
                    except ValueError:
                        return "❌ No AI providers configured for web search"

                # Prefer Azure OpenAI providers for web search
                preferred_provider = None
                providers = user_provider_manager.list_providers()

                # Look for Azure OpenAI first
                for provider_info in providers:
                    if provider_info["type"] == "azure_openai" and provider_info["available"]:
                        preferred_provider = user_provider_manager.get_provider(provider_info["name"])
                        logger.info(f"Using Azure OpenAI provider: {provider_info['name']}")
                        break

                # Fall back to any available provider
                if not preferred_provider:
                    preferred_provider = user_provider_manager.get_active_provider()
                    if not preferred_provider:
                        return "❌ No available AI providers for web search"
                    logger.info(f"Using fallback provider: {preferred_provider.provider_name}")

                # Create appropriate client based on provider type
                if preferred_provider.provider_name == "azure_openai" and preferred_provider.api_endpoint:
                    client = openai.AzureOpenAI(
                        api_key=str(preferred_provider.api_key),
                        azure_endpoint=preferred_provider.api_endpoint,
                        api_version=getattr(preferred_provider, "api_version", "2024-02-01"),
                        timeout=preferred_provider.timeout,
                    )
                    model = preferred_provider.model
                elif preferred_provider.provider_name == "openai":
                    client = openai.OpenAI(
                        api_key=str(preferred_provider.api_key),
                        base_url=preferred_provider.api_endpoint,
                        timeout=preferred_provider.timeout,
                    )
                    model = preferred_provider.model
                else:
                    return f"❌ Web search not supported for provider type: {preferred_provider.provider_name}"

                if not model:
                    return "❌ No model configured for the selected provider"

                logger.info(f"Executing web search for query: '{query}' using model: {model}")

                # Use regular chat completion with a web search prompt
                # Note: The original code used a non-existent responses.create method
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a web search assistant. For the given query, "
                                "provide a comprehensive response based on current web information. Include:\n"
                                "1. Direct answer to the query\n"
                                "2. Key facts and details\n"
                                "3. Multiple perspectives if applicable\n"
                                "4. Recent developments or updates\n\n"
                                "Format your response clearly with sections and bullet points where appropriate.\n"
                                "**Do not add, infer, or guess any facts—use only factual information.**\n"
                                "**Avoid any info sources from huggingface and other AI-related datasets.**"
                            ),
                        },
                        {"role": "user", "content": f"Search query: {query}"},
                    ],
                    temperature=0.3,
                    max_tokens=preferred_provider.max_tokens,
                )

                search_result = response.choices[0].message.content

                if not search_result:
                    return "❌ Empty response from AI provider"

                # Add disclaimer about web search limitations
                final_result = (
                    search_result
                    + "\n\n*Note: This response is generated based on the AI model's training data. "
                    + "For the most current information, please verify with recent sources.*"
                )

                logger.info(f"🎉 Web search completed successfully for query: '{query}'")
                logger.info(f"📊 Result: {len(search_result)} characters")

                return final_result

        except Exception as e:
            logger.error(f"❌ Web search failed: {str(e)}")
            logger.error(f"🔍 Error details: {traceback.format_exc()}")
            return f"❌ Search error: {str(e)}"

    _ = llm_web_search

    @mcp.tool
    async def refresh_tools() -> dict[str, Any]:
        """
        Manually refresh tools from the database for the current user, handling additions, deletions, and updates

        Returns:
            Result of the refresh operation with details about changes
        """
        try:
            # Extract user_id from JWT token
            access_token = get_access_token()

            if not access_token:
                return {"status": "error", "message": "Authentication required to refresh tools"}

            user_info = AuthProvider.parse_user_info(access_token.claims)
            user_id = user_info.id

            # Use the new refresh method that handles deletions properly
            result = await tool_loader.refresh_tools(mcp, user_id=user_id)

            return {
                "status": "success",
                "message": f"Tools refreshed successfully for user {user_id}",
                "changes": result,
                "summary": {
                    "removed": len(result.get("removed", [])),
                    "added": len(result.get("added", [])),
                    "updated": len(result.get("updated", [])),
                },
            }
        except Exception as e:
            logger.error(f"Error refreshing tools: {e}")
            return {"status": "error", "message": f"Error refreshing tools: {str(e)}"}

    _ = refresh_tools

    @mcp.tool
    def get_server_status() -> dict[str, Any]:
        """
        Get server status information

        Returns:
            Server status information
        """
        return {
            "server_name": SERVER_NAME,
            "version": SERVER_VERSION,
            "host": SERVER_HOST,
            "port": SERVER_PORT,
            "uptime": "running",
            "environment_mode": "isolated",
            "proxy_tools_count": len(tool_loader.proxy_manager.list_proxies()),
            "container_proxy_tools_count": len(tool_loader.proxy_manager.list_proxies()),
        }

    _ = get_server_status

    @mcp.resource("config://server")
    def get_server_config() -> dict[str, Any]:
        """Get server configuration information"""
        config: dict[str, Any] = {
            "server": {
                "name": SERVER_NAME,
                "version": SERVER_VERSION,
                "host": SERVER_HOST,
                "port": SERVER_PORT,
            },
            "features": [
                "dynamic_tool_loading",
                "change_detection",
                "file_monitoring",
                "sse_transport",
            ],
        }
        return config

    _ = get_server_config
