"""Shared helpers for token usage normalization."""

from __future__ import annotations


def normalize_token_usage(
    input_tokens: int | None,
    output_tokens: int | None,
    total_tokens: int | None,
) -> tuple[int, int, int]:
    """Normalize provider usage fields and derive total when missing/zero."""
    normalized_input = max(int(input_tokens or 0), 0)
    normalized_output = max(int(output_tokens or 0), 0)
    raw_total = max(int(total_tokens or 0), 0)
    normalized_total = raw_total if raw_total > 0 else normalized_input + normalized_output
    return normalized_input, normalized_output, normalized_total


__all__ = ["normalize_token_usage"]
