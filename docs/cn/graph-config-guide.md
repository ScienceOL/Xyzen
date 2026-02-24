# GraphConfig 配置指南

使用 JSON 定义自定义 Agent 工作流。

## 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [顶层结构](#顶层结构)
- [节点类型详解](#节点类型详解)
- [边与路由](#边与路由)
- [自定义状态](#自定义状态)
- [组件引用](#组件引用)
- [提示词配置](#提示词配置)
- [执行限制](#执行限制)
- [完整示例：多阶段研究 Agent](#完整示例多阶段研究-agent)
- [验证规则](#验证规则)
- [附录：Schema 参考](#附录schema-参考)

---

## 概述

GraphConfig 是 Xyzen 的 Agent 定义格式（schema 版本 `3.0`）。通过编写一份 JSON 配置，你可以：

- 定义 Agent 的工作流图（节点 + 边）
- 配置 LLM 调用、工具执行、数据转换等节点
- 使用条件路由实现分支逻辑
- 引用已注册的可复用组件
- 自定义状态字段在节点间传递数据

所有 Agent（内置和自定义）最终都通过同一条路径执行：

```
JSON 配置 → 解析 → 规范化 → 验证 → 编译为 LangGraph → 流式执行
```

---

## 快速开始

以下是一个最简单的 ReAct Agent 配置。它包含两个节点：一个 LLM 节点负责推理和决策，一个 Tool 节点负责执行工具调用。

```json
{
  "schema_version": "3.0",
  "key": "my-react-agent",
  "revision": 1,
  "graph": {
    "entrypoints": ["agent"],
    "nodes": [
      {
        "id": "agent",
        "name": "Agent",
        "kind": "llm",
        "config": {
          "prompt_template": "You are a helpful assistant.",
          "tools_enabled": true,
          "output_key": "response"
        }
      },
      {
        "id": "tools",
        "name": "Tool Executor",
        "kind": "tool",
        "config": {
          "execute_all": true
        }
      }
    ],
    "edges": [
      {
        "from_node": "agent",
        "to_node": "tools",
        "when": "has_tool_calls"
      },
      {
        "from_node": "agent",
        "to_node": "END",
        "when": "no_tool_calls"
      },
      {
        "from_node": "tools",
        "to_node": "agent"
      }
    ]
  }
}
```

**工作流说明**：

```
[agent] ──has_tool_calls──→ [tools] ──→ [agent]（循环）
   │
   └──no_tool_calls──→ END
```

1. 从 `agent` 节点开始，LLM 生成回复
2. 如果 LLM 请求调用工具，流转到 `tools` 节点执行
3. 执行完成后回到 `agent` 继续推理
4. 如果 LLM 不再需要工具，流转到 `END` 结束

---

## 顶层结构

```json
{
  "schema_version": "3.0",
  "key": "agent-key",
  "revision": 1,
  "graph": { ... },
  "state": { ... },
  "deps": { ... },
  "limits": { ... },
  "prompt_config": { ... },
  "metadata": { ... },
  "ui": { ... }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `schema_version` | `"3.0"` | 是 | 固定为 `"3.0"` |
| `key` | string | 是 | Agent 唯一标识符 |
| `revision` | int | 否 | 配置版本号，默认 `1`，最小 `1` |
| `graph` | object | 是 | 工作流图定义（节点、边、入口） |
| `state` | object | 否 | 自定义状态字段和 reducer |
| `deps` | object | 否 | 外部依赖声明 |
| `limits` | object | 否 | 执行限制（超时、步数等） |
| `prompt_config` | object | 否 | 系统提示词配置 |
| `metadata` | object | 否 | 展示信息（名称、描述、标签等） |
| `ui` | object | 否 | 仅供 UI 使用的元数据，编译器忽略 |

### graph 对象

```json
{
  "graph": {
    "entrypoints": ["agent"],
    "nodes": [ ... ],
    "edges": [ ... ]
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `entrypoints` | string[] | 入口节点 ID 列表。当前运行时要求**恰好一个**入口。 |
| `nodes` | object[] | 节点配置列表 |
| `edges` | object[] | 边配置列表 |

---

## 节点类型详解

每个节点的基础字段：

```json
{
  "id": "node_id",
  "name": "显示名称",
  "kind": "llm | tool | transform | component",
  "description": "节点功能描述（可选）",
  "reads": ["messages"],
  "writes": ["messages", "response"],
  "config": { ... }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 节点唯一 ID（图内唯一） |
| `name` | string | 是 | 显示名称 |
| `kind` | string | 是 | 节点类型，见下文 |
| `description` | string | 否 | 功能描述 |
| `reads` | string[] | 否 | 该节点读取的状态字段 |
| `writes` | string[] | 否 | 该节点写入的状态字段 |
| `config` | object | 是 | 类型相关的配置 |

### LLM 节点（`kind: "llm"`）

调用大语言模型生成回复，支持工具调用。

```json
{
  "id": "agent",
  "name": "Agent",
  "kind": "llm",
  "reads": ["messages"],
  "writes": ["messages", "response"],
  "config": {
    "prompt_template": "你是一个有帮助的助手。",
    "output_key": "response",
    "tools_enabled": true,
    "tool_filter": null,
    "model_override": null,
    "temperature_override": null,
    "max_tokens": null,
    "max_iterations": 200,
    "message_key": null
  }
}
```

**config 字段说明**：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `prompt_template` | string | `""` | 系统提示词模板，支持 Jinja2 语法 |
| `output_key` | string | `"response"` | LLM 输出存入的状态字段名 |
| `tools_enabled` | bool | `true` | 是否启用工具调用 |
| `tool_filter` | string[] \| null | `null` | 限制可用工具列表，`null` 表示全部可用 |
| `model_override` | string \| null | `null` | 覆盖默认模型（如 `"gpt-4o"`） |
| `temperature_override` | float \| null | `null` | 覆盖温度参数（0.0 ~ 2.0） |
| `max_tokens` | int \| null | `null` | 最大输出 token 数 |
| `max_iterations` | int | `200` | 工具调用循环的最大迭代次数 |
| `message_key` | string \| null | `null` | 结构化输出时，指定哪个字段作为用户可见消息 |

**提示词模板**支持 Jinja2 语法，可以引用状态变量：

```
你是一个研究助手。当前研究主题：{{ state.research_brief }}
```

### Tool 节点（`kind: "tool"`）

执行 LLM 节点请求的工具调用。

```json
{
  "id": "tools",
  "name": "Tool Executor",
  "kind": "tool",
  "reads": ["messages"],
  "writes": ["messages", "tool_results"],
  "config": {
    "execute_all": true,
    "tool_filter": null,
    "output_key": "tool_results",
    "timeout_seconds": 60
  }
}
```

**config 字段说明**：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `execute_all` | bool | `true` | 执行上一条 AI 消息中的所有工具调用 |
| `tool_filter` | string[] \| null | `null` | 限制可执行的工具 |
| `output_key` | string | `"tool_results"` | 工具结果存入的状态字段名 |
| `timeout_seconds` | int | `60` | 工具执行超时时间（1 ~ 600 秒） |

### Transform 节点（`kind: "transform"`）

数据转换节点，使用 Jinja2 模板对状态数据进行处理。

```json
{
  "id": "formatter",
  "name": "Format Output",
  "kind": "transform",
  "reads": ["research_brief", "notes"],
  "writes": ["formatted_output"],
  "config": {
    "template": "## 研究简报\n{{ state.research_brief }}\n\n## 笔记\n{% for note in state.notes %}* {{ note }}\n{% endfor %}",
    "output_key": "formatted_output",
    "input_keys": ["research_brief", "notes"]
  }
}
```

**config 字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `template` | string | 是 | Jinja2 模板字符串 |
| `output_key` | string | 是 | 输出结果存入的状态字段名 |
| `input_keys` | string[] | 否 | 所需的状态字段列表 |

### Component 节点（`kind: "component"`）

引用已注册的可复用组件（子图）。

```json
{
  "id": "supervisor",
  "name": "Research Supervisor",
  "kind": "component",
  "reads": ["messages", "research_brief", "notes"],
  "writes": ["notes"],
  "config": {
    "component_ref": {
      "key": "deep_research:supervisor",
      "version": "^2.0"
    },
    "config_overrides": {
      "max_iterations": 24,
      "max_concurrent_units": 12
    }
  }
}
```

**config 字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `component_ref.key` | string | 是 | 组件唯一标识 |
| `component_ref.version` | string | 否 | SemVer 版本约束（默认 `"*"`） |
| `config_overrides` | object | 否 | 运行时配置覆盖 |

**版本约束语法**：

| 语法 | 含义 | 示例 |
|------|------|------|
| `"*"` | 任意版本 | 匹配所有版本 |
| `"^2.0"` | 兼容版本 | `>=2.0.0, <3.0.0` |
| `"~2.1.0"` | 补丁更新 | `>=2.1.0, <2.2.0` |
| `">=1.0.0"` | 大于等于 | `>=1.0.0` |

---

## 边与路由

边定义节点之间的执行流转。

### 基础结构

```json
{
  "from_node": "agent",
  "to_node": "tools",
  "when": null,
  "priority": 0,
  "label": "可选的显示标签"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `from_node` | string | 是 | 源节点 ID |
| `to_node` | string | 是 | 目标节点 ID，可使用 `"END"` 表示结束 |
| `when` | string \| object \| null | 否 | 触发条件，`null` 表示无条件 |
| `priority` | int | 否 | 优先级，多条边匹配时数值大的优先（默认 `0`） |
| `label` | string | 否 | UI 显示标签 |

### 无条件边

当 `when` 为 `null`（或省略）时，表示无条件流转：

```json
{ "from_node": "brief", "to_node": "supervisor" }
```

> **注意**：同一源节点只能有一条无条件边。

### 内置条件

用于工具调用路由，值为字符串：

| 条件 | 说明 |
|------|------|
| `"has_tool_calls"` | 上一条 AI 消息包含工具调用 |
| `"no_tool_calls"` | 上一条 AI 消息不包含工具调用 |

```json
[
  { "from_node": "agent", "to_node": "tools", "when": "has_tool_calls" },
  { "from_node": "agent", "to_node": "END", "when": "no_tool_calls" }
]
```

> **注意**：同一源节点不能混用内置条件和自定义谓词。

### 自定义谓词

基于状态字段值的条件路由，`when` 为 object：

```json
{
  "from_node": "clarify",
  "to_node": "END",
  "when": {
    "state_path": "need_clarification",
    "operator": "truthy"
  },
  "priority": 2
}
```

**谓词字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `state_path` | string | 要判断的状态字段路径 |
| `operator` | string | 比较运算符 |
| `value` | any | 比较值（`truthy`/`falsy` 时可省略） |

**支持的运算符**：

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `"eq"` | 等于 | `{"state_path": "status", "operator": "eq", "value": "done"}` |
| `"neq"` | 不等于 | `{"state_path": "status", "operator": "neq", "value": "error"}` |
| `"truthy"` | 真值判断 | `{"state_path": "has_results", "operator": "truthy"}` |
| `"falsy"` | 假值判断 | `{"state_path": "skip_step", "operator": "falsy"}` |

**多条件路由示例**：

```json
{
  "edges": [
    {
      "from_node": "classifier",
      "to_node": "END",
      "when": { "state_path": "need_clarification", "operator": "truthy" },
      "priority": 2,
      "label": "需要澄清"
    },
    {
      "from_node": "classifier",
      "to_node": "END",
      "when": { "state_path": "skip_research", "operator": "truthy" },
      "priority": 1,
      "label": "跳过研究"
    },
    {
      "from_node": "classifier",
      "to_node": "research",
      "when": { "state_path": "need_clarification", "operator": "falsy" },
      "priority": 0,
      "label": "开始研究"
    }
  ]
}
```

---

## 自定义状态

`state` 字段用于声明自定义状态字段，供节点间传递数据。系统自动提供 `messages` 和 `execution_context` 两个内置字段，无需声明。

### 结构

```json
{
  "state": {
    "schema": {
      "research_brief": {
        "type": "string",
        "default": "",
        "description": "研究简报内容"
      },
      "notes": {
        "type": "list",
        "default": [],
        "description": "收集到的研究笔记"
      },
      "is_complete": {
        "type": "bool",
        "default": false,
        "description": "是否完成"
      }
    },
    "reducers": {
      "notes": "replace"
    }
  }
}
```

### 字段类型

| type 值 | Python 类型 | 说明 |
|---------|-------------|------|
| `"string"` | `str` | 字符串 |
| `"int"` | `int` | 整数 |
| `"float"` | `float` | 浮点数 |
| `"bool"` | `bool` | 布尔值 |
| `"list"` | `list` | 列表 |
| `"dict"` | `dict` | 字典 |
| `"any"` | `Any` | 任意类型 |

### Reducer 类型

Reducer 决定当多个节点写入同一字段时如何合并值。

| reducer 值 | 说明 |
|------------|------|
| `"replace"` | 直接替换（默认） |
| `"add_messages"` | 使用 LangGraph 的消息追加策略 |

> **提示**：大多数自定义字段使用默认的 `replace` 即可，无需显式声明 reducer。`add_messages` 仅用于需要像 `messages` 一样追加消息的场景。

---

## 组件引用

组件是预先注册的可复用子图。你可以在节点中通过 `kind: "component"` 引用它们。

### 内置可用组件

| 组件 key | 说明 |
|----------|------|
| `stdlib:react` | 标准 ReAct 工具调用循环 |
| `deep_research:clarify` | 用户意图澄清 |
| `deep_research:brief` | 研究简报生成 |
| `deep_research:supervisor` | 研究任务调度 |
| `deep_research:final_report` | 最终报告撰写 |

### 使用方式

```json
{
  "id": "my_react",
  "name": "ReAct Loop",
  "kind": "component",
  "config": {
    "component_ref": {
      "key": "stdlib:react",
      "version": "*"
    },
    "config_overrides": {}
  }
}
```

组件节点在编译时会被展开为完整的子图。组件声明的 `required_capabilities` 会自动过滤可用工具，只传入匹配的工具。

### 声明依赖

如果你的 Agent 使用了组件，建议在 `deps.components` 中声明依赖：

```json
{
  "deps": {
    "components": [
      { "key": "deep_research:brief", "version": "^2.0" },
      { "key": "deep_research:supervisor", "version": "^2.0" }
    ]
  }
}
```

---

## 提示词配置

`prompt_config` 控制系统提示词的生成行为。最常用的字段是 `custom_instructions`，用于注入自定义指令。

```json
{
  "prompt_config": {
    "custom_instructions": "你是一位专注于学术研究的助手，回复时优先引用学术论文。",
    "identity": {
      "name": "Research Assistant",
      "description": "专门用于学术研究的 AI 助手"
    }
  }
}
```

### 可配置项

| 字段 | 说明 |
|------|------|
| `custom_instructions` | 自定义指令，拼接到系统提示词中 |
| `identity.name` | Agent 名称 |
| `identity.description` | Agent 描述 |
| `identity.persona` | 人格设定 |
| `branding.mask_provider` | 隐藏 LLM 提供商名称 |
| `formatting.use_markdown` | 使用 Markdown 格式输出 |
| `formatting.custom_blocks` | 支持的自定义代码块类型 |

> **提示**：对于简单场景，通常只需设置 `custom_instructions` 即可。

---

## 执行限制

`limits` 字段设置执行安全边界，防止失控循环。

```json
{
  "limits": {
    "max_time_s": 300,
    "max_steps": 128,
    "max_concurrency": 10
  }
}
```

| 字段 | 类型 | 默认值 | 范围 | 说明 |
|------|------|--------|------|------|
| `max_time_s` | int | `300` | 1 ~ 3600 | 最大执行时间（秒） |
| `max_steps` | int | `128` | 1 ~ 100000 | 最大执行步数 |
| `max_concurrency` | int | `10` | 1 ~ 256 | 最大并发数 |

> **注意**：如果图中包含循环（如 ReAct 的 agent → tools → agent），至少需要设置 `max_steps` 或 `max_time_s` 中的一个。

---

## 完整示例：多阶段研究 Agent

以下是一个简化的多阶段研究 Agent，展示了组件引用、自定义状态和条件路由的综合用法。

```json
{
  "schema_version": "3.0",
  "key": "my_research_agent",
  "revision": 1,
  "graph": {
    "entrypoints": ["clarify"],
    "nodes": [
      {
        "id": "clarify",
        "name": "意图澄清",
        "kind": "component",
        "description": "分析用户查询，判断是否需要澄清",
        "reads": ["messages"],
        "writes": ["messages", "need_clarification", "skip_research"],
        "config": {
          "component_ref": { "key": "deep_research:clarify", "version": "^2.0" }
        }
      },
      {
        "id": "brief",
        "name": "研究简报",
        "kind": "component",
        "description": "将用户消息转化为结构化研究简报",
        "reads": ["messages"],
        "writes": ["research_brief"],
        "config": {
          "component_ref": { "key": "deep_research:brief", "version": "^2.0" }
        }
      },
      {
        "id": "supervisor",
        "name": "研究调度",
        "kind": "component",
        "description": "协调子研究员进行研究",
        "reads": ["messages", "research_brief", "notes"],
        "writes": ["notes"],
        "config": {
          "component_ref": { "key": "deep_research:supervisor", "version": "^2.0" },
          "config_overrides": {
            "max_iterations": 24,
            "max_concurrent_units": 12
          }
        }
      },
      {
        "id": "final_report",
        "name": "最终报告",
        "kind": "component",
        "description": "将研究发现综合为完整报告",
        "reads": ["messages", "research_brief", "notes"],
        "writes": ["messages", "final_report"],
        "config": {
          "component_ref": { "key": "deep_research:final_report", "version": "^2.0" }
        }
      }
    ],
    "edges": [
      {
        "from_node": "clarify",
        "to_node": "END",
        "when": { "state_path": "need_clarification", "operator": "truthy" },
        "priority": 2,
        "label": "需要澄清"
      },
      {
        "from_node": "clarify",
        "to_node": "END",
        "when": { "state_path": "skip_research", "operator": "truthy" },
        "priority": 1,
        "label": "直接回复"
      },
      {
        "from_node": "clarify",
        "to_node": "brief",
        "when": { "state_path": "need_clarification", "operator": "falsy" },
        "priority": 0,
        "label": "开始研究"
      },
      { "from_node": "brief", "to_node": "supervisor" },
      { "from_node": "supervisor", "to_node": "final_report" },
      { "from_node": "final_report", "to_node": "END" }
    ]
  },
  "state": {
    "schema": {
      "research_brief": {
        "type": "string",
        "default": "",
        "description": "结构化研究简报"
      },
      "notes": {
        "type": "list",
        "default": [],
        "description": "收集的研究笔记"
      },
      "final_report": {
        "type": "string",
        "default": "",
        "description": "最终研究报告"
      },
      "need_clarification": {
        "type": "bool",
        "default": false,
        "description": "是否需要用户澄清"
      },
      "skip_research": {
        "type": "bool",
        "default": false,
        "description": "是否跳过研究直接回复"
      }
    },
    "reducers": {
      "notes": "replace"
    }
  },
  "deps": {
    "components": [
      { "key": "deep_research:clarify", "version": "^2.0" },
      { "key": "deep_research:brief", "version": "^2.0" },
      { "key": "deep_research:supervisor", "version": "^2.0" },
      { "key": "deep_research:final_report", "version": "^2.0" }
    ]
  },
  "limits": {
    "max_time_s": 600,
    "max_steps": 256,
    "max_concurrency": 12
  },
  "prompt_config": {
    "custom_instructions": ""
  },
  "metadata": {
    "display_name": "My Research Agent",
    "description": "多阶段深度研究工作流",
    "tags": ["research", "multi-phase"]
  }
}
```

**执行流程**：

```
[clarify] ──need_clarification=true──→ END（询问用户）
    │
    ├──skip_research=true──→ END（直接回复）
    │
    └──need_clarification=false──→ [brief] → [supervisor] → [final_report] → END
```

---

## 验证规则

配置在编译前会经过自动验证，以下是常见错误及解决方法。

| 错误码 | 说明 | 解决方法 |
|--------|------|----------|
| `EMPTY_GRAPH` | 图中没有节点 | 至少添加一个节点 |
| `DUPLICATE_NODE_ID` | 节点 ID 重复 | 确保所有节点 `id` 唯一 |
| `MULTIPLE_ENTRYPOINTS_UNSUPPORTED` | 入口点数量不为 1 | `entrypoints` 数组中只放一个节点 ID |
| `ENTRYPOINT_NOT_FOUND` | 入口点引用的节点不存在 | 检查 `entrypoints` 中的 ID 是否在 `nodes` 中 |
| `EDGE_FROM_START_FORBIDDEN` | 边的 `from_node` 使用了 `"START"` | 用 `entrypoints` 代替 START 边 |
| `EDGE_SOURCE_NOT_FOUND` | 边的源节点不存在 | 检查 `from_node` 的拼写 |
| `EDGE_TARGET_NOT_FOUND` | 边的目标节点不存在 | 检查 `to_node` 的拼写 |
| `MULTIPLE_DEFAULT_EDGES` | 同一源节点有多条无条件边 | 每个节点最多一条 `when: null` 的边 |
| `DUPLICATE_HAS_TOOL_CALLS_EDGE` | 同一节点有重复的 `has_tool_calls` 边 | 每个节点只能有一条 |
| `MIXED_BUILTIN_AND_CUSTOM_ROUTING` | 混用内置条件和自定义谓词 | 同一节点的出边只能用一种条件类型 |
| `UNREACHABLE_NODE` | 存在从入口无法到达的节点 | 确保所有节点都可从入口到达 |
| `END_UNREACHABLE` | 没有路径可以到达 END | 确保至少有一条路径通向 `"END"` |
| `CYCLE_LIMITS_REQUIRED` | 有循环但未设置执行限制 | 设置 `limits.max_steps` 或 `limits.max_time_s` |
| `PREDICATE_STATE_PATH_MISSING` | 谓词引用了不存在的状态字段 | 在 `state.schema` 中声明该字段 |

---

## 附录：Schema 参考

### 顶层字段

```
GraphConfig
├── schema_version: "3.0"           (必填)
├── key: string                     (必填)
├── revision: int >= 1              (默认 1)
├── graph: GraphIR                  (必填)
│   ├── entrypoints: string[]       (恰好 1 个)
│   ├── nodes: GraphNodeConfig[]
│   └── edges: GraphEdgeConfig[]
├── state: GraphStateConfig
│   ├── schema: { [key]: StateFieldSchema }
│   └── reducers: { [key]: "replace" | "add_messages" }
├── deps: GraphDeps
│   ├── models: ModelDependencyRef[]
│   ├── tools: string[]
│   ├── prompts: PromptDependencyRef[]
│   └── components: ComponentDependencyRef[]
├── limits: GraphExecutionLimits
│   ├── max_time_s: int (1~3600, 默认 300)
│   ├── max_steps: int (1~100000, 默认 128)
│   └── max_concurrency: int (1~256, 默认 10)
├── prompt_config: PromptConfig
│   ├── custom_instructions: string
│   ├── identity: { name, description, persona }
│   ├── branding: { mask_provider, mask_model, ... }
│   ├── security: { injection_defense, ... }
│   ├── safety: { content_safety, ... }
│   ├── formatting: { use_markdown, custom_blocks, ... }
│   └── context: { include_date, custom_context, ... }
├── metadata: GraphMetadata
│   ├── display_name: string
│   ├── description: string
│   ├── tags: string[]
│   └── agent_version: string
└── ui: { ... }                     (编译器忽略)
```

### 节点 kind → config 映射

| kind | config 类型 | 必填字段 |
|------|------------|----------|
| `"llm"` | LLMNodeConfig | `output_key` |
| `"tool"` | ToolNodeConfig | `execute_all` |
| `"transform"` | TransformNodeConfig | `template`, `output_key` |
| `"component"` | ComponentNodeConfig | `component_ref.key` |

### 特殊节点标识

| 标识 | 说明 |
|------|------|
| `"END"` | 在 `to_node` 中使用，表示图执行结束 |

> `"START"` 不再用于边。请使用 `graph.entrypoints` 指定入口节点。
