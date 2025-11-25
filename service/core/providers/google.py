"""
Google Gemini LLM Provider implementation.
Uses LangChain's ChatGoogleGenerativeAI for AI Studio and ChatVertexAI for Vertex AI.
"""

import logging
from typing import Any, Dict, Optional

from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI

# Try to import Vertex AI support
from langchain_google_vertexai import ChatVertexAI
from pydantic import BaseModel, SecretStr

from .base import BaseLLMProvider

logger = logging.getLogger(__name__)


class GoogleConfig(BaseModel):
    """Configuration for Google provider."""

    vertexai: bool = False
    project_id: Optional[str] = None
    location: Optional[str] = "us-central1"

    class Config:
        """Allow extra fields."""

        extra = "allow"


class GoogleProvider(BaseLLMProvider):
    """
    Google Gemini provider implementation using LangChain.
    Supports both Google AI Studio (default) and Vertex AI.
    """

    def __init__(
        self,
        api_key: SecretStr,
        api_endpoint: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        timeout: int = 60,
        vertexai: bool = False,
        project: Optional[str] = None,
        location: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        """
        Initialize the Google provider.

        Args:
            api_key: API key (for AI Studio) or credentials placeholder (for Vertex)
            api_endpoint: Optional API endpoint
            model: Model name
            max_tokens: Max output tokens
            temperature: Temperature
            timeout: Timeout in seconds
            vertexai: Whether to use Vertex AI
            project: Google Cloud Project ID (Vertex AI)
            location: Google Cloud Location (Vertex AI)
            **kwargs: Additional config
        """
        super().__init__(
            api_key=api_key,
            api_endpoint=api_endpoint,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=timeout,
            **kwargs,
        )
        self.vertexai = vertexai
        self.project = project
        self.location = location

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "google_vertex" if self.vertexai else "google"

    def to_langchain_model(self) -> BaseChatModel:
        """
        Convert this provider to a LangChain model instance.
        Uses ChatVertexAI if vertexai=True, otherwise ChatGoogleGenerativeAI.

        Returns:
            BaseChatModel instance
        """
        # Common parameters
        langchain_params: Dict[str, Any] = {
            "model": self.model,
            "timeout": self.timeout,
            "streaming": True,
        }

        # Handle Temperature
        if self.temperature is not None:
            langchain_params["temperature"] = self.temperature

        # Handle Max Tokens (Google uses max_output_tokens)
        if self.max_tokens is not None:
            langchain_params["max_output_tokens"] = self.max_tokens

        # Vertex AI Path
        if self.vertexai:
            # Resolve Project and Location
            # Check config if not provided in init
            config_data = self.config or {}
            google_config = GoogleConfig(**config_data)

            project_id = self.project or google_config.project_id
            location = self.location or google_config.location

            if not project_id:
                # Vertex AI might rely on ADC/Environment, so we warn but don't block
                logger.warning("No project_id provided for Vertex AI. Relying on environment configuration.")

            langchain_params["project"] = project_id
            langchain_params["location"] = location or "us-central1"

            logger.debug(f"Initializing ChatVertexAI for {self.model} (project={project_id}, location={location})")
            return ChatVertexAI(**langchain_params)

        # Google AI Studio Path (Default)
        else:
            langchain_params["google_api_key"] = self.api_key
            # Gemini models sometimes behave better with this flag in LangChain
            langchain_params["convert_system_message_to_human"] = True

            logger.debug(f"Initializing ChatGoogleGenerativeAI for {self.model}")
            return ChatGoogleGenerativeAI(**langchain_params)
