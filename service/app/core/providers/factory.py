import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from langchain_qwq import ChatQwen

from app.common.code import ErrCode
from app.core.model_registry import ModelInfo, ModelsDevService
from app.schemas.provider import LLMCredentials, ProviderType

from .config import ModelInstance

logger = logging.getLogger(__name__)


class ChatModelFactory:
    async def create(
        self, model: str, provider: ProviderType | None, credentials: LLMCredentials, **runtime_kwargs: dict[str, Any]
    ) -> ModelInstance:
        """
        核心入口：创建一个配置好的 LangChain ChatModel 实例
        :param model: 模型名称 (如 "gpt-4o")
        :param provider: Provider type
        :param credentials: 用户的 API Key
        :param runtime_kwargs: 运行时参数 (如 temperature, streaming, callbacks)
        """
        # Use ModelsDevService to get model info
        config = await ModelsDevService.get_model_info_for_key(model)

        # If not found, create a basic config
        if not config:
            config = ModelInfo(key=model)

        if not provider:
            raise ErrCode.MODEL_NOT_SUPPORTED.with_messages("Provider must be specified")

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
            case ProviderType.GPUGEEK:
                logger.info(f"Creating GPUGeek model {model}")
                llm = self._create_gpugeek(model, credentials, runtime_kwargs)
            case ProviderType.QWEN:
                logger.info(f"Creating Qwen model {model}")
                llm = self._create_qwen(model, credentials, runtime_kwargs)

        return ModelInstance(llm=llm, config=config)

    def _create_openai(self, model: str, credentials: LLMCredentials, runtime_kwargs: dict[str, Any]) -> BaseChatModel:
        llm = ChatOpenAI(
            model=model,
            api_key=credentials["api_key"],
            **runtime_kwargs,
        )

        return llm

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

        # Prevent duplicate argument error: remove azure_deployment from runtime_kwargs if present
        if "azure_deployment" in runtime_kwargs:
            del runtime_kwargs["azure_deployment"]

        # Get api_version from credentials, default to a recent stable version if not provided
        api_version = credentials.get("azure_version", "2024-02-15-preview")
        llm = AzureChatOpenAI(
            azure_deployment=azure_deployment,
            api_key=credentials["api_key"],
            azure_endpoint=azure_endpoint,
            api_version=api_version,
            # **runtime_kwargs,
        )

        return llm

    def _create_google(self, model: str, credentials: LLMCredentials, runtime_kwargs: dict[str, Any]) -> BaseChatModel:
        llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=credentials["api_key"],
            **runtime_kwargs,
        )

        return llm

    def _create_google_vertex(
        self, model: str, credentials: LLMCredentials, runtime_kwargs: dict[str, Any]
    ) -> BaseChatModel:
        if "vertex_sa" not in credentials:
            raise ErrCode.MODEL_NOT_AVAILABLE.with_messages("Vertex service account is not provided")
        if "vertex_project" not in credentials:
            raise ErrCode.MODEL_NOT_AVAILABLE.with_messages("Vertex project is not provided")

        import json
        import os
        import tempfile

        from google.oauth2 import service_account

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as file:
            json.dump(credentials["vertex_sa"], file)
            tmp_path = file.name
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp_path

        google_credentials = service_account.Credentials.from_service_account_file(
            tmp_path, scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )

        # Create the base model
        llm = ChatGoogleGenerativeAI(
            model=model,
            location="global",
            credentials=google_credentials,
            project=credentials["vertex_project"],
            **runtime_kwargs,
        )

        return llm

    def _create_gpugeek(self, model: str, credentials: LLMCredentials, runtime_kwargs: dict[str, Any]) -> BaseChatModel:
        """
        Create GPUGeek model instance using OpenAI-compatible API.

        GPUGeek provides an OpenAI-compatible endpoint that supports multiple model vendors.
        """
        # Get base_url from credentials, default to GPUGeek endpoint
        base_url = credentials.get("api_endpoint", "https://api.gpugeek.com/v1")
        if "image" in model.lower():
            base_url = "https://api.gpugeek.com/v1/predictions"

        if "deepseek-r1" in model.lower():
            llm = ChatOpenAI(
                model=model,
                api_key=credentials["api_key"],
                base_url=base_url,
                extra_body={"thinking": {"type": "enabled"}},
                **runtime_kwargs,
            )
        else:
            llm = ChatOpenAI(
                model=model,
                api_key=credentials["api_key"],
                base_url=base_url,
                **runtime_kwargs,
            )

        return llm

    def _create_qwen(self, model: str, credentials: LLMCredentials, runtime_kwargs: dict[str, Any]) -> BaseChatModel:
        """
        Create Qwen model instance.

        Qwen provides OpenAI-compatible API through DashScope.
        For vision models, we use langchain-qwq's ChatQwen integration.
        """
        if "dashscope" in model:
            model = model.replace("dashscope/", "")

        # Get base_url from credentials, default to DashScope endpoint
        base_url = credentials.get("api_endpoint", "https://dashscope.aliyuncs.com/compatible-mode/v1")

        llm = ChatQwen(
            model=model,
            api_key=credentials["api_key"],
            base_url=base_url,
            **runtime_kwargs,
        )

        return llm
