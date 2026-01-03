import { useXyzen } from "@/store";
import type { UiSettingType } from "@/store/types";
import {
  GlobeAltIcon,
  PaintBrushIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

export function UiSettings({ onSelect }: { onSelect?: () => void }) {
  const { t } = useTranslation();
  const { activeUiSetting, setActiveUiSetting } = useXyzen();

  const uiOptions = [
    {
      id: "theme" as UiSettingType,
      label: t("settings.ui.options.theme.label"),
      description: t("settings.ui.options.theme.description"),
      icon: PaintBrushIcon,
    },
    {
      id: "style" as UiSettingType,
      label: t("settings.ui.options.style.label"),
      description: t("settings.ui.options.style.description"),
      icon: ViewColumnsIcon,
    },
    {
      id: "language" as UiSettingType,
      label: t("settings.ui.options.language.label"),
      description: t("settings.ui.options.language.description"),
      icon: GlobeAltIcon,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          {t("settings.ui.title")}
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {t("settings.ui.subtitle")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {uiOptions.map((option) => {
          const Icon = option.icon;
          const isActive = activeUiSetting === option.id;

          return (
            <button
              key={option.id}
              onClick={() => {
                setActiveUiSetting(option.id);
                onSelect?.();
              }}
              className={`mb-2 w-full rounded-sm border p-3 text-left transition-all ${
                isActive
                  ? "border-indigo-500 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/30"
                  : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`rounded-sm p-2 ${
                    isActive
                      ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div
                    className={`text-sm font-medium ${
                      isActive
                        ? "text-indigo-900 dark:text-indigo-300"
                        : "text-neutral-900 dark:text-white"
                    }`}
                  >
                    {option.label}
                  </div>
                  <div className="mt-0.5 truncate line-clamp-1 w-36 max-w-full text-xs text-neutral-500 dark:text-neutral-400">
                    {option.description}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
