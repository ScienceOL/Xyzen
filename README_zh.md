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
[![Release](https://github.com/ScienceOL/Xyzen/actions/workflows/release.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/release.yaml)
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

### 前置条件

- Docker 和 Docker Compose

### 启动步骤

1. 克隆仓库：

   ```bash
   git clone https://github.com/ScienceOL/Xyzen.git
   cd Xyzen
   ```

2. 创建环境配置文件：

   ```bash
   cp docker/.env.example docker/.env.dev
   ```

3. 在 `docker/.env.dev` 中配置 LLM 模型：

   ```bash
   # 启用的模型供应商（逗号分隔）：azure_openai,openai,google,qwen
   XYZEN_LLM_providers=openai

   # OpenAI 示例
   XYZEN_LLM_OpenAI_key=sk-your-api-key
   XYZEN_LLM_OpenAI_endpoint=https://api.openai.com/v1
   XYZEN_LLM_OpenAI_deployment=gpt-4o
   ```

   完整配置项请参考 `docker/.env.example`。

4. 启动开发环境：

   ```bash
   ./launch/dev.sh        # 前台启动（显示日志）
   ./launch/dev.sh -d     # 后台启动
   ./launch/dev.sh -s     # 停止容器
   ./launch/dev.sh -e     # 停止并移除容器
   ```

   或使用 Makefile：

   ```bash
   make dev              # 前台启动
   make dev ARGS="-d"    # 后台启动
   ```

脚本会自动配置所有基础服务（PostgreSQL、Redis、Mosquitto、Casdoor）并启动带热重载的开发容器。

## 开发

### 贡献代码的前置条件

- [uv](https://docs.astral.sh/uv/)（Python 工具链和 pre-commit hooks）
- Node.js + Yarn（通过 [Corepack](https://nodejs.org/api/corepack.html)，用于前端工具）

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
