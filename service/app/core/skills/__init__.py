"""
Agent Skills — modular instruction packages for LLM agents.

Skills are NOT tools or components. They are instruction packages
that modify the system prompt and deploy resources to the sandbox.
"""

from .parser import ParsedSkill, parse_skill_md, validate_skill_name
from .storage import (
    build_skill_prefix,
    delete_skill_folder,
    load_skill_md,
    list_skill_resource_paths,
    load_skill_resource_files,
    normalize_inline_resources,
    sync_skill_folder,
    write_skill_md_only,
)

__all__ = [
    "ParsedSkill",
    "parse_skill_md",
    "validate_skill_name",
    "build_skill_prefix",
    "sync_skill_folder",
    "write_skill_md_only",
    "delete_skill_folder",
    "load_skill_md",
    "load_skill_resource_files",
    "list_skill_resource_paths",
    "normalize_inline_resources",
]
