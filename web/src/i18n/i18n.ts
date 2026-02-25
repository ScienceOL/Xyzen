import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enAgents from "./locales/en/agents.json";
import enApp from "./locales/en/app.json";
import enCapsule from "./locales/en/capsule.json";
import enCommon from "./locales/en/common.json";
import enKnowledge from "./locales/en/knowledge.json";
import enLanding from "./locales/en/landing.json";
import enMarketplace from "./locales/en/marketplace.json";
import enMcp from "./locales/en/mcp.json";
import enNotifications from "./locales/en/notifications.json";
import enRunner from "./locales/en/runner.json";
import enSettings from "./locales/en/settings.json";
import enSkillMarketplace from "./locales/en/skillMarketplace.json";
import enSubscription from "./locales/en/subscription.json";
import enTerminal from "./locales/en/terminal.json";

import jaAgents from "./locales/ja/agents.json";
import jaApp from "./locales/ja/app.json";
import jaCapsule from "./locales/ja/capsule.json";
import jaCommon from "./locales/ja/common.json";
import jaKnowledge from "./locales/ja/knowledge.json";
import jaLanding from "./locales/ja/landing.json";
import jaMarketplace from "./locales/ja/marketplace.json";
import jaMcp from "./locales/ja/mcp.json";
import jaNotifications from "./locales/ja/notifications.json";
import jaRunner from "./locales/ja/runner.json";
import jaSettings from "./locales/ja/settings.json";
import jaSkillMarketplace from "./locales/ja/skillMarketplace.json";
import jaSubscription from "./locales/ja/subscription.json";
import jaTerminal from "./locales/ja/terminal.json";

import zhAgents from "./locales/zh/agents.json";
import zhApp from "./locales/zh/app.json";
import zhCapsule from "./locales/zh/capsule.json";
import zhCommon from "./locales/zh/common.json";
import zhKnowledge from "./locales/zh/knowledge.json";
import zhLanding from "./locales/zh/landing.json";
import zhMarketplace from "./locales/zh/marketplace.json";
import zhMcp from "./locales/zh/mcp.json";
import zhNotifications from "./locales/zh/notifications.json";
import zhRunner from "./locales/zh/runner.json";
import zhSettings from "./locales/zh/settings.json";
import zhSkillMarketplace from "./locales/zh/skillMarketplace.json";
import zhSubscription from "./locales/zh/subscription.json";
import zhTerminal from "./locales/zh/terminal.json";

export const SUPPORTED_LANGUAGES = ["en", "zh", "ja"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

let initialized = false;

export function initI18n() {
  if (initialized || i18n.isInitialized) return i18n;
  initialized = true;

  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      debug: import.meta.env.DEV,
      fallbackLng: "en",
      supportedLngs: [...SUPPORTED_LANGUAGES],
      nonExplicitSupportedLngs: true,
      load: "languageOnly",
      resources: {
        en: {
          translation: {
            app: enApp,
            capsule: enCapsule,
            common: enCommon,
            settings: enSettings,
            marketplace: enMarketplace,
            skillMarketplace: enSkillMarketplace,
            knowledge: enKnowledge,
            mcp: enMcp,
            agents: enAgents,
            landing: enLanding,
            notifications: enNotifications,
            runner: enRunner,
            subscription: enSubscription,
            terminal: enTerminal,
          },
        },
        zh: {
          translation: {
            app: zhApp,
            capsule: zhCapsule,
            common: zhCommon,
            settings: zhSettings,
            marketplace: zhMarketplace,
            skillMarketplace: zhSkillMarketplace,
            knowledge: zhKnowledge,
            mcp: zhMcp,
            agents: zhAgents,
            landing: zhLanding,
            notifications: zhNotifications,
            runner: zhRunner,
            subscription: zhSubscription,
            terminal: zhTerminal,
          },
        },
        ja: {
          translation: {
            app: jaApp,
            capsule: jaCapsule,
            common: jaCommon,
            settings: jaSettings,
            marketplace: jaMarketplace,
            skillMarketplace: jaSkillMarketplace,
            knowledge: jaKnowledge,
            mcp: jaMcp,
            agents: jaAgents,
            landing: jaLanding,
            notifications: jaNotifications,
            runner: jaRunner,
            subscription: jaSubscription,
            terminal: jaTerminal,
          },
        },
      },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        caches: ["localStorage"],
      },
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });

  return i18n;
}
