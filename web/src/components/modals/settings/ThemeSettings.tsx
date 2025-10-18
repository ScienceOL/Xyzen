import { useXyzen } from "@/store";
import useTheme from "@/hooks/useTheme";
import { Field, Label, Radio, RadioGroup } from "@headlessui/react";
import {
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import type { Theme } from "@/store/types";

export function ThemeSettings() {
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
      label: "Light",
      description: "Bright and clear interface",
      icon: SunIcon,
    },
    {
      value: "dark",
      label: "Dark",
      description: "Easy on the eyes in low light",
      icon: MoonIcon,
    },
    {
      value: "system",
      label: "System",
      description: "Automatically match system preference",
      icon: ComputerDesktopIcon,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Theme Settings
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Choose how Xyzen looks to you
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <RadioGroup value={currentTheme} onChange={setTheme}>
          <div className="space-y-3">
            {themes.map((themeOption) => {
              const Icon = themeOption.icon;
              return (
                <Field key={themeOption.value}>
                  <Radio
                    value={themeOption.value}
                    className={({ checked }) =>
                      `relative flex cursor-pointer rounded-lg border p-4 transition-all ${
                        checked
                          ? "border-indigo-500 bg-indigo-50 shadow-sm dark:border-indigo-600 dark:bg-indigo-950/30"
                          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
                      }`
                    }
                  >
                    {({ checked }) => (
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`rounded-lg p-2 ${
                              checked
                                ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400"
                                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                            }`}
                          >
                            <Icon className="h-6 w-6" />
                          </div>
                          <div>
                            <Label
                              className={`text-sm font-medium ${
                                checked
                                  ? "text-indigo-900 dark:text-indigo-300"
                                  : "text-neutral-900 dark:text-white"
                              }`}
                            >
                              {themeOption.label}
                            </Label>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                              {themeOption.description}
                            </p>
                          </div>
                        </div>
                        {checked && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white dark:bg-indigo-500">
                            <CheckIcon className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    )}
                  </Radio>
                </Field>
              );
            })}
          </div>
        </RadioGroup>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
            About Theme
          </h3>
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
            The theme setting controls the color scheme of the entire
            application. System theme will automatically switch between light
            and dark based on your operating system preferences.
          </p>
        </div>
      </div>
    </div>
  );
}
