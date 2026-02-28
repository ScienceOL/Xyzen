# AgentGraphEditor — Developer Guide

Visual graph editor for designing v3 GraphConfig agent workflows.

## Architecture

```
AgentGraphEditor.tsx          ← ReactFlow canvas + toolbar + panel orchestration
├── useGraphConfig.ts         ← Bidirectional sync: GraphConfig JSON ↔ React Flow state
├── FloatingConfigPanel.tsx   ← Right-side node editing panel (thin shell)
│   └── sections/
│       ├── CommonSection     ← Name, description, reads, writes
│       ├── LLMSection        ← Prompt, output, model, tools (Disclosure accordions)
│       ├── ToolSection       ← execute_all, tool_filter, timeout
│       ├── TransformSection  ← template, output_key, input_keys
│       └── ComponentSection  ← component_ref.key/version + config_overrides hint
├── FloatingEdgePanel.tsx     ← Left-side edge condition editing panel
├── NodePanel.tsx             ← Drag-to-create node palette (popover)
├── nodes/
│   ├── BaseAgentNode.tsx     ← User-defined node with R/W indicators + tool filter badge
│   ├── StartNode.tsx         ← Circular green start node
│   └── EndNode.tsx           ← Circular red end node
└── edges/
    ├── DefaultEdge.tsx       ← Smooth step edge with hover-delete
    └── ConditionalEdge.tsx   ← Dashed violet edge with label badge + hover-delete
```

## GraphConfig → Visual Editor Field Mapping

| GraphConfig Field              | Node Kind          | Visual Editor Component                         |
| ------------------------------ | ------------------ | ----------------------------------------------- |
| `node.id`                      | All                | CommonSection (read-only text)                  |
| `node.name`                    | All                | CommonSection → Input                           |
| `node.description`             | All                | CommonSection → Input                           |
| `node.reads`                   | All                | CommonSection → TagInput                        |
| `node.writes`                  | All                | CommonSection → TagInput                        |
| `config.prompt_template`       | LLM                | LLMSection → Textarea (mono)                    |
| `config.output_key`            | LLM/Tool/Transform | LLMSection/ToolSection/TransformSection → Input |
| `config.message_key`           | LLM                | LLMSection → Input                              |
| `config.model_override`        | LLM                | LLMSection → Input                              |
| `config.temperature_override`  | LLM                | LLMSection → Input (number)                     |
| `config.max_tokens`            | LLM                | LLMSection → Input (number)                     |
| `config.tools_enabled`         | LLM                | LLMSection → Switch                             |
| `config.tool_filter`           | LLM/Tool           | LLMSection/ToolSection → TagInput               |
| `config.max_iterations`        | LLM                | LLMSection → Input (number, ≥1)                 |
| `config.execute_all`           | Tool               | ToolSection → Switch                            |
| `config.timeout_seconds`       | Tool               | ToolSection → Input (number, 1-600)             |
| `config.template`              | Transform          | TransformSection → Textarea (mono)              |
| `config.input_keys`            | Transform          | TransformSection → TagInput                     |
| `config.component_ref.key`     | Component          | ComponentSection → Input                        |
| `config.component_ref.version` | Component          | ComponentSection → Input                        |
| `config.config_overrides`      | Component          | ComponentSection → JSON hint                    |
| `edge.label`                   | Edge               | FloatingEdgePanel → Input                       |
| `edge.priority`                | Edge               | FloatingEdgePanel → Input (number)              |
| `edge.when` (builtin)          | Edge               | FloatingEdgePanel → Select                      |
| `edge.when` (predicate)        | Edge               | FloatingEdgePanel → state_path/op/value         |

## Data Flow

```
[JSON Editor] ──onChange──→ [Parent State] ──value prop──→ [AgentGraphEditor]
                                 ↑                              │
                                 │                    useGraphConfig hook
                                 │                              │
                           onChange callback ←──── flowToGraphConfig()
                                                       ↑
                                               React Flow state
                                              (nodes[], edges[])
```

**Loop prevention**: `useGraphConfig` uses two hash refs:

- `lastExternalHashRef` — tracks the last config synced FROM parent
- `lastPushedHashRef` — tracks the last config pushed TO parent

Both are compared before syncing to prevent echo loops.

## useGraphConfig Hook API

| Method       | Signature                                                     |
| ------------ | ------------------------------------------------------------- |
| `addNode`    | `(kind: GraphNodeKind, position?) → nodeId`                   |
| `updateNode` | `(nodeId, { name?, description?, reads?, writes?, config? })` |
| `deleteNode` | `(nodeId) → void`                                             |
| `updateEdge` | `(edgeId, { label?, priority?, when? }) → void`               |
| `deleteEdge` | `(edgeId) → void`                                             |
| `onConnect`  | React Flow connection handler                                 |
| `reset`      | Reset to initial config                                       |
| `getConfig`  | Get current GraphConfig snapshot                              |

## Custom Edge Types

| Type              | File                | Visual                                             |
| ----------------- | ------------------- | -------------------------------------------------- |
| `default`         | DefaultEdge.tsx     | Solid neutral stroke, hover-delete button          |
| `conditionalEdge` | ConditionalEdge.tsx | Dashed violet (#8b5cf6), label badge, hover-delete |

Edges are auto-typed in `graphConfigToFlow()`: if `edge.when` is set, type = `conditionalEdge`.

## Adding a New Node Kind

1. Add the kind to `GraphNodeKind` in `types/graphConfig.ts`
2. Add type interfaces (`XxxNodeConfig`, `XxxGraphNode`) and `createDefaultXxxNode()` helper
3. Add color/icon in `getNodeTypeInfo()`
4. Create `sections/XxxSection.tsx` with the config fields
5. Add the section to `FloatingConfigPanel.tsx` switch
6. Add drag entry in `NodePanel.tsx`
7. Add i18n keys under `graphEditor.xxx.*` in `en/agents.json` and `zh/agents.json`

## Adding a New Config Field to an Existing Kind

1. Add the field to the TypeScript interface in `types/graphConfig.ts`
2. Add the field to the default factory (e.g., `createDefaultLLMNode`)
3. Add an `<Input>`, `<Textarea>`, `<Switch>`, or `<TagInput>` in the section component
4. Add i18n label/placeholder keys
5. The `updateNode` handler spreads `config` updates automatically

## i18n Key Reference

All keys live under `agents.graphEditor.*`:

- `nodePanel.{title, id, deleteNode}` — panel chrome
- `common.{name, description, reads, writes, ...}` — shared fields
- `llm.*`, `tool.*`, `transform.*`, `component.*` — kind-specific
- `edge.{title, label, priority, conditionType, ...}` — edge panel

## Design System Compliance

- All inputs use `<Input>` / `<Textarea>` / `<TagInput>` base components (enforces `rounded-sm`)
- Labels use `<FieldGroup>` wrapper (`text-[13px]`, consistent spacing)
- Panels use frosted glass: `bg-white/95 backdrop-blur-sm dark:bg-neutral-800/95`
- Scroll containers have `custom-scrollbar` class
- No `rounded-xl` / `rounded-2xl` on inner elements
- Flat card surfaces use `bg-neutral-100/60 dark:bg-white/[0.04]` (no borders)
- Switches use the shared `<Switch>` from `components/base/Switch.tsx`
