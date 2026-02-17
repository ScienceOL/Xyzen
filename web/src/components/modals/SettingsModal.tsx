import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { useXyzen } from "@/store";
import { useShallow } from "zustand/react/shallow";
import {
  AdjustmentsHorizontalIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  GiftIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  ServerStackIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AboutSettings,
  AccountSettings,
  LanguageSettings,
  RedemptionSettings,
  RegionSettings,
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
  } = useXyzen(
    useShallow((s) => ({
      isSettingsModalOpen: s.isSettingsModalOpen,
      closeSettingsModal: s.closeSettingsModal,
      activeSettingsCategory: s.activeSettingsCategory,
      setActiveSettingsCategory: s.setActiveSettingsCategory,
      activeUiSetting: s.activeUiSetting,
    })),
  );

  // Mobile navigation state: 'categories' | 'content'
  const [mobileView, setMobileView] = useState<"categories" | "content">(
    "categories",
  );
  const [showUiDetail, setShowUiDetail] = useState(false);

  // When the modal opens with a non-default category, jump straight to content
  const prevOpen = useRef(isSettingsModalOpen);
  useEffect(() => {
    if (isSettingsModalOpen && !prevOpen.current) {
      // Modal just opened
      if (activeSettingsCategory !== "account") {
        setMobileView("content");
      } else {
        setMobileView("categories");
      }
    } else if (!isSettingsModalOpen && prevOpen.current) {
      // Modal just closed — reset
      setMobileView("categories");
    }
    prevOpen.current = isSettingsModalOpen;
  }, [isSettingsModalOpen, activeSettingsCategory]);

  const categories = [
    {
      id: "account",
      label: t("settings.categories.account"),
      icon: UserCircleIcon,
    },
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
      id: "region",
      label: t("settings.categories.region"),
      icon: GlobeAltIcon,
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
    <SheetModal
      isOpen={isSettingsModalOpen}
      onClose={closeSettingsModal}
      size="xl"
    >
      <div className="flex h-full flex-col overflow-hidden md:flex-row">
        {/* Sidebar (Categories) - Desktop: frosted sidebar; Mobile: full-screen list */}
        <AnimatePresence mode="wait">
          <motion.div
            className={`flex w-full flex-col md:w-56 md:border-r md:border-neutral-200/60 md:bg-neutral-50/60 md:backdrop-blur-xl md:dark:border-neutral-800/60 md:dark:bg-neutral-900/60 ${
              mobileView === "content" ? "hidden md:flex" : "flex"
            }`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Mobile title */}
            <div className="px-5 pb-1 pt-2 md:hidden">
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
                {t("settings.modal.title")}
              </h2>
            </div>

            <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-2 md:px-2.5 md:py-3">
              {/* Mobile: iOS-style grouped list */}
              <div className="flex flex-col gap-0.5 md:gap-0.5">
                {categories.map((category) => {
                  const Icon = category.icon;
                  const isActive = activeSettingsCategory === category.id;
                  return (
                    <button
                      key={category.id}
                      onClick={() => handleCategoryClick(category.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-colors ${
                        isActive
                          ? "bg-white/80 text-neutral-900 shadow-sm shadow-black/5 dark:bg-white/10 dark:text-white"
                          : "text-neutral-600 hover:bg-black/[0.04] dark:text-neutral-400 dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                          isActive
                            ? "bg-indigo-500 text-white"
                            : "bg-neutral-200/70 text-neutral-500 dark:bg-neutral-700/70 dark:text-neutral-400"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="flex-1 text-left">{category.label}</span>
                      <ChevronRightIcon className="h-4 w-4 text-neutral-300 md:hidden dark:text-neutral-600" />
                    </button>
                  );
                })}
              </div>
            </nav>
          </motion.div>
        </AnimatePresence>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSettingsCategory}
            className={`flex flex-1 flex-col overflow-hidden ${
              mobileView === "categories" ? "hidden md:flex" : "flex"
            }`}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            {/* Mobile Header - iOS-style back navigation */}
            <div className="flex items-center gap-2 px-2 py-2.5 md:hidden">
              <button
                onClick={handleBackToCategories}
                className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-indigo-500 transition-colors active:bg-indigo-50 dark:text-indigo-400 dark:active:bg-indigo-950/30"
              >
                <ArrowLeftIcon className="h-5 w-5" />
                <span className="text-[15px]">{t("settings.modal.back")}</span>
              </button>
              <span className="flex-1 text-center text-[15px] font-semibold text-neutral-900 dark:text-white">
                {categories.find((c) => c.id === activeSettingsCategory)?.label}
              </span>
              {/* Spacer to keep title centered */}
              <div className="w-16" />
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto">
              {activeSettingsCategory === "account" && <AccountSettings />}

              {activeSettingsCategory === "mcp" && <McpSettings />}

              {activeSettingsCategory === "region" && <RegionSettings />}

              {activeSettingsCategory === "ui" && (
                <div className="flex h-full flex-col md:flex-row">
                  <div
                    className={`w-full border-b border-neutral-200/60 md:w-56 md:border-b-0 md:border-r md:border-neutral-200/60 dark:border-neutral-800/60 ${
                      showUiDetail ? "hidden md:block" : "block"
                    }`}
                  >
                    <UiSettings onSelect={() => setShowUiDetail(true)} />
                  </div>
                  <div
                    className={`custom-scrollbar flex-1 overflow-y-auto p-4 md:p-6 ${
                      showUiDetail ? "block" : "hidden md:block"
                    }`}
                  >
                    {/* Mobile Back Button */}
                    <div className="mb-4 flex items-center md:hidden">
                      <button
                        onClick={() => setShowUiDetail(false)}
                        className="mr-2 text-indigo-500 dark:text-indigo-400"
                      >
                        <ArrowLeftIcon className="h-5 w-5" />
                      </button>
                      <span className="font-semibold text-neutral-900 dark:text-white">
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
    </SheetModal>
  );
}
