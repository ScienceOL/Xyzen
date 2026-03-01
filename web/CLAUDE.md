# Frontend Guide

## Directory Structure (`src/`)

```
app/                             # Page components and routing
components/
  ├── base/                      # Shared base UI primitives
  │   ├── Input.tsx              # Single-line input (motion focus, rounded-sm)
  │   ├── Textarea.tsx           # Multi-line textarea (same visual treatment)
  │   └── FieldGroup.tsx         # Label + input + hint wrapper
  ├── layouts/
  │   └── components/
  │       ├── ChatBubble.tsx           # Message rendering
  │       ├── AgentExecutionTimeline.tsx # Multi-phase agent UI
  │       ├── AgentPhaseCard.tsx       # Phase display
  │       └── LoadingMessage.tsx       # Loading indicator
  ├── features/                  # Feature-specific components
  └── ui/                        # shadcn/ui design system
core/
  ├── chat/                      # Chat business logic
  └── session/                   # Session management
hooks/
  ├── queries/                   # TanStack Query hooks
  └── useXyzenChat.ts            # Chat hook
service/
  ├── xyzenService.ts            # WebSocket client
  └── sessionService.ts          # Session API
store/
  └── slices/
      ├── chatSlice.ts           # Chat state, event handling
      └── agentSlice.ts          # Agent management
types/
  ├── agentEvents.ts             # Agent event type definitions
  └── agents.ts                  # Agent interfaces
```

## Frontend Layers

- Server-Side State: Components (UI only) → Hooks → Core (business logic) → ReactQuery (data cache) → Service (HTTP/WS)/Store (Zustand)
- Client-Side State: Components (UI only) → Hooks → Core (business logic) → read Service (HTTP/WS) → write to Store (Zustand)

## Streaming Frontend State

```typescript
interface Message {
  id: string;
  content: string;
  agentExecution?: {
    agentType: string; // "react", "deep_research"
    status: "running" | "completed" | "failed";
    phases: Array<{
      id: string; // Node ID
      status: "running" | "completed";
      streamedContent: string; // Accumulated content
    }>;
    currentNode?: string;
  };
}
```

### Content Routing

**Multi-phase agents** (deep_research): Content → `phase.streamedContent` → `AgentExecutionTimeline`

**Simple agents** (react): Content → `phase.streamedContent` → `ChatBubble` renders directly

**Key**: For react agents without `node_start` events, frontend creates fallback "Response" phase in `streaming_start` handler.

## Internationalization

The frontend supports multiple languages (`en`, `zh`, `ja`). Translations are modularized into separate JSON files under `src/i18n/locales/{lang}/`.

### Translation Modules

| File               | Scope                                      |
| ------------------ | ------------------------------------------ |
| `app.json`         | Navigation, toolbar, model selector, input |
| `common.json`      | Shared actions (OK, Cancel, Loading)       |
| `settings.json`    | Settings modal, theme/language config      |
| `marketplace.json` | Agent marketplace listing and details      |
| `knowledge.json`   | File management, uploads, knowledge sets   |
| `mcp.json`         | MCP server connection and management       |
| `agents.json`      | Agent CRUD forms and validation            |

### Workflow

1.  **Add Keys**: Add new strings to the appropriate `en/*.json` file.
2.  **Sync Languages**: Ensure `zh/*.json` and `ja/*.json` have matching keys.
3.  **Component Usage**: Access using the `filename` as a prefix.

```typescript
// Example: accessing "ok" from common.json
const { t } = useTranslation();
<Button>{t("common.ok")}</Button>;
```

## Design Language

All modals, panels, and overlay surfaces follow a **mobile-first, flat design** system built on these principles:

- **SheetModal-first**: Bottom sheet on mobile, centered dialog on desktop, frosted glass chrome
- **Flat surfaces**: No visible borders on cards — use semi-transparent background fills instead
- **Tight radius hierarchy**: `rounded-sm` for inputs, `rounded-lg` for cards/buttons, shell-only for `rounded-2xl`+
- **Motion feedback**: Focus states use framer-motion spring scale + indigo ring glow
- **Consistent typography**: `text-[13px]` body, `text-xs` hints, `text-lg` titles

### Modal Component

Always use `<SheetModal>` (`components/animate-ui/components/animate/sheet-modal.tsx`) instead of raw `<Modal>`. SheetModal provides:

- **Mobile**: Full-width bottom sheet (`h-[95dvh]`, rounded top corners, swipe-to-dismiss)
- **Desktop**: Centered dialog with size presets (`sm` / `md` / `lg` / `xl` / `full`)
- Built-in frosted glass chrome, backdrop blur, and border treatment

