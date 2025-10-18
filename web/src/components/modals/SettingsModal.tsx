import { useXyzen } from "@/store";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import {
  ProviderConfigForm,
  ProviderList,
  UiSettings,
  ThemeSettings,
  StyleSettings,
} from "./settings";

export function SettingsModal() {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    activeSettingsCategory,
    setActiveSettingsCategory,
    activeUiSetting,
  } = useXyzen();

  const categories = [
    { id: "provider", label: "Provider" },
    { id: "ui", label: "UI" },
    // Future categories can be added here
    // { id: "account", label: "Account" },
  ];

  return (
    <AnimatePresence>
      {isSettingsModalOpen && (
        <Dialog
          static
          open={isSettingsModalOpen}
          onClose={closeSettingsModal}
          className="relative z-50"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Full screen container */}
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-7xl"
            >
              <DialogPanel className="flex h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-950">
                {/* Column 1: Category Sidebar */}
                <div className="w-48 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
                    <DialogTitle className="text-lg font-semibold text-neutral-900 dark:text-white">
                      设置
                    </DialogTitle>
                    <button
                      onClick={closeSettingsModal}
                      className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <nav className="p-2">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => setActiveSettingsCategory(category.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                          activeSettingsCategory === category.id
                            ? "bg-white text-indigo-600 shadow-sm dark:bg-neutral-800 dark:text-indigo-400"
                            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                        }`}
                      >
                        {category.label}
                      </button>
                    ))}
                  </nav>
                </div>

                {/* Column 2: Content Based on Category */}
                <div className="w-80 border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                  {activeSettingsCategory === "provider" && <ProviderList />}
                  {activeSettingsCategory === "ui" && <UiSettings />}
                </div>

                {/* Column 3: Detail View */}
                <div className="flex-1 bg-white dark:bg-neutral-950">
                  {activeSettingsCategory === "provider" && (
                    <ProviderConfigForm />
                  )}
                  {activeSettingsCategory === "ui" && (
                    <>
                      {activeUiSetting === "theme" && <ThemeSettings />}
                      {activeUiSetting === "style" && <StyleSettings />}
                    </>
                  )}
                </div>
              </DialogPanel>
            </motion.div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
