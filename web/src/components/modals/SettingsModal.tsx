import { Modal } from "@/components/animate-ui/components/animate/modal";
import { useXyzen } from "@/store";
import {
  AdjustmentsHorizontalIcon,
  ArrowLeftIcon,
  GiftIcon,
  InformationCircleIcon,
  ServerStackIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AboutSettings,
  LanguageSettings,
  RedemptionSettings,
  StyleSettings,
  ThemeSettings,
  UiSettings,
} from "./settings";
import { McpSettings } from "./settings/McpSettings";

export function SettingsModal() {
  const { t } = useTranslation();
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    activeSettingsCategory,
    setActiveSettingsCategory,
    activeUiSetting,
  } = useXyzen();

  // Mobile navigation state: 'categories' | 'content'
  const [mobileView, setMobileView] = useState<"categories" | "content">(
    "categories",
  );
  const [showUiDetail, setShowUiDetail] = useState(false);

  const categories = [
    {
      id: "ui",
      label: t("settings.categories.ui"),
      icon: AdjustmentsHorizontalIcon,
    },
    {
      id: "mcp",
      label: t("settings.categories.mcp"),
      icon: ServerStackIcon,
    },
    {
      id: "redemption",
      label: t("settings.categories.redemption"),
      icon: GiftIcon,
    },
    {
      id: "about",
      label: t("settings.categories.about"),
      icon: InformationCircleIcon,
    },
  ];

  const handleCategoryClick = (categoryId: string) => {
    setActiveSettingsCategory(categoryId);
    setMobileView("content");
  };

  const handleBackToCategories = () => {
    setMobileView("categories");
  };

  return (
    <Modal
      isOpen={isSettingsModalOpen}
      onClose={closeSettingsModal}
      title={t("settings.modal.title")}
      maxWidth="max-w-[90vw]"
      maxHeight="h-[85vh]"
      minHeight="min-h-[600px]"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800 md:flex-row">
        {/* Sidebar (Categories) */}
        <AnimatePresence mode="wait">
          <motion.div
            className={`flex w-full flex-col border-r border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-900/80 md:w-64 ${
              mobileView === "content" ? "hidden md:flex" : "flex"
            }`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <nav className="flex-1 space-y-1 p-4">
              {categories.map((category) => {
                const Icon = category.icon;
                const isActive = activeSettingsCategory === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryClick(category.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? "bg-white text-indigo-600 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-indigo-400 dark:ring-neutral-700"
                        : "text-neutral-600 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-800/50"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {category.label}
                  </button>
                );
              })}
            </nav>
          </motion.div>
        </AnimatePresence>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSettingsCategory}
            className={`flex flex-1 flex-col overflow-hidden bg-white dark:bg-neutral-950 ${
              mobileView === "categories" ? "hidden md:flex" : "flex"
            }`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Mobile Header for Content View */}
            <div className="flex items-center border-b border-neutral-200 px-4 py-3 md:hidden dark:border-neutral-800">
              <button
                onClick={handleBackToCategories}
                className="mr-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              >
                ← {t("settings.modal.back")}
              </button>
              <span className="font-medium text-neutral-900 dark:text-white">
                {categories.find((c) => c.id === activeSettingsCategory)?.label}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-0 md:p-0">
              {activeSettingsCategory === "mcp" && <McpSettings />}

              {activeSettingsCategory === "ui" && (
                <div className="flex h-full flex-col md:flex-row">
                  <div
                    className={`w-full border-b border-neutral-200 md:w-64 md:border-b-0 md:border-r dark:border-neutral-800 ${
                      showUiDetail ? "hidden md:block" : "block"
                    }`}
                  >
                    <UiSettings onSelect={() => setShowUiDetail(true)} />
                  </div>
                  <div
                    className={`flex-1 overflow-y-auto p-4 md:p-6 ${
                      showUiDetail ? "block" : "hidden md:block"
                    }`}
                  >
                    {/* Mobile Back Button */}
                    <div className="mb-4 flex items-center md:hidden">
                      <button
                        onClick={() => setShowUiDetail(false)}
                        className="mr-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                      >
                        <ArrowLeftIcon className="h-5 w-5" />
                      </button>
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {t("settings.categories.ui")}
                      </span>
                    </div>

                    {activeUiSetting === "theme" && <ThemeSettings />}
                    {activeUiSetting === "style" && <StyleSettings />}
                    {activeUiSetting === "language" && <LanguageSettings />}
                  </div>
                </div>
              )}

              {activeSettingsCategory === "redemption" && (
                <div className="h-full overflow-y-auto p-4 md:p-6">
                  <RedemptionSettings />
                </div>
              )}

              {activeSettingsCategory === "about" && (
                <div className="h-full overflow-y-auto p-4 md:p-6">
                  <AboutSettings />
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </Modal>
  );
}
