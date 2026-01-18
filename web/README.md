# Xyzen Web

Frontend for Xyzen, built with React and Zustand. This README covers both npm package integration and repo development.

## Language Versions

[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![中文文档](https://img.shields.io/badge/Language-中文-orange)](README_zh.md)

## Package Integration (Embed Xyzen)

Use this path if you want to embed the chat sidebar in an existing React app.

### 1) Deploy the backend

From the repo root:

```bash
./launch/dev.sh
```

The backend is available at `http://localhost:48196` with APIs under `/xyzen/api`, `/xyzen/ws`, and `/xyzen/mcp`.

### 2) Install the component

```bash
yarn add @sciol/xyzen
```

or

```bash
npm install @sciol/xyzen
```

### 3) Render the component

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

`backendUrl` should point to your Xyzen backend base URL. The component will handle `/xyzen/api`, `/xyzen/ws`, and `/xyzen/mcp` internally.

## Repo Development (Contribute to Web)

Use this path if you are working on the web app in this repo.

### Prerequisites

- Node.js with Yarn (via Corepack)
- A running Xyzen backend (see root README)

### Setup

```bash
cd web
corepack enable
yarn install
yarn dev
```

The web app runs at `http://localhost:32233` and connects to the local backend by default.

## `useXyzen` Store API

The `useXyzen` hook exposes the sidebar state and actions.

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
