"""Image generation configuration."""

from pydantic import BaseModel, Field


class ImageConfig(BaseModel):
    """Configuration for image generation and vision tools."""

    Provider: str = Field(
        default="google_vertex",
        description="Provider for image generation (e.g., google_vertex, openai)",
    )
    Model: str = Field(
        default="gemini-3-pro-image-preview",
        description="Model for image generation",
    )
    VisionModel: str = Field(
        default="gemini-3-flash-preview",
        description="Model for image analysis/vision tasks (e.g., read_image tool)",
    )
