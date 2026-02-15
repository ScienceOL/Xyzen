import useTheme from "@/hooks/useTheme";
import { useXyzen } from "@/store";
import type { Theme } from "@/store/types";
import { Field, Label, Radio, RadioGroup } from "@headlessui/react";
import {
  CheckIcon,
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

export function ThemeSettings() {
  const { t } = useTranslation();
  const { theme: currentTheme } = useXyzen();
  const { setTheme } = useTheme();

  const themes: Array<{
    value: Theme;
    label: string;
    description: string;
    icon: typeof SunIcon;
  }> = [
    {
      value: "light",
      label: t("settings.theme.options.light.label"),
      description: t("settings.theme.options.light.description"),
      icon: SunIcon,
    },
    {
      value: "dark",
      label: t("settings.theme.options.dark.label"),
      description: t("settings.theme.options.dark.description"),
      icon: MoonIcon,
    },
    {
      value: "system",
      label: t("settings.theme.options.system.label"),
      description: t("settings.theme.options.system.description"),
      icon: ComputerDesktopIcon,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-2 pt-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("settings.theme.title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {t("settings.theme.subtitle")}
        </p>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-6 pt-4">
        <RadioGroup value={currentTheme} onChange={setTheme}>
          <div className="overflow-hidden rounded-xl bg-neutral-100/80 dark:bg-neutral-800/50">
            {themes.map((themeOption, index) => {
              const Icon = themeOption.icon;
              return (
                <Field key={themeOption.value}>
                  <Radio
                    value={themeOption.value}
                    className={`relative flex cursor-pointer items-center px-4 py-3.5 transition-colors ${
                      index > 0
                        ? "border-t border-neutral-200/60 dark:border-neutral-700/60"
                        : ""
                    } data-[checked]:bg-black/[0.04] dark:data-[checked]:bg-white/[0.06]`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-200/80 text-neutral-600 dark:bg-neutral-700/80 dark:text-neutral-300">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-neutral-900 dark:text-white">
                            {themeOption.label}
                          </Label>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {themeOption.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-neutral-300 transition-colors data-[checked]:border-indigo-500 data-[checked]:bg-indigo-500 dark:border-neutral-600 dark:data-[checked]:border-indigo-500 dark:data-[checked]:bg-indigo-500">
                        {currentTheme === themeOption.value && (
                          <CheckIcon className="h-3 w-3 text-white" />
                        )}
                      </div>
                    </div>
                  </Radio>
                </Field>
              );
            })}
          </div>
        </RadioGroup>

        <div className="mt-6 rounded-xl bg-neutral-100/80 p-4 dark:bg-neutral-800/50">
          <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
            {t("settings.theme.about.title")}
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t("settings.theme.about.body")}
          </p>
        </div>
      </div>
    </div>
  );
}
