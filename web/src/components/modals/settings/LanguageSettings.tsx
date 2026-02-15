import { CheckIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export function LanguageSettings() {
  const { i18n, t } = useTranslation();
  const getCurrentLang = () => {
    const lang = i18n.resolvedLanguage;
    if (lang?.startsWith("zh")) return "zh";
    if (lang?.startsWith("ja")) return "ja";
    return "en";
  };
  const currentLang = getCurrentLang();

  const languages = [
    {
      code: "en",
      nativeName: "English",
      description: t("settings.language.en.description"),
    },
    {
      code: "zh",
      nativeName: "简体中文",
      description: t("settings.language.zh.description"),
    },
    {
      code: "ja",
      nativeName: "日本語",
      description: t("settings.language.ja.description"),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-2 pt-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("settings.language.title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {t("settings.language.subtitle")}
        </p>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-6 pt-4">
        <div className="overflow-hidden rounded-xl bg-neutral-100/80 dark:bg-neutral-800/50">
          {languages.map((lang, index) => {
            const isActive = currentLang === lang.code;
            return (
              <motion.button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                className={`flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors ${
                  index > 0
                    ? "border-t border-neutral-200/60 dark:border-neutral-700/60"
                    : ""
                } ${isActive ? "bg-black/[0.04] dark:bg-white/[0.06]" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"}`}
                whileTap={{ scale: 0.99 }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-neutral-900 dark:text-white">
                    {lang.nativeName}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {lang.description}
                  </span>
                </div>

                <div className="flex items-center pl-4">
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 30,
                        }}
                      >
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-white">
                          <CheckIcon className="h-3 w-3" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
