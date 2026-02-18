"""
解析器工具模块

本模块提供各种文本格式的解析工具。

主要功能:
- parse_requirements: Python 包依赖解析
  - 支持多种格式的依赖声明
  - 可配置保留/移除额外选项和版本约束
- parse_date_range / parse_date_start / parse_date_end: 日期时区解析
  - 支持 IANA 时区
  - 统一转换为 UTC

"""

import re
from datetime import datetime, timezone as dt_timezone
from typing import List
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def parse_requirements(requirements: str, preserve_extras: bool = True, keep_version: bool = False) -> List[str]:
    """
    解析 requirements 字符串，提取库名称、extras 或完整包规范，并可选择保留版本号

    Args:
        requirements: 要解析的 requirements 字符串
        preserve_extras: 是否保留 extras (方括号)
            - True: 保留 extras (如 requests[security])
            - False: 移除 extras，仅保留库名
        keep_version: 是否保留版本约束 (如 >=1.2.3)
            - True: 保留版本约束 (如 requests>=2.0.0)
            - False: 移除版本约束，仅保留库名或库名+extras

    支持格式:
    - 标准换行分隔: "numpy>=1.20.0\npandas==1.3.0"
    - 内联空格分隔: "numpy pandas requests"
    - 混合格式: "numpy pandas\nrequests>=2.0.0"
    - 版本约束: numpy>=1.20.0, pandas==1.3.0, flask<=2.0.0
    - 额外依赖: requests[security], django[postgres]

    Examples:
        >>> parse_requirements("requests[security]>=2.25.0", preserve_extras=True, keep_version=True)
        ['requests[security]>=2.25.0']
        >>> parse_requirements("requests[security]>=2.25.0", preserve_extras=True, keep_version=False)
        ['requests[security]']
        >>> parse_requirements("requests[security]>=2.25.0", preserve_extras=False, keep_version=False)
        ['requests']
    """
    libraries = []
    lines = requirements.strip().split("\n")

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        potential_packages = []
        if any(op in line for op in [">=", "<=", "==", "!=", ">", "<", "~="]):
            package_pattern = r"([a-zA-Z0-9_.-]+(?:\[[^\]]*\])?(?:[>=<!=~]+[^\s]+)?)"
            potential_packages = re.findall(package_pattern, line)
        else:
            potential_packages = line.split()

        if len(potential_packages) <= 1:
            potential_packages = [line]

        for package in potential_packages:
            package = package.strip()
            if not package:
                continue

            # 解析包名、extras、版本
            name_and_extras = re.split(r"[>=<!=~]", package)[0].strip()
            # 提取库名（无extras）
            library_name = re.split(r"\[.*?\]", name_and_extras)[0].strip()
            # 提取extras
            extras_match = re.search(r"\[(.*?)\]", name_and_extras)
            extras = extras_match.group(0) if extras_match and preserve_extras else ""
            # 提取版本
            version_match = re.search(r"([>=<!=~]+[^\s]+)", package)
            version = version_match.group(0) if version_match and keep_version else ""

            if preserve_extras:
                pkg = library_name + extras + version
            else:
                pkg = library_name + version

            if pkg and pkg not in libraries:
                libraries.append(pkg)
    return libraries


def parse_date_range(
    start_date: str,
    end_date: str,
    tz: str = "Asia/Shanghai",
) -> tuple[datetime, datetime, ZoneInfo]:
    """
    Parse date range with timezone handling.

    Args:
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        tz: Timezone name (IANA format)

    Returns:
        Tuple of (start_utc, end_utc, zone)

    Raises:
        ValueError: If timezone is invalid
    """
    try:
        zone = ZoneInfo(tz)
    except ZoneInfoNotFoundError as e:
        raise ValueError(f"Invalid timezone: {tz}") from e

    start_local = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=zone)
    end_local = datetime.strptime(end_date, "%Y-%m-%d").replace(
        hour=23, minute=59, second=59, microsecond=999999, tzinfo=zone
    )

    start_utc = start_local.astimezone(dt_timezone.utc)
    end_utc = end_local.astimezone(dt_timezone.utc)

    return start_utc, end_utc, zone


def parse_date_start(date_str: str, tz: str = "Asia/Shanghai") -> datetime:
    """
    Parse single date as start of day in given timezone.

    Args:
        date_str: Date in YYYY-MM-DD format
        tz: Timezone name (IANA format)

    Returns:
        UTC datetime at start of day in given timezone

    Raises:
        ValueError: If timezone is invalid
    """
    try:
        zone = ZoneInfo(tz)
    except ZoneInfoNotFoundError as e:
        raise ValueError(f"Invalid timezone: {tz}") from e

    local = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=zone)
    return local.astimezone(dt_timezone.utc)


def parse_date_end(date_str: str, tz: str = "Asia/Shanghai") -> datetime:
    """
    Parse single date as end of day in given timezone.

    Args:
        date_str: Date in YYYY-MM-DD format
        tz: Timezone name (IANA format)

    Returns:
        UTC datetime at end of day (23:59:59.999999) in given timezone

    Raises:
        ValueError: If timezone is invalid
    """
    try:
        zone = ZoneInfo(tz)
    except ZoneInfoNotFoundError as e:
        raise ValueError(f"Invalid timezone: {tz}") from e

    local = datetime.strptime(date_str, "%Y-%m-%d").replace(
        hour=23, minute=59, second=59, microsecond=999999, tzinfo=zone
    )
    return local.astimezone(dt_timezone.utc)
