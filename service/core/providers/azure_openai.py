"""
Azure OpenAI LLM Provider implementation.
Dedicated provider for Azure OpenAI using LangChain.
"""

import logging
from typing import Any, Dict, Optional

from langchain_core.language_models import BaseChatModel
from langchain_openai import AzureChatOpenAI
from pydantic import BaseModel, SecretStr

from .base import BaseLLMProvider

logger = logging.getLogger(__name__)


class AzureOpenAIConfig(BaseModel):
    """Configuration for Azure OpenAI provider."""

    api_version: str = "2024-10-21"
    azure_deployment: Optional[str] = None
    azure_endpoint: Optional[str] = None


class AzureOpenAIProvider(BaseLLMProvider):
    """
    Azure OpenAI provider implementation using LangChain.
    """

    def __init__(
        self,
        api_key: SecretStr,
        api_endpoint: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        timeout: int = 60,
        api_version: str = "2024-10-21",
        **kwargs: Any,
    ) -> None:
        """
        Initialize the Azure OpenAI provider.

        Args:
            api_key: The API key for authentication
            api_endpoint: Azure endpoint URL
            model: The deployment name (model name in Azure)
            max_tokens: Maximum tokens for responses (optional)
            temperature: Sampling temperature (optional)
            timeout: Request timeout in seconds
            api_version: Azure OpenAI API version
            **kwargs: Additional configuration
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
        # Store api_version if passed directly in init, though it might also come from config
        self._api_version_arg = api_version

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "azure_openai"

    def to_langchain_model(self) -> BaseChatModel:
        """
        Convert this provider to a LangChain AzureChatOpenAI model instance.

        Returns:
            AzureChatOpenAI instance ready for use with LangChain
        """
        # Parse provider-specific config
        config_data = self.config or {}
        azure_config = AzureOpenAIConfig(**config_data)

        # Determine effective values
        # API Version: argument > config > default
        api_version = self._api_version_arg or azure_config.api_version

        # Endpoint: argument > config > error
        azure_endpoint = self.api_endpoint or azure_config.azure_endpoint
        if not azure_endpoint:
            raise ValueError("Azure OpenAI requires azure_endpoint (api_endpoint) to be provided")

        # Deployment: model argument > config > error
        # In Azure, the 'model' parameter often refers to the deployment name
        deployment_name = self.model or azure_config.azure_deployment
        if not deployment_name:
            raise ValueError("Azure OpenAI requires a deployment name (model)")

        # Get model capability config (for temperature/tokens checks)
        model_config = self._get_config()
        # Heuristic: O1 models in Azure might need special handling similar to OpenAI
        is_o1_model = deployment_name.startswith("o1") or (model_config and "o1" in model_config.model_name)

        # Base parameters for AzureChatOpenAI
        langchain_params: Dict[str, Any] = {
            "api_key": self.api_key,
            "azure_endpoint": azure_endpoint,
            "azure_deployment": deployment_name,
            "api_version": api_version,
            "timeout": self.timeout,
            "streaming": True,
        }

        # Handle Temperature
        supports_temperature = not is_o1_model
        if supports_temperature and self.temperature is not None:
            langchain_params["temperature"] = self.temperature

        # Handle Max Tokens
        if self.max_tokens is not None:
            if is_o1_model:
                langchain_params["max_completion_tokens"] = self.max_tokens
            else:
                langchain_params["max_tokens"] = self.max_tokens

        logger.debug(
            f"Initializing AzureChatOpenAI for {deployment_name} (endpoint={azure_endpoint}, version={api_version})"
        )

        return AzureChatOpenAI(**langchain_params)
