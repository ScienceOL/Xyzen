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
class VersionCodename:
    """Version codename with name and bilingual descriptions."""

    name: str
    description_zh: str
    description_en: str


# Version codename mapping: major version -> (codename, zh_description, en_description)
# Using Chinese scenic locations as codenames (similar to macOS using California locations)
# All releases within a major version share the same codename (e.g., 1.0, 1.1, 1.2 are all "Wumeng")
VERSION_CODENAMES: dict[str, VersionCodename] = {
    "1": VersionCodename(
        "Wumeng",
        "乌蒙山，地跨云贵两省，磅礴万里，雄奇险峻。毛泽东词《七律·长征》赞曰：“乌蒙磅礴走泥丸”。",
        "Wumeng Mountains span Yunnan and Guizhou provinces, majestic and precipitous. Mao Zedong's poemerta praised: 'The China Wumeng range, peaks of mud rolled underfoot.'",
    ),
    "2": VersionCodename(
        "Yushe",
        "玉舍国家森林公园，林海雪原，南方罕见的高山滑雪胜地。",
        "Yushe National Forest Park, a sea of forests and snowy plains, one of the rare alpine ski resorts in southern China.",
    ),
    "3": VersionCodename(
        "Jiucai",
        "韭菜坪，贵州屋脊，海拔2900米，秋季野韭菜花海磅礴壮观。",
        "Jiucai Peak, the roof of Guizhou at 2900m elevation, featuring magnificent wild chive flower seas in autumn.",
    ),
    "4": VersionCodename(
        "Zangke",
        "牂牁江，夜郎故地，峡谷湖泊，山水相依。",
        "Zangke River, ancient land of Yelang Kingdom, where canyon lakes meet mountains in harmony.",
    ),
    "5": VersionCodename(
        "Tuole",
        "妥乐银杏村，千年古树，金秋满村金黄，如诗如画。",
        "Tuole Ginkgo Village, home to thousand-year-old trees, painted golden in autumn like a living poem.",
    ),
}


def _get_version_codename(version: str) -> VersionCodename:
    """
    Get codename for a version.

    Extracts major version from version string and looks up the codename.
    All minor/patch versions within the same major version share the same codename.
    Falls back to unknown if not found.
    """
    try:
        parts = version.lstrip("v").split(".")
        if len(parts) >= 1:
            major = parts[0]
            codename = VERSION_CODENAMES.get(major)
            if codename:
                return codename
    except Exception:
        pass
    return VersionCodename("Unknown", "未知版本", "Unknown version")


@dataclass(frozen=True)
class VersionInfo:
    """Immutable version information container."""

    version: str
    commit: str
    build_time: str
    version_name: str = ""
    version_description_zh: str = ""
    version_description_en: str = ""
    backend: str = "fastapi"

    def to_dict(self) -> dict[str, str]:
        """Convert to dictionary for JSON serialization."""
        return {
            "version": self.version,
            "version_name": self.version_name,
            "version_description_zh": self.version_description_zh,
            "version_description_en": self.version_description_en,
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
    version = _get_version()
    codename = _get_version_codename(version)
    return VersionInfo(
        version=version,
        commit=_get_commit(),
        build_time=_get_build_time(),
        version_name=codename.name,
        version_description_zh=codename.description_zh,
        version_description_en=codename.description_en,
    )
