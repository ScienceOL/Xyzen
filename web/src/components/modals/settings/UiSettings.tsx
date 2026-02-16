import { useXyzen } from "@/store";
import type { UiSettingType } from "@/store/types";
import {
  ChevronRightIcon,
  GlobeAltIcon,
  PaintBrushIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

export function UiSettings({ onSelect }: { onSelect?: () => void }) {
  const { t } = useTranslation();
  const { activeUiSetting, setActiveUiSetting } = useXyzen(
    useShallow((s) => ({
      activeUiSetting: s.activeUiSetting,
      setActiveUiSetting: s.setActiveUiSetting,
    })),
  );

  const uiOptions = [
    {
      id: "theme" as UiSettingType,
      label: t("settings.ui.options.theme.label"),
      description: t("settings.ui.options.theme.description"),
      icon: PaintBrushIcon,
      color: "bg-orange-500",
    },
    {
      id: "style" as UiSettingType,
      label: t("settings.ui.options.style.label"),
      description: t("settings.ui.options.style.description"),
      icon: ViewColumnsIcon,
      color: "bg-blue-500",
    },
    {
      id: "language" as UiSettingType,
      label: t("settings.ui.options.language.label"),
      description: t("settings.ui.options.language.description"),
      icon: GlobeAltIcon,
      color: "bg-green-500",
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          {t("settings.ui.title")}
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {t("settings.ui.subtitle")}
        </p>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-3 py-2">
        <div className="overflow-hidden rounded-xl bg-neutral-100/80 dark:bg-neutral-800/50">
          {uiOptions.map((option, index) => {
            const Icon = option.icon;
            const isActive = activeUiSetting === option.id;

            return (
              <button
                key={option.id}
                onClick={() => {
                  setActiveUiSetting(option.id);
                  onSelect?.();
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? "bg-black/[0.06] dark:bg-white/[0.08]"
                    : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                } ${index > 0 ? "border-t border-neutral-200/60 dark:border-neutral-700/60" : ""}`}
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${option.color} text-white`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-neutral-900 dark:text-white">
                    {option.label}
                  </div>
                  <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {option.description}
                  </div>
                </div>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
