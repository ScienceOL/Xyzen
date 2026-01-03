import { CheckIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export function LanguageSettings() {
  const { i18n, t } = useTranslation();
  const currentLang = i18n.resolvedLanguage?.startsWith("zh") ? "zh" : "en";

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
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("settings.language.title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {t("settings.language.subtitle")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4">
          {languages.map((lang) => {
            const isActive = currentLang === lang.code;
            return (
              <motion.button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                className={`group relative flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                  isActive
                    ? "border-indigo-600 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-950/20"
                    : "border-neutral-200 bg-white hover:border-indigo-200 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
                }`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <div className="flex flex-col gap-1">
                  <span
                    className={`text-base font-medium ${
                      isActive
                        ? "text-indigo-900 dark:text-indigo-100"
                        : "text-neutral-900 dark:text-white"
                    }`}
                  >
                    {lang.nativeName}
                  </span>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">
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
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white dark:bg-indigo-500">
                          <CheckIcon className="h-4 w-4" />
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
