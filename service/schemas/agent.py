from enum import StrEnum


class AgentScope(StrEnum):
    OFFICIAL = "official"
    USER = "user"


class AgentVisibility(StrEnum):
    PUBLIC = "public"
    PRIVATE = "private"
