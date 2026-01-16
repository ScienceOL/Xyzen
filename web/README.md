# Xyzen React Component

Xyzen is a modern, lightweight, and extensible chat component for React. It provides a full-featured sidebar that can be easily integrated into any React application.

## Getting Started with Integration

To use the Xyzen component in your own project, you need to deploy the backend service first, then integrate the frontend component.

### Step 1: Deploy the Backend

The Xyzen component requires a running backend service to handle chat logic and LLM connections. The backend uses Docker for all infrastructure dependencies.

1. Clone the Xyzen repository:

   ```bash
   git clone https://github.com/ScienceOL/Xyzen.git
   cd Xyzen
   ```

2. Deploy the backend using Docker:

   **On Unix/Linux/macOS:**

   ```bash
   ./launch/dev.sh
   ```

   **On Windows (PowerShell):**

   ```powershell
   .\launch\dev.ps1
   ```

   This script will automatically set up all required services (PostgreSQL, Mosquitto, Casdoor) and start the backend.

3. Configure LLM provider settings by creating a `.env.dev` file in the `docker` directory with the following keys:

   ```env
   XYZEN_LLM_PROVIDER=azure_openai
   XYZEN_LLM_KEY=<Your-LLM-API-Key>
   XYZEN_LLM_ENDPOINT=<Your-LLM-Endpoint>
   XYZEN_LLM_VERSION=<Your-LLM-API-Version>
   XYZEN_LLM_DEPLOYMENT=<Your-LLM-Deployment-Name>
   ```

   The backend will be available at `http://localhost:48196` by default, with API endpoints under `/xyzen/api`, `/xyzen/ws`, and `/xyzen/mcp`.

### Step 2: Install and Integrate the Frontend Component

1. Install the Xyzen component in your React project:

   ```bash
   yarn add @sciol/xyzen
   ```

   or

   ```bash
   npm install @sciol/xyzen
   ```

2. Add the `Xyzen` component to your application layout:

   In your root layout file (e.g., `App.tsx` or `Layout.tsx`), import and render the `Xyzen` component with the `backendUrl` prop pointing to your deployed backend:

   ```tsx
   // src/App.tsx
   import { Xyzen, useXyzen } from "@sciol/xyzen";
   import "@sciol/xyzen/dist/style.css"; // Import the CSS

   function App() {
     const { openXyzen } = useXyzen();

     return (
       <div>
         <header>
           <h1>My Application</h1>
           <button onClick={openXyzen}>Open Chat</button>
         </header>
         <main>{/* Your application content */}</main>
         <Xyzen backendUrl="http://localhost:48196" />
       </div>
     );
   }

   export default App;
   ```

   **Note:** The `backendUrl` should point to the base URL of your Xyzen backend deployment. The component will automatically handle endpoints like `/xyzen/api`, `/xyzen/ws`, and `/xyzen/mcp`.

3. Control the Xyzen panel from any component:

   Use the `useXyzen` hook to control the sidebar's visibility:

   ```tsx
   import { useXyzen } from "@sciol/xyzen";

   function MyComponent() {
     const { isXyzenOpen, toggleXyzen, openXyzen, closeXyzen } = useXyzen();

     return (
       <div>
         <p>The chat panel is currently {isXyzenOpen ? "open" : "closed"}.</p>
         <button onClick={toggleXyzen}>Toggle Chat</button>
         <button onClick={openXyzen}>Open Chat</button>
         <button onClick={closeXyzen}>Close Chat</button>
       </div>
     );
   }
   ```

## Local Development

To contribute to or modify the Xyzen web client source code, follow these steps.

### Prerequisites

- Node.js with Yarn (via Corepack)
- A running instance of the Xyzen backend service (see "Deploy the Backend" above)

### Setup

1. Navigate to the web directory:

   ```bash
   cd web
   ```

2. Enable Corepack to manage Yarn:

   ```bash
   corepack enable
   ```

3. Install dependencies using Yarn:

   ```bash
   yarn install
   ```

4. Run the development server:

   ```bash
   yarn dev
   ```

   The frontend will be available at `http://localhost:32233` and will connect to the local backend service.

## `useXyzen` Store API

The `useXyzen` hook provides access to the Xyzen state and actions.

### State

- `isXyzenOpen: boolean`: Whether the sidebar is open.
- `panelWidth: number`: The current width of the sidebar.
- `activeChatChannel: string | null`: The ID of the currently active chat channel.
- `user: User | null`: The current user information.
- `activeTabIndex: number`: The index of the currently active tab.
- `theme: 'light' | 'dark' | 'system'`: The current theme.
- `chatHistory: ChatHistoryItem[]`: The list of chat history items.
- `chatHistoryLoading: boolean`: Whether the chat history is being loaded.
- `channels: Record<string, ChatChannel>`: A map of chat channels.
- `assistants: Assistant[]`: The list of available assistants.

### Actions

- `toggleXyzen()`: Toggles the open/closed state of the sidebar.
- `openXyzen()`: Opens the sidebar.
- `closeXyzen()`: Closes the sidebar.
- `setPanelWidth(width: number)`: Sets the width of the sidebar.
- `setActiveChatChannel(channelUUID: string | null)`: Sets the currently active chat channel.
- `setTabIndex(index: number)`: Sets the active tab.
- `setTheme(theme: Theme)`: Sets the theme.
- `fetchChatHistory(): Promise<void>`: Fetches the chat history asynchronously.
- `togglePinChat(chatId: string)`: Toggles the pinned state of a chat.
- `sendMessage(payload: { channelUUID: string; message: string })`: Sends a message to a specified channel.
- `createDefaultChannel()`: Creates a new default chat channel。

## Customization

Xyzen is designed to be extensible. You can leverage the state and actions in the `useXyzen` store to build custom functionality or integrate with other components.

For example, you could create a button that not only opens Xyzen but also switches to a specific tab:

```tsx
import { useXyzen } from "@sciol/xyzen";

function GoToHistoryButton() {
  const { openXyzen, setTabIndex } = useXyzen();

  const handleClick = () => {
    setTabIndex(1); // 1 是历史标签页的索引
    openXyzen();
  };

  return <button onClick={handleClick}>查看聊天历史</button>;
}
```
