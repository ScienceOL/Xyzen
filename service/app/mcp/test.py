from fastmcp import FastMCP

test_mcp: FastMCP = FastMCP("Test Tools 🛠️")


@test_mcp.tool
def add(a: float, b: float) -> float:
    """Adds two numbers."""
    return a + b
