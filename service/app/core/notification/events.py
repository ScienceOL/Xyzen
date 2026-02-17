from __future__ import annotations

import json
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, TypedDict


@dataclass(frozen=True, slots=True)
class WorkflowDef:
    """Definition used by bootstrap to auto-create a Novu workflow."""

    identifier: str
    name: str
    in_app_body: str = "{{body}}"


class NotificationEventType(StrEnum):
    AGENT_REPLY = "agent-reply"
    SYSTEM_ANNOUNCEMENT = "system-announcement"


# Workflow definitions — bootstrap creates these in Novu if missing.
# Add new entries here when introducing a new notification type.
#
# NOTE: Novu self-hosted v3.x inbox API only returns `body` — no `subject`,
# `data`, or `avatar` fields.  We therefore encode all metadata into the
# body itself via `pack_notification_body()`.  The workflow template simply
# renders `{{__packed}}` which already contains everything.
WORKFLOW_DEFS: list[WorkflowDef] = [
    WorkflowDef(
        identifier=NotificationEventType.AGENT_REPLY,
        name="Agent Reply",
        in_app_body="{{{__packed}}}",
    ),
    WorkflowDef(
        identifier=NotificationEventType.SYSTEM_ANNOUNCEMENT,
        name="System Announcement",
        in_app_body="{{{__packed}}}",
    ),
]

# ---------------------------------------------------------------------------
# Payload packing — encode metadata into a single body string
# ---------------------------------------------------------------------------

_META_SEP = "\n<!-- meta:"
_META_END = " -->"


def pack_notification_body(body: str, **meta: Any) -> str:
    """Encode *body* + arbitrary *meta* into a single string.

    Format::

        visible body text
        <!-- meta:{"title":"...","agent_name":"..."} -->

    The frontend uses ``parseNotificationBody()`` to split them apart.
    """
    if not meta:
        return body
    return f"{body}{_META_SEP}{json.dumps(meta, ensure_ascii=False)}{_META_END}"


class AgentReplyPayload(TypedDict):
    __packed: str
    title: str
    body: str
    topic_id: str
    session_id: str
    url: str


class SystemAnnouncementPayload(TypedDict):
    __packed: str
    title: str
    body: str
