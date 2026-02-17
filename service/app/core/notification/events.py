from enum import StrEnum
from typing import TypedDict


class NotificationEventType(StrEnum):
    AGENT_REPLY = "agent-reply"
    SYSTEM_ANNOUNCEMENT = "system-announcement"


class AgentReplyPayload(TypedDict):
    title: str
    body: str
    topic_id: str
    session_id: str
    url: str


class SystemAnnouncementPayload(TypedDict):
    title: str
    body: str
