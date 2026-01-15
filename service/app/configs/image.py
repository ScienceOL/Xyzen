"""Image generation configuration."""

from pydantic import BaseModel, Field


class ImageConfig(BaseModel):
    """Configuration for image generation tools."""

    Enable: bool = Field(default=True, description="Enable image generation tools")
    Provider: str = Field(
        default="google_vertex",
        description="Provider for image generation (e.g., google_vertex, openai)",
    )
    Model: str = Field(
        default="gemini-3-pro-image-preview",
        description="Model for image generation",
    )
