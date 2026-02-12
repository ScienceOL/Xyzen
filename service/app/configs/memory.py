from pydantic import BaseModel, Field


class EmbeddingConfig(BaseModel):
    Provider: str = Field(default="qwen", description="Embedding provider (matches LLM provider key, empty to disable)")
    Model: str = Field(default="text-embedding-v4", description="Embedding model name")
    Dims: int = Field(default=1024, description="Embedding vector dimensions")


class MemoryConfig(BaseModel):
    Enabled: bool = Field(default=True, description="Enable cross-thread memory store")
    NamespacePrefix: str = Field(default="memories", description="Root namespace prefix for memory store")
    Embedding: EmbeddingConfig = Field(
        default_factory=EmbeddingConfig, description="Embedding config for semantic search"
    )
