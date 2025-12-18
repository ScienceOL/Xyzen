import type { XyzenChatConfig } from "@/hooks/useXyzenChat";

// Individual configuration exports for type safety
export const XYZEN_CHAT_CONFIG: XyzenChatConfig = {
  theme: "indigo" as const,
  systemAgentTag: "default_chat",
  storageKeys: {
    inputHeight: "chatInputHeight",
    historyPinned: "chatHistoryPinned",
  },
  defaultTitle: "新的聊天",
  placeholders: {
    responding: "AI 正在回复中，暂时无法发送…",
    default: "输入消息...",
  },
  connectionMessages: {
    connecting: "正在连接聊天服务...",
    retrying: "重试连接",
  },
  responseMessages: {
    generating: "AI 正在生成回复…",
    creating: "",
  },
  emptyState: {
    title: "Xyzen Chat",
    description: "选择一个智能助手开始对话",
    icon: "💬",
    features: ["智能对话", "实时响应", "多模态支持"],
  },
  welcomeMessage: {
    title: "欢迎使用 Xyzen",
    description: "您可以在这里与AI助手自由讨论任何话题",
    icon: "👋",
  },
} as const;

export const CHAT_THEMES = {
  xyzen: XYZEN_CHAT_CONFIG,
} as const satisfies Record<string, XyzenChatConfig>;

export type ChatThemeKey = keyof typeof CHAT_THEMES;
