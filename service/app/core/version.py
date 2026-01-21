"""
Version information module for Xyzen backend.

Version is read from pyproject.toml (single source of truth).
Commit SHA and build time come from environment variables or git.
"""

import os
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as pkg_version
from pathlib import Path


@dataclass(frozen=True)
class VersionInfo:
    """Immutable version information container."""

    version: str
    commit: str
    build_time: str
    backend: str = "fastapi"

    def to_dict(self) -> dict[str, str]:
        """Convert to dictionary for JSON serialization."""
        return {
            "version": self.version,
            "commit": self.commit,
            "build_time": self.build_time,
            "backend": self.backend,
        }


def _read_version_from_pyproject() -> str | None:
    """Read version directly from pyproject.toml file."""
    try:
        # Try relative to this file's location
        pyproject_path = Path(__file__).parent.parent.parent / "pyproject.toml"
        if pyproject_path.exists():
            content = pyproject_path.read_text()
            for line in content.splitlines():
                if line.startswith("version"):
                    # Parse: version = "0.4.2"
                    return line.split("=")[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


def _get_package_version() -> str | None:
    """Get version from installed package metadata."""
    try:
        return pkg_version("service")
    except PackageNotFoundError:
        return None


def _get_version() -> str:
    """
    Get version with priority:
    1. Environment variable (CI override)
    2. Installed package metadata
    3. Direct pyproject.toml read (development)
    """
    # 1. Environment variable (CI/CD can override)
    env_version = os.getenv("XYZEN_VERSION")
    if env_version:
        return env_version

    # 2. Installed package (production Docker)
    pkg_ver = _get_package_version()
    if pkg_ver:
        return pkg_ver

    # 3. Direct file read (development)
    file_ver = _read_version_from_pyproject()
    if file_ver:
        return file_ver

    return "unknown"


def _get_commit() -> str:
    """Get commit SHA from env or git."""
    # 1. Environment variable
    env_commit = os.getenv("XYZEN_COMMIT_SHA")
    if env_commit:
        return env_commit

    # 2. Git command
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "unknown"


def _get_build_time() -> str:
    """Get build time from env."""
    return os.getenv("XYZEN_BUILD_TIME", "unknown")


@lru_cache(maxsize=1)
def get_version_info() -> VersionInfo:
    """
    Get application version information.

    Version source priority:
    1. XYZEN_VERSION env var (CI override)
    2. Installed package metadata (Docker production)
    3. pyproject.toml file (local development)

    Returns:
        VersionInfo: Immutable version information object
    """
    return VersionInfo(
        version=_get_version(),
        commit=_get_commit(),
        build_time=_get_build_time(),
    )
