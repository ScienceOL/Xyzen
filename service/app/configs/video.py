"""Video generation configuration.

Region-aware: the effective provider/model are determined at runtime
by get_video_config() which reads configs.Region.
"""

from pydantic import BaseModel, Field


class VideoConfig(BaseModel):
    """Configuration for video generation tools.

    These fields serve as defaults for the "global" region and can be
    overridden per-region via _REGION_VIDEO_OVERRIDES in this module.
    They can also be set via env vars (XYZEN_VIDEO_Provider, etc.).
    """

    Provider: str = Field(
        default="google_vertex",
        description="Provider for video generation (currently only google_vertex)",
    )
    Model: str = Field(
        default="veo-3.0-generate-preview",
        description="Model for text-to-video / image-to-video generation",
    )
    GCSBucket: str = Field(
        default="",
        description="GCS bucket URI for Vertex AI video output (e.g. gs://bucket-name/path/)",
    )
    PersonGeneration: str = Field(
        default="allow_adult",
        description="Person generation policy: dont_allow or allow_adult",
    )


# ---------------------------------------------------------------------------
# Region-specific overrides
# Only keys that differ from the env-var / default config need to be listed.
# ---------------------------------------------------------------------------

_REGION_VIDEO_OVERRIDES: dict[str, dict[str, str]] = {}


def get_video_config() -> VideoConfig:
    """Return the effective video config for the current region.

    Starts from the base config (env vars / defaults) and applies
    region-specific overrides on top.
    """
    from app.configs import configs

    region = configs.Region.lower()
    overrides = _REGION_VIDEO_OVERRIDES.get(region, {})
    return configs.Video.model_copy(update=overrides)
