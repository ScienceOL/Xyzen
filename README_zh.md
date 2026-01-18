<img src="https://storage.sciol.ac.cn/library/xyzen/coverage.png" style="width:100%; object-fit: contain;" />

# Xyzen

面向多 Agent 编排、实时聊天与文档处理的 AI 平台。

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/downloads/release/python-3130/)
[![Code style: Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![Checked with pyright](https://microsoft.github.io/pyright/img/pyright_badge.svg)](https://microsoft.github.io/pyright/)
[![TypeScript](https://img.shields.io/badge/typescript-%233178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
[![npm version](https://img.shields.io/npm/v/@sciol/xyzen.svg)](https://www.npmjs.com/package/@sciol/xyzen)
[![Pre-commit CI](https://github.com/ScienceOL/Xyzen/actions/workflows/pre-commit.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/pre-commit.yaml)
[![Prod Build](https://github.com/ScienceOL/Xyzen/actions/workflows/prod-build.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/prod-build.yaml)
[![Test Suite](https://github.com/ScienceOL/Xyzen/actions/workflows/test.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/test.yaml)
[![codecov](https://codecov.io/github/ScienceOL/Xyzen/graph/badge.svg?token=91W3GO7CRI)](https://codecov.io/github/ScienceOL/Xyzen)

## Language Versions

[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![中文文档](https://img.shields.io/badge/Language-中文-orange)](README_zh.md)

## 概览

Xyzen 由 FastAPI + LangGraph 后端与 React + Zustand 前端构建，支持多 Agent 编排、WebSocket 流式聊天，以及可扩展的 LLM Provider 与 MCP 集成。

- 后端：`service/`
- 前端：`web/`
- 规则与指引：`AGENTS.md`

## 快速开始

开发依赖 Docker（PostgreSQL、Redis、Mosquitto、Casdoor）。

### 前置条件

- Docker 和 Docker Compose
- `uv`（用于 Python 工具链）
- Node.js + Yarn（Corepack）

### 启动开发环境

```bash
git clone https://github.com/ScienceOL/Xyzen.git
cd Xyzen
./launch/dev.sh
```

Windows（PowerShell）：

```powershell
.\launch\dev.ps1
```

常用命令：

```bash
make dev              # 前台启动
make dev ARGS="-d"    # 后台启动
make dev ARGS="-s"    # 停止容器
make dev ARGS="-e"    # 停止并移除容器
```

## AI 助手规则

统一的 AI 工具规则在 `AGENTS.md`，可使用脚本生成各工具配置：

```bash
./launch/setup-ai-rules.sh
```

## 贡献与质量

运行测试：

```bash
cd service
uv run pytest
```

运行 pre-commit：

```bash
uv run pre-commit run --all-files
```
