"""Image generation configuration.

Region-aware: the effective provider/model are determined at runtime
by get_image_config() which reads configs.Region.
"""

from pydantic import BaseModel, Field


class ImageConfig(BaseModel):
    """Configuration for image generation and vision tools.

    These fields serve as defaults for the "global" region and can be
    overridden per-region via _REGION_IMAGE_CONFIGS in this module.
    They can also be set via env vars (XYZEN_IMAGE_Provider, etc.).
    """

    Provider: str = Field(
        default="google_vertex",
        description="Provider for image generation (e.g., google_vertex, qwen)",
    )
    Model: str = Field(
        default="gemini-3-pro-image-preview",
        description="Model for text-to-image generation",
    )
    EditModel: str = Field(
        default="gemini-3-pro-image-preview",
        description="Model for image editing with references",
    )
    VisionModel: str = Field(
        default="gemini-3-flash-preview",
        description="Model for image analysis/vision tasks (e.g., read_image tool)",
    )
    VisionProvider: str = Field(
        default="google_vertex",
        description="Provider for vision/analysis model",
    )


# ---------------------------------------------------------------------------
# Region-specific overrides (provider, model, vision_model, vision_provider)
# Only keys that differ from the env-var / default config need to be listed.
# ---------------------------------------------------------------------------

_REGION_IMAGE_OVERRIDES: dict[str, dict[str, str]] = {
    "china": {
        "Provider": "qwen",
        "Model": "qwen-image-max",
        "EditModel": "qwen-image-edit-max",
        "VisionModel": "qwen-vl-max-latest",
        "VisionProvider": "qwen",
    },
}


def get_image_config() -> dict[str, str]:
    """Return the effective image config dict for the current region.

    Returns a dict with keys: Provider, Model, EditModel, VisionModel, VisionProvider.
    """
    from app.configs import configs

    base = {
        "Provider": configs.Image.Provider,
        "Model": configs.Image.Model,
        "EditModel": configs.Image.EditModel,
        "VisionModel": configs.Image.VisionModel,
        "VisionProvider": configs.Image.VisionProvider,
    }

    region = configs.Region.lower()
    overrides = _REGION_IMAGE_OVERRIDES.get(region, {})
    base.update(overrides)
    return base
