"""
Message formatting and construction helpers for chat service.
"""

from typing import Optional

from sqlmodel.ext.asyncio.session import AsyncSession

from models.agent import Agent


async def agent_has_dynamic_mcp(db: AsyncSession, agent: Optional[Agent]) -> bool:
    """
    Check if agent has the DynamicMCPServer configured.

    Args:
        db: Database session
        agent: The agent to check

    Returns:
        True if agent has DynamicMCPServer, False otherwise
    """
    if not agent:
        return False

    # Load MCP servers for the agent using AgentRepository
    from repo.agent import AgentRepository

    agent_repo = AgentRepository(db)
    mcp_servers = await agent_repo.get_agent_mcp_servers(agent.id)

    if not mcp_servers:
        return False

    return any(s.name == "DynamicMCPServer" or "dynamic_mcp_server" in (s.url or "").lower() for s in mcp_servers)


async def build_system_prompt(db: AsyncSession, agent: Optional[Agent]) -> str:
    """
    Build system prompt for the agent.

    Args:
        db: Database session
        agent: The agent whose prompt to build

    Returns:
        System prompt string
    """
    # Get base prompt from agent or use default
    base_prompt = """You are a helpful AI assistant.

## FRONTEND VISUALIZATION CAPABILITIES

The frontend automatically detects and renders data visualizations from your responses.
You don't need to learn complex chart configurations - just provide data in these supported formats:

### Supported Data Formats:
- **Coordinate pairs**: `[{"x": "label", "y": value}, ...]` → Automatically rendered as bar/line charts
- **Time series**: `[{"timestamp": "date", "value": number}, ...]` → Time-based line charts
- **Categorical data**: `[{"category": "name", "value": number}, ...]` → Bar or pie charts
- **Multi-series**: `[{"name": "series", "data": [...]}, ...]` → Comparison charts
- **Simple arrays**: `[120, 150, 180, 200]` → Basic trend visualization

### Chart Type Hints (Optional):
Add `"chart_type": "line|bar|pie|scatter|area"` to suggest visualization style.

### Enhanced Configuration (Optional):
```json
{
  "chart": {
    "type": "line|bar|pie|scatter|area",
    "title": "Chart Title",
    "data": [...],
    "xAxis": {"name": "X Label"},
    "yAxis": {"name": "Y Label"}
  }
}
```

### What the Frontend Handles:
- Automatic chart type detection based on data structure
- Interactive controls (zoom, hover, legend toggle)
- Responsive sizing and theming
- Export capabilities (PNG, SVG, CSV)
- Performance optimization for large datasets

### Your Role:
Focus on providing accurate, well-structured data. The frontend will handle the visualization complexity automatically.
Include descriptive labels and meaningful titles when possible.
"""

    if agent and agent.prompt:
        base_prompt = agent.prompt

    return base_prompt
