import type { WorkShopChatConfig } from "@/hooks/useWorkShopChat";
import type { XyzenChatConfig } from "@/hooks/useXyzenChat";

// Union type to handle both chat configurations
type ChatConfig = XyzenChatConfig | WorkShopChatConfig;

// Individual configuration exports for type safety
export const XYZEN_CHAT_CONFIG: XyzenChatConfig = {
  theme: "indigo" as const,
  systemAgentId: "00000000-0000-0000-0000-000000000001", // System Chat Agent
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

export const WORKSHOP_CHAT_CONFIG: WorkShopChatConfig = {
  theme: "purple" as const,
  systemAgentId: "00000000-0000-0000-0000-000000000002", // System Workshop Agent
  storageKeys: {
    inputHeight: "workshopChatInputHeight",
    historyPinned: "workshopChatHistoryPinned",
  },
  defaultTitle: "新的工作坊会话",
  placeholders: {
    responding: "AI 正在协助创建中，暂时无法发送…",
    default: "描述你想创建的助手...",
  },
  connectionMessages: {
    connecting: "正在连接工作坊服务...",
    retrying: "重试连接",
  },
  responseMessages: {
    generating: "AI 正在协助创建…",
    creating: "AI 正在协助创建…",
  },
  emptyState: {
    title: "工作坊",
    description: "创建和设计新的智能助手",
    icon: "🔧",
    features: ["🤖 助手创建", "📊 图形设计", "💬 交互聊天"],
  },
  welcomeMessage: {
    title: "开始在工作坊中创建",
    description: "与AI助手协作设计和创建新的智能助手",
    icon: "🔧",
    tags: ["描述你的想法", "定义功能需求", "设计交互流程"],
  },
} as const;

export const CHAT_THEMES = {
  xyzen: XYZEN_CHAT_CONFIG,
  workshop: WORKSHOP_CHAT_CONFIG,
} as const satisfies Record<string, ChatConfig>;

export type ChatThemeKey = keyof typeof CHAT_THEMES;
