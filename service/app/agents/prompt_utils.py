"""Utilities for converting prompt layers to LangChain SystemMessages."""

from __future__ import annotations

from langchain_core.messages import SystemMessage

from app.core.prompts.builder import PromptLayer, PromptLayerKind


def layers_to_system_messages(
    layers: list[PromptLayer],
    node_prompt: str | None = None,
) -> list[SystemMessage]:
    """Convert prompt layers into a list of SystemMessages.

    Each non-empty PromptLayer becomes one SystemMessage. If *node_prompt* is
    provided it is appended to the AGENT layer's content wrapped in
    ``<NODE_PROMPT>`` tags.  When no AGENT layer exists but *node_prompt* is
    given, a dedicated SystemMessage is created for it.

    Args:
        layers: Non-empty PromptLayer objects (call ``non_empty_layers()`` first).
        node_prompt: Optional node-level prompt to merge into the AGENT layer.

    Returns:
        Ordered list of SystemMessages ready to prepend to conversation history.
    """
    node_text = node_prompt.strip() if node_prompt else ""
    agent_handled = False
    messages: list[SystemMessage] = []

    for layer in layers:
        content = layer.content.strip()
        if not content and layer.kind != PromptLayerKind.AGENT:
            continue

        if layer.kind == PromptLayerKind.AGENT:
            agent_handled = True
            if content and node_text:
                content = f"{content}\n\n<NODE_PROMPT>\n{node_text}\n</NODE_PROMPT>"
            elif node_text:
                content = node_text
            if not content:
                continue

        # TODO: Add Anthropic prompt caching support by setting cache_control on
        # stable layers (PLATFORM, AGENT) so the prefix is cached across turns:
        #   additional_kwargs={"cache_control": {"type": "ephemeral"}}
        # CORE_MEMORY/AUTO_MEMORY should remain uncached since they change.
        messages.append(SystemMessage(content=content))

    # If no AGENT layer was present but we have a node prompt, add it separately
    if node_text and not agent_handled:
        messages.append(SystemMessage(content=node_text))

    return messages
