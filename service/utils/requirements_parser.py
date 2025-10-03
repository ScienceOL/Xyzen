#!/usr/bin/env python3
"""
Container Requirements Parser - 容器需求解析器

解析工具目录中的依赖文件，提取库名称用于 llm-sandbox 的 libraries 参数
"""

import re
from pathlib import Path
from typing import List


def parse_requirements(requirements: str) -> List[str]:
    """解析 requirements 字符串，提取库名称"""
    libraries = []
    lines = requirements.strip().split("\n")

    for line in lines:
        line = line.strip()
        # 跳过空行和注释
        if not line or line.startswith("#"):
            continue

        # 移除版本约束，只保留库名
        # 例如: numpy>=1.20.0 -> numpy
        # 例如: pandas==1.3.0 -> pandas
        # 例如: requests[security] -> requests
        library_name = re.split(r"[>=<!=]", line)[0].strip()

        # 移除方括号中的额外依赖
        # 例如: requests[security] -> requests
        library_name = re.split(r"\[.*?\]", library_name)[0].strip()

        if library_name:
            libraries.append(library_name)
    return libraries


def parse_requirements_txt(requirements_file: Path) -> List[str]:
    """解析 requirements.txt 文件，提取库名称"""
    if not requirements_file.exists():
        return []

    try:
        content = requirements_file.read_text(encoding="utf-8")
        return parse_requirements(content)
    except Exception as e:
        print(f"Warning: Failed to parse requirements.txt: {e}")
        return []


def parse_pyproject(pyproject_str: str) -> List[str]:
    """解析 requirements.txt 字符串，提取库名称"""
    libraries = []
    in_dependencies = False
    lines = pyproject_str.split("\n")

    for line in lines:
        line = line.strip()

        # 检查是否进入 dependencies 部分
        if line.startswith("[tool.poetry.dependencies]") or line.startswith("[project.dependencies]"):
            in_dependencies = True
            continue

        # 检查是否离开 dependencies 部分
        if (
            in_dependencies
            and line.startswith("[")
            and not line.startswith("[tool.poetry.dependencies]")
            and not line.startswith("[project.dependencies]")
        ):
            break

        if in_dependencies and line and not line.startswith("#"):
            # 解析依赖行
            # 例如: numpy = ">=1.20.0" -> numpy
            # 例如: "pandas" = ">=1.3.0" -> pandas
            if "=" in line:
                lib_part = line.split("=")[0].strip()
                # 移除引号
                lib_name = lib_part.strip("\"'")
                if lib_name and not lib_name.startswith("python"):
                    libraries.append(lib_name)

    return libraries


def parse_pyproject_toml(pyproject_file: Path) -> List[str]:
    """解析 pyproject.toml 文件，提取依赖库名称"""
    if not pyproject_file.exists():
        return []

    try:
        content = pyproject_file.read_text(encoding="utf-8")
        return parse_pyproject(content)
    except Exception as e:
        print(f"Warning: Failed to parse pyproject.toml: {e}")
        return []


def detect_tool_requirements(tool_dir: Path) -> List[str]:
    """检测工具目录中的依赖库"""
    libraries = []

    # 检查 requirements.txt
    requirements_file = tool_dir / "requirements.txt"
    if requirements_file.exists():
        libraries.extend(parse_requirements_txt(requirements_file))

    # 检查 pyproject.toml
    pyproject_file = tool_dir / "pyproject.toml"
    if pyproject_file.exists():
        libraries.extend(parse_pyproject_toml(pyproject_file))

    # 去重并排序
    libraries = sorted(list(set(libraries)))

    return libraries
