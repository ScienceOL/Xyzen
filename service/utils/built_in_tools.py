import json
import traceback
from pathlib import Path
from typing import Any, Dict, List
from urllib import parse, request

import openai
from fastmcp import FastMCP

from internal import configs
from utils.logger_config import dynamic_logger
from utils.tool_loader import change_manager, tool_loader

logger = dynamic_logger.get_logger("dynamic-mcp-server")

SERVER_NAME = "DynamicToolsServer"
SERVER_VERSION = "1.0.0"
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 3001
TOOLS_DIR = "tools"
TOOL_EXECUTION_MODE = "container"
TOOL_SOURCE = "database"
llm_config = configs.LLM


def register_built_in_tools(mcp: FastMCP) -> None:
    @mcp.tool
    def search_github(query: str, max_results: int = 10, sort_by: str = "stars") -> List[Dict[str, Any]]:
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
            results = []
            for i, item in enumerate(items, 1):
                repo_info = {
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

    # noinspection PyTypeChecker
    # @mcp.tool
    def llm_web_search(query: str) -> str:
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
            # Configure OpenAI client with configuration values
            api_key = llm_config.key
            base_url = llm_config.endpoint
            model = llm_config.deployment
            if not api_key:
                return "❌ Configuration error: OpenAI API key not set"
            client = openai.OpenAI(api_key=api_key, base_url=base_url)
            logger.info(f"Executing advanced web search for query: '{query}'")
            # Execute search with AI enhancement
            response_with_search = client.responses.create(
                model=model,
                tools=[
                    {
                        "type": "web_search_preview",
                        "search_context_size": "medium",
                    }
                ],
                input=f"""You will receive a search request.
    **Do not add, infer, or guess any facts—use only the text in those snippets.**
    **Avoid any info sources from huggingface and other AI-related datasets.**

    Search query: {query}""",
                temperature=0,
            )
            search_result = response_with_search.output_text

            # Process URL citations
            annotations: List[Dict[str, Any]] = []
            citations_text = ""

            try:
                # Use dynamic access to avoid type checking issues
                output = getattr(response_with_search, "output", None)
                if output and len(output) > 1:
                    output_item = output[1]
                    content = getattr(output_item, "content", None)
                    if content and len(content) > 0:
                        content_item = content[0]
                        annotations = getattr(content_item, "annotations", [])

                logger.info(f"📎 Found {len(annotations)} URL citations")

                # Format citation information
                if annotations:
                    citations_text = "\n\n**Reference Sources:**\n"
                    for i, annotation in enumerate(annotations, 1):
                        try:
                            # Clean URL, remove utm_source parameters
                            title = getattr(annotation, "title", "Unknown Title")
                            url = getattr(annotation, "url", "#")
                            clean_url = url.split("?utm_source=")[0] if "?utm_source=" in url else url
                            citations_text += f"{i}. [{title}]({clean_url})\n"
                            logger.info(f"📖 Citation {i}: {title} -> {clean_url}")
                        except Exception as citation_error:
                            logger.warning(f"⚠️ Failed to process citation {i}: {citation_error}")

            except Exception as e:
                logger.warning(f"⚠️ Failed to extract citations: {e}")
                logger.debug(f"🔍 Response type: {type(response_with_search)}")
                citations_text = ""

            # Merge search results and citation information
            final_result = search_result + citations_text

            logger.info(f"🎉 Advanced web search completed successfully for query: '{query}'")
            logger.info(f"📊 Result: {len(search_result)} chars + {len(citations_text)} chars citations")

            # Return formatted result with citations
            return final_result

        except Exception as e:
            logger.error(f"❌ OpenAI API call failed: {str(e)}")
            logger.error(f"🔍 Error details: {traceback.format_exc()}")
            return f"❌ Search error: {str(e)}"

    @mcp.tool
    def get_tools_changes() -> Dict[str, Any]:
        """
        Get tool change information, comparing current and previous versions

        Returns:
            Dictionary containing tool change details
        """
        return change_manager.get_change_summary()

    @mcp.tool
    async def refresh_tools() -> Dict[str, Any]:
        """
        Manually refresh tools in the tools directory

        Returns:
            Result of the refresh operation
        """
        try:
            # Re-scan and load tools
            tools = tool_loader.scan_and_load_tools()
            tool_loader.register_tools_to_mcp(mcp, tools)

            changes = change_manager.get_change_summary()

            return {
                "status": "success",
                "message": "Tools refreshed successfully",
                "loaded_tools": list(tools.keys()),
                "changes": changes,
            }
        except Exception as e:
            return {"status": "error", "message": f"Error refreshing tools: {str(e)}"}

    @mcp.tool
    def get_server_status() -> Dict[str, Any]:
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
            "tools_directory": str(Path(TOOLS_DIR).absolute()),
            "uptime": "running",
            "change_history_count": len(change_manager.change_history),
            "environment_mode": "isolated",
            "execution_mode": TOOL_EXECUTION_MODE,
            "tool_source": TOOL_SOURCE,
            "proxy_tools_count": len(tool_loader.proxy_manager.list_proxies()),
            "container_proxy_tools_count": len(tool_loader.proxy_manager.list_proxies()),
        }

    # ================================
    # Resources
    # ================================

    @mcp.resource("config://server")
    def get_server_config() -> dict:
        """Get server configuration information"""
        config = {
            "server": {
                "name": SERVER_NAME,
                "version": SERVER_VERSION,
                "host": SERVER_HOST,
                "port": SERVER_PORT,
            },
            "tools": {
                "directory": str(Path(TOOLS_DIR).absolute()),
            },
            "features": [
                "dynamic_tool_loading",
                "change_detection",
                "file_monitoring",
                "sse_transport",
            ],
        }
        return config