### Modal Layout Pattern

Structure every modal as three vertical sections:

```tsx
<SheetModal isOpen={open} onClose={onClose} size="md">
  {/* Header — shrink-0, border-b */}
  <div className="shrink-0 border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
    <h2 className="text-lg font-semibold …">…</h2>
  </div>

  {/* Scrollable content — flex-1, overflow-y-auto, custom-scrollbar */}
  <div className="custom-scrollbar flex-1 overflow-y-auto">
    <div className="space-y-6 px-5 py-5">…</div>
  </div>

  {/* Footer — shrink-0, border-t */}
  <div className="shrink-0 border-t border-neutral-200/60 px-5 py-4 dark:border-neutral-800/60">
    <div className="flex justify-end gap-2.5">…</div>
  </div>
</SheetModal>
```

### Visual Tokens

| Element          | Light                                                     | Dark                            |
| ---------------- | --------------------------------------------------------- | ------------------------------- |
| Card / surface   | `bg-neutral-100/60 rounded-lg`                            | `dark:bg-white/[0.04]`          |
| Info alert       | `bg-neutral-100/60` + icon `text-neutral-400`             | same                            |
| Success alert    | `bg-green-50/80` + icon `text-green-500`                  | `dark:bg-green-950/30`          |
| Error alert      | `bg-red-50/80` + icon `text-red-500`                      | `dark:bg-red-950/30`            |
| Warning alert    | `bg-amber-50/80` + icon `text-amber-500`                  | `dark:bg-amber-950/20`          |
| Input / textarea | `rounded-sm` via `<Input>` / `<Textarea>` base components | ring border + motion focus glow |
| Primary button   | `bg-indigo-500 rounded-lg text-[13px] font-semibold`      | `dark:hover:bg-indigo-400`      |
| Secondary button | `bg-neutral-100/80 rounded-lg text-[13px]`                | `dark:bg-white/[0.06]`          |
| Section border   | `border-neutral-200/60`                                   | `dark:border-neutral-800/60`    |
| Body text        | `text-[13px] text-neutral-700`                            | `dark:text-neutral-300`         |
| Label            | `text-[13px] font-medium text-neutral-700`                | `dark:text-neutral-300`         |
| Caption / hint   | `text-xs text-neutral-400`                                | `dark:text-neutral-500`         |

### Base Form Components

Always use the shared base components for form fields. Never write inline `<input>` / `<textarea>` with manual styling.

| Component      | Path                             | Purpose                                                              |
| -------------- | -------------------------------- | -------------------------------------------------------------------- |
| `<Input>`      | `components/base/Input.tsx`      | Single-line input with `rounded-sm`, motion scale + ring focus glow  |
| `<Textarea>`   | `components/base/Textarea.tsx`   | Multi-line textarea, same visual treatment as `<Input>`              |
| `<FieldGroup>` | `components/base/FieldGroup.tsx` | Label + children + hint wrapper with consistent `mb-2` / `mt-2` gaps |

Usage pattern:

```tsx
<FieldGroup label="Name" required hint="Keep it short.">
  <Input placeholder="My Agent" value={name} onChange={…} />
</FieldGroup>
```

### Design Rules

1. **No explicit borders on cards** — use subtle background fills (`bg-neutral-100/60`, `bg-white/[0.04]`) instead of `border` for inner containers.
2. **Small border-radius only** — use `rounded-lg` (8px) for cards, buttons, badges. Use `rounded-sm` (2px) for all input/textarea fields (enforced by the `<Input>` and `<Textarea>` base components). **Never** use `rounded-xl` / `rounded-2xl` / `rounded-3xl` on inner elements. The only exception is the `SheetModal` shell itself (managed by the component internally).
3. **`custom-scrollbar`** class on every `overflow-y-auto` container (defined in `web/index.css`).
4. **Consistent spacing** — `px-5 py-5` inside scroll area, `gap-2.5` between buttons, `space-y-6` between sections. Use `<FieldGroup>` for label/input/hint spacing.
5. **Semi-transparent tinted backgrounds** for status colors (e.g., `bg-red-50/80`, `bg-green-950/30`) — never opaque solid fills.
6. **Text sizing**: Use `text-[13px]` for body/labels, `text-xs` for hints/captions, `text-lg` for modal titles.
7. **Active selection** uses a soft `ring-1 ring-{color}-500/30` instead of a thick `border-2`.
