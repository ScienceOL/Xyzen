from pydantic import BaseModel, Field


class SearXNGConfig(BaseModel):
    """SearXNG Search Engine Configuration"""

    Enable: bool = Field(default=True, description="Enable SearXNG integration")
    BaseUrl: str = Field(
        default="http://127.0.0.1:8080",
        description="SearXNG instance base URL",
    )
    Timeout: int = Field(default=30, description="API request timeout in seconds")
    DefaultCategories: str = Field(
        default="general",
        description="Comma-separated default search categories",
    )
    DefaultEngines: str = Field(
        default="",
        description="Comma-separated list of engines to use (empty = all enabled)",
    )
    MaxResults: int = Field(default=10, description="Maximum results per search")
