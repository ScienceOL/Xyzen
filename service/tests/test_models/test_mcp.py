"""Tests for McpServer model."""

from models.mcp import McpServerCreate, McpServerUpdate


class TestMcpServerModel:
    """Test McpServer SQLModel."""

    def test_mcp_create_defaults(self) -> None:
        """Test default values are set correctly."""
        server = McpServerCreate(name="Test Server", url="http://localhost:8000", token="token-123")
        assert server.description is None

    def test_mcp_update_logic(self) -> None:
        """Test partial update."""
        update = McpServerUpdate(name="Updated Server", status="connected")
        assert update.name == "Updated Server"
        assert update.status == "connected"
        assert update.description is None
        assert update.url is None

    def test_mcp_create_full(self) -> None:
        """Test creating with all fields."""
        server = McpServerCreate(
            name="Full Server", description="A test server", url="http://mcp.local", token="secret-token"
        )
        assert server.name == "Full Server"
        assert server.description == "A test server"
        assert server.url == "http://mcp.local"
        assert server.token == "secret-token"
