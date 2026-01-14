import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enAgents from "./locales/en/agents.json";
import enApp from "./locales/en/app.json";
import enCommon from "./locales/en/common.json";
import enKnowledge from "./locales/en/knowledge.json";
import enMarketplace from "./locales/en/marketplace.json";
import enMcp from "./locales/en/mcp.json";
import enSettings from "./locales/en/settings.json";

import jaAgents from "./locales/ja/agents.json";
import jaApp from "./locales/ja/app.json";
import jaCommon from "./locales/ja/common.json";
import jaKnowledge from "./locales/ja/knowledge.json";
import jaMarketplace from "./locales/ja/marketplace.json";
import jaMcp from "./locales/ja/mcp.json";
import jaSettings from "./locales/ja/settings.json";

import zhAgents from "./locales/zh/agents.json";
import zhApp from "./locales/zh/app.json";
import zhCommon from "./locales/zh/common.json";
import zhKnowledge from "./locales/zh/knowledge.json";
import zhMarketplace from "./locales/zh/marketplace.json";
import zhMcp from "./locales/zh/mcp.json";
import zhSettings from "./locales/zh/settings.json";

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
            common: enCommon,
            settings: enSettings,
            marketplace: enMarketplace,
            knowledge: enKnowledge,
            mcp: enMcp,
            agents: enAgents,
          },
        },
        zh: {
          translation: {
            app: zhApp,
            common: zhCommon,
            settings: zhSettings,
            marketplace: zhMarketplace,
            knowledge: zhKnowledge,
            mcp: zhMcp,
            agents: zhAgents,
          },
        },
        ja: {
          translation: {
            app: jaApp,
            common: jaCommon,
            settings: jaSettings,
            marketplace: jaMarketplace,
            knowledge: jaKnowledge,
            mcp: jaMcp,
            agents: jaAgents,
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
