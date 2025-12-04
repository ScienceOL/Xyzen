import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_google_vertexai import ChatVertexAI
from langchain_openai import AzureChatOpenAI, ChatOpenAI

from common.code import ErrCode
from schemas.provider import LLMCredentials

from .config import ModelInstance, ProviderType, config_manager

logger = logging.getLogger(__name__)


class ChatModelFactory:
    def __init__(self) -> None:
        self.config_manager = config_manager

    def create(
        self, model: str, provider: ProviderType | None, credentials: LLMCredentials, **runtime_kwargs: dict[str, Any]
    ) -> ModelInstance:
        """
        核心入口：创建一个配置好的 LangChain ChatModel 实例
        :param model_name: 模型名称 (如 "gpt-4o")
        :param api_key: 用户的 API Key
        :param runtime_kwargs: 运行时参数 (如 temperature, streaming, callbacks)
        """
        config = self.config_manager.get_model_config(model)
        if not config:
            raise ErrCode.MODEL_NOT_SUPPORTED.with_messages("Model not supported")

        if not provider:
            provider = config["provider_type"]

        match provider:
            case ProviderType.OPENAI:
                logger.info(f"Creating OpenAI model {model}")
                llm = self._create_openai(model, credentials, runtime_kwargs)
            case ProviderType.AZURE_OPENAI:
                logger.info(f"Creating Azure OpenAI model {model}")
                llm = self._create_azure_openai(model, credentials, runtime_kwargs)
            case ProviderType.GOOGLE:
                logger.info(f"Creating Google model {model}")
                llm = self._create_google(model, credentials, runtime_kwargs)
            case ProviderType.GOOGLE_VERTEX:
                logger.info(f"Creating Google Vertex model {model}")
                llm = self._create_google_vertex(model, credentials, runtime_kwargs)

        return ModelInstance(llm=llm, config=config)

    def _create_openai(self, model: str, credentials: LLMCredentials, runtime_kwargs: dict[str, Any]) -> BaseChatModel:
        return ChatOpenAI(
            model=model,
            api_key=credentials["api_key"],
            **runtime_kwargs,
        )

    def _create_azure_openai(
        self, model: str, credentials: LLMCredentials, runtime_kwargs: dict[str, Any]
    ) -> BaseChatModel:
        if "azure_endpoint" not in credentials:
            if "api_endpoint" not in credentials:
                raise ErrCode.MODEL_NOT_AVAILABLE.with_messages("Azure endpoint is not provided")
            azure_endpoint = credentials["api_endpoint"]
        else:
            azure_endpoint = credentials["azure_endpoint"]
        if "azure_deployment" not in credentials:
            azure_deployment = model
        else:
            azure_deployment = credentials["azure_deployment"]

        # Get api_version from credentials, default to a recent stable version if not provided
        api_version = credentials.get("azure_version", "2024-02-15-preview")

        return AzureChatOpenAI(
            azure_deployment=azure_deployment,
            api_key=credentials["api_key"],
            azure_endpoint=azure_endpoint,
            api_version=api_version,
            **runtime_kwargs,
        )

    def _create_google(self, model: str, credentials: LLMCredentials, runtime_kwargs: dict[str, Any]) -> BaseChatModel:
        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=credentials["api_key"],
            **runtime_kwargs,
        )

    def _create_google_vertex(
        self, model: str, credentials: LLMCredentials, runtime_kwargs: dict[str, Any]
    ) -> BaseChatModel:
        if "vertex_sa" not in credentials:
            raise ErrCode.MODEL_NOT_AVAILABLE.with_messages("Vertex service account is not provided")

        import json
        import os
        import tempfile

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as file:
            json.dump(credentials["vertex_sa"], file)
            tmp_path = file.name
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp_path

        return ChatVertexAI(
            model=model,
            location="global",
            **runtime_kwargs,
        )
