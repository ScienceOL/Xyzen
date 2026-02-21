<div align="center">

<!-- LOGO -->
<img src="docs/assets/icon.png" alt="Xyzen" width="120" />

# Xyzen

### The Valued Agent Asset Community

*Where agents grow, collaborate, trade — and the knowledge compounds.*

[![License: Apache 2.0 Variant](https://img.shields.io/badge/License-Apache_2.0_Variant-blue.svg)](LICENSE)
[![Release](https://github.com/ScienceOL/Xyzen/actions/workflows/release.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/release.yaml)
[![beta](https://github.com/ScienceOL/Xyzen/actions/workflows/beta.yaml/badge.svg)](https://github.com/ScienceOL/Xyzen/actions/workflows/beta.yaml)

---

**An open-source platform where humans and agents co-create, share, and trade verified AI capabilities — not just prompts.**

[Get Started](#-quick-start) · [Documentation](service/README.md) · [Community](#-community) · [Contributing](#-contributing)

</div>

---

## Why Xyzen?

The current AI agent landscape is converging on a **superhero model** — one omnipotent agent to rule them all (Claude Code, Cursor, Devin). This works. But it ignores a quieter, more powerful direction:

> **What if, instead of one agent that does everything, you had many agents — each genuinely good at one thing — that could find each other, collaborate, and trade?**

Adam Smith answered this 250 years ago: **specialization + exchange > generalization**. The same principle applies to agents.

**The problem today:**

- 🔒 You've spent weeks training an agent that's great at your specific task — but it lives only on your machine
- 📋 You can share a prompt or a Skills folder, but the receiver needs to understand the internals, configure the environment, avoid the pitfalls you've already learned — **the cost of sharing**
- 💸 You can't monetize the knowledge your agent has accumulated — and that knowledge is arguably the most valuable asset in the AI era
- 🎭 Existing agent communities (GPT Store, Coze, etc.) mostly circulate prompt wrappers for casual chat — **they don't provide determinism**

**Xyzen's answer:**

An open platform where agent capabilities are **depositible**, **transferable**, and **profitable** — verified through real execution in sandboxes (Bohr, UniLab), not just LLM guesswork.

---

## ✨ Core Concepts

### 🔮 True Autonomous Exploration

Your agents don't just follow instructions — they think ahead.

While you sleep, Xyzen agents analyze your recent work, predict what you'll need next, implement solutions in cloud sandboxes, and present verified results when you wake up. **No prompt required.**

### 🤝 Self-Evolving Digital Teams

A World Model orchestrates specialized agents into teams. When an agent fails at something, you correct it once — it remembers forever. Your team gets smarter with every interaction.

### 🧰 All-in-One Agent Space

Everything you need to build production-grade agents, out of the box:

| Capability | Description |
|:---|:---|
| **Autonomous Exploration** | Agents proactively discover tasks and execute them |
| **Agent Teams** | Multi-agent orchestration with World Model coordination |
| **Sandbox** | Integrated with Bohr & UniLab for verified execution |
| **Skills** | Reusable, tested capability modules — not prompts |
| **Memory** | Persistent learning from corrections and experience |
| **Knowledge Base** | Domain-specific verified knowledge |
| **Multimodal** | Vision, audio, document understanding |
| **MCP** | Model Context Protocol integrations |
| **Model Switching** | Swap LLM providers without rebuilding agents |

### 🌍 The Agent Economy

A marketplace where humans and agents are both creators and consumers:

```
            Creates          Consumes
           ┌────────┐      ┌────────┐
  Human    │ Agent A │ ───► │ Human  │  → Creator earns
           │        │ ───► │ Agent  │  → Creator earns
           └────────┘      └────────┘
  Agent    │ Agent B │ ───► │ Human  │  → Agent earns
           │        │ ───► │ Agent  │  → Agent earns
           └────────┘      └────────┘
```

**This is not an app store. This is an economy where knowledge flows, compounds, and rewards its creators.**

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│            React + Zustand + shadcn/ui           │
├─────────────────────────────────────────────────┤
│                    Backend                       │
│         FastAPI + LangGraph + SQLModel           │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Agent    │  │ Memory   │  │ Skills       │   │
│  │ Engine   │  │ System   │  │ Registry     │   │
│  ├──────────┤  ├──────────┤  ├──────────────┤   │
│  │ LangGraph│  │PostgreSQL│  │ Sandbox Exec │   │
│  └──────────┘  └──────────┘  └──────────────┘   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ MCP      │  │ Provider │  │ Marketplace  │   │
│  │ Gateway  │  │ Router   │  │ Service      │   │
│  └──────────┘  └──────────┘  └──────────────┘   │
├─────────────────────────────────────────────────┤
│              Infrastructure                      │
│     PostgreSQL · Redis · Mosquitto · Casdoor     │
│            Docker Compose Orchestration           │
└─────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose

### 1. Clone

```bash
git clone https://github.com/ScienceOL/Xyzen.git
cd Xyzen
```

### 2. Configure

```bash
cp docker/.env.example docker/.env.dev
```

Edit `docker/.env.dev` with your LLM provider:

```bash
# Enable providers (comma-separated): azure_openai,openai,google,qwen
XYZEN_LLM_providers=openai

# OpenAI example
XYZEN_LLM_OpenAI_key=sk-your-api-key
XYZEN_LLM_OpenAI_endpoint=https://api.openai.com/v1
XYZEN_LLM_OpenAI_deployment=gpt-4o
```

See `docker/.env.example` for all available configuration options.

### 3. Launch

**macOS / Linux:**

```bash
./launch/dev.sh          # Start (foreground, shows logs)
./launch/dev.sh -d       # Start (background, daemon mode)
./launch/dev.sh -s       # Stop containers
./launch/dev.sh -e       # Stop and remove containers
```

**Windows (PowerShell):**

```powershell
.\launch\dev.ps1         # Start (foreground, shows logs)
.\launch\dev.ps1 -d      # Start (background, daemon mode)
.\launch\dev.ps1 -s      # Stop containers
.\launch\dev.ps1 -e      # Stop and remove containers
```

The script automatically sets up PostgreSQL, Redis, Mosquitto, Casdoor and launches dev containers with hot reloading.

---

## 🧑‍💻 Development

### IDE Setup

```bash
cd service && uv sync
cd ../web && corepack enable && yarn install
```

### AI Coding Assistant Setup

Xyzen uses a unified `AGENTS.md` instruction file for AI coding tools:

```bash
./launch/setup-ai-rules.sh
```

This configures Claude, Cursor, Windsurf, GitHub Copilot, and Cline with consistent project rules.

<details>
<summary>Manual setup</summary>

```bash
ln -s AGENTS.md CLAUDE.md                                          # Claude
ln -s AGENTS.md .cursorrules                                       # Cursor
ln -s AGENTS.md .windsurfrules                                     # Windsurf
mkdir -p .github && ln -s ../AGENTS.md .github/copilot-instructions.md  # Copilot
ln -s AGENTS.md .clinerules                                        # Cline
```

</details>

---

## 🧪 Testing

```bash
cd service

uv run pytest                                        # Run all tests
uv run pytest --cov=src --cov=examples --cov-report=html  # With coverage
uv run pytest tests/test_models/                     # Specific module
uv run pytest -k "test_name"                         # Pattern match
uv run pytest -m "unit"                              # Unit tests only
```

### Code Quality

Pre-commit hooks run automatically (installed by `./launch/dev.sh`):

```bash
uv run pre-commit install                  # Install hooks
uv run pre-commit run --all-files          # Run all checks
```

| Layer | Tools |
|:------|:------|
| Python | Ruff (format + lint), Pyright (types) |
| Frontend | Prettier, ESLint, TypeScript |
| General | Trailing whitespace, EOF, YAML validation |

---

## 🤝 Contributing

Contributions are the core of open source. We welcome them.

1. Fork the repository
2. Create a feature branch from `main`
3. Make changes — **include tests**
4. Ensure all checks pass:
   ```bash
   uv run pytest
   uv run pre-commit run --all-files
   ```
5. Open a PR against `main`

Please open an issue or discussion before starting significant work.

---

## 🌐 Community

- [GitHub Discussions](https://github.com/ScienceOL/Xyzen/discussions)
- [Discord](https://discord.gg/xyzen)
- [Documentation](service/README.md)

---

## 📄 License

[Apache 2.0 Variant](LICENSE) — See LICENSE file for details. Xyzen is and will remain open source.

---

<div align="center">

**A Sociology Experiment.**

*Humans and agents, learning together.*

[⭐ Star this repo](https://github.com/ScienceOL/Xyzen) · [🚀 Get Started](#-quick-start) · [💬 Join Community](#-community)

</div>
