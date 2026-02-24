import type { TFunction } from "i18next";
import type { XyzenChatConfig } from "@/hooks/useXyzenChat";
import { DEFAULT_TOPIC_TITLE_KEY } from "@/configs/common";

// Build chat config with translated strings
export function getXyzenChatConfig(t: TFunction): XyzenChatConfig {
  return {
    theme: "indigo" as const,
    systemAgentTag: "default_chat",
    storageKeys: {
      historyPinned: "chatHistoryPinned",
    },
    defaultTitle: t(DEFAULT_TOPIC_TITLE_KEY),
    placeholders: {
      responding: t("app.chatConfig.placeholders.responding"),
      default: t("app.chatConfig.placeholders.default"),
    },
    connectionMessages: {
      connecting: t("app.chatConfig.connection.connecting"),
      retrying: t("app.chatConfig.connection.retrying"),
    },
    responseMessages: {
      generating: t("app.chatConfig.response.generating"),
      creating: "",
    },
    emptyState: {
      title: "Xyzen Chat",
      description: t("app.chatConfig.emptyState.description"),
      icon: "💬",
      features: [
        t("app.chatConfig.features.smartChat"),
        t("app.chatConfig.features.realtime"),
        t("app.chatConfig.features.multimodal"),
      ],
    },
    welcomeMessage: {
      title: t("app.chatConfig.welcomeMessage.title"),
      description: t("app.chatConfig.welcomeMessage.description"),
      icon: "👋",
    },
  };
}

export type ChatThemeKey = "xyzen";
