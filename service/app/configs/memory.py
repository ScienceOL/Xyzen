from pydantic import BaseModel, Field


class EmbeddingConfig(BaseModel):
    Provider: str = Field(default="qwen", description="Embedding provider (matches LLM provider key, empty to disable)")
    Model: str = Field(default="text-embedding-v4", description="Embedding model name")
    Dims: int = Field(default=1024, description="Embedding vector dimensions")


class CoreMemoryConfig(BaseModel):
    Enabled: bool = Field(default=True, description="Enable core memory (always-in-context user profile)")
    NamespacePrefix: str = Field(default="core_memory", description="Namespace prefix for core memory store")
    MaxSectionChars: int = Field(default=500, description="Max characters per core memory section")
    ProfileKey: str = Field(default="profile", description="Store key for the profile document")


class AutoRetrievalConfig(BaseModel):
    Enabled: bool = Field(default=True, description="Enable per-turn semantic auto-retrieval of memories")
    TopK: int = Field(default=5, description="Number of memories to auto-retrieve per turn")


class ExtractionGateConfig(BaseModel):
    MinUserMessages: int = Field(default=2, description="Minimum user messages to consider extraction")
    MinTotalChars: int = Field(default=100, description="Minimum total characters across all messages (CJK-friendly)")
    LongConversationMessages: int = Field(
        default=6, description="Message count threshold for long-conversation fallback"
    )
    LongConversationChars: int = Field(default=800, description="Character threshold for long-conversation fallback")


class MemoryConfig(BaseModel):
    Enabled: bool = Field(default=True, description="Enable cross-thread memory store")
    NamespacePrefix: str = Field(default="memories", description="Root namespace prefix for memory store")
    Embedding: EmbeddingConfig = Field(
        default_factory=EmbeddingConfig, description="Embedding config for semantic search"
    )
    CoreMemory: CoreMemoryConfig = Field(
        default_factory=CoreMemoryConfig, description="Core memory (always-in-context user profile)"
    )
    AutoRetrieval: AutoRetrievalConfig = Field(
        default_factory=AutoRetrievalConfig, description="Per-turn semantic auto-retrieval"
    )
    ExtractionGate: ExtractionGateConfig = Field(
        default_factory=ExtractionGateConfig, description="Heuristic gate for background memory extraction"
    )
