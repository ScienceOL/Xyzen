# Xyzen Web

Xyzen 前端（React + Zustand）。本 README 同时包含 npm 集成与仓库开发两种使用方式。

## Language Versions

[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![中文文档](https://img.shields.io/badge/Language-中文-orange)](README_zh.md)

## npm 集成（嵌入 Xyzen）

如果需要在现有 React 项目中嵌入侧边栏，请使用此流程。

### 1) 启动后端

在仓库根目录执行：

```bash
./launch/dev.sh
```

后端默认地址：`http://localhost:48196`，接口包含 `/xyzen/api`、`/xyzen/ws`、`/xyzen/mcp`。

### 2) 安装组件

```bash
yarn add @sciol/xyzen
```

或：

```bash
npm install @sciol/xyzen
```

### 3) 渲染组件

```tsx
import { Xyzen, useXyzen } from "@sciol/xyzen";
import "@sciol/xyzen/dist/style.css";

function App() {
  const { openXyzen } = useXyzen();

  return (
    <div>
      <header>
        <h1>My Application</h1>
        <button onClick={openXyzen}>Open Chat</button>
      </header>
      <main>{/* Your app content */}</main>
      <Xyzen backendUrl="http://localhost:48196" />
    </div>
  );
}

export default App;
```

`backendUrl` 指向后端基础地址即可，组件内部会自动拼接 `/xyzen/api`、`/xyzen/ws`、`/xyzen/mcp`。

## 仓库开发（修改 Web）

如果要参与前端开发，请使用此流程。

### 前置条件

- Node.js + Yarn（Corepack）
- 已启动的 Xyzen 后端（见根目录 README）

### 本地启动

```bash
cd web
corepack enable
yarn install
yarn dev
```

前端地址：`http://localhost:32233`，默认连接本地后端。

## `useXyzen` Store API

`useXyzen` hook 提供侧边栏的状态与操作方法。

### State

- `isXyzenOpen: boolean`
- `panelWidth: number`
- `activeChatChannel: string | null`
- `user: User | null`
- `activeTabIndex: number`
- `theme: "light" | "dark" | "system"`
- `chatHistory: ChatHistoryItem[]`
- `chatHistoryLoading: boolean`
- `channels: Record<string, ChatChannel>`
- `assistants: Assistant[]`

### Actions

- `toggleXyzen()`
- `openXyzen()`
- `closeXyzen()`
- `setPanelWidth(width: number)`
- `setActiveChatChannel(channelUUID: string | null)`
- `setTabIndex(index: number)`
- `setTheme(theme: Theme)`
- `fetchChatHistory(): Promise<void>`
- `togglePinChat(chatId: string)`
- `sendMessage(payload: { channelUUID: string; message: string })`
- `createDefaultChannel()`
