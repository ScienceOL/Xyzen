import { useXyzen } from "@/store";
import type { InputPosition, LayoutStyle } from "@/store/slices/uiSlice/types";

import { Field, Label, Radio, RadioGroup } from "@headlessui/react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

export function StyleSettings() {
  const { t } = useTranslation();
  const { layoutStyle, setLayoutStyle, inputPosition, setInputPosition } =
    useXyzen();

  const styles: Array<{
    value: LayoutStyle;
    label: string;
    description: string;
    features: string[];
    preview: string;
  }> = [
    {
      value: "sidebar",
      label: t("settings.style.layout.sidebar.label"),
      description: t("settings.style.layout.sidebar.description"),
      features: [
        t("settings.style.layout.sidebar.features.resizable"),
        t("settings.style.layout.sidebar.features.floatingButton"),
        t("settings.style.layout.sidebar.features.overlay"),
      ],
      preview: "M21 3L21 21L10 21L10 3L21 3Z",
    },
    {
      value: "fullscreen",
      label: t("settings.style.layout.fullscreen.label"),
      description: t("settings.style.layout.fullscreen.description"),
      features: [
        t("settings.style.layout.fullscreen.features.agentsLeft"),
        t("settings.style.layout.fullscreen.features.chatCenter"),
        t("settings.style.layout.fullscreen.features.topicsRight"),
        t("settings.style.layout.fullscreen.features.fullWidth"),
      ],
      preview:
        "M2 3L2 21L8 21L8 3L2 3ZM10 3L10 21L16 21L16 3L10 3ZM18 3L18 21L22 21L22 3L18 3Z",
    },
  ];

  const inputPositions: Array<{
    value: InputPosition;
    label: string;
    description: string;
    colSpan?: string;
  }> = [
    {
      value: "top-left",
      label: t("settings.style.inputPositions.topLeft.label"),
      description: t("settings.style.inputPositions.topLeft.description"),
    },
    {
      value: "top",
      label: t("settings.style.inputPositions.top.label"),
      description: t("settings.style.inputPositions.top.description"),
    },
    {
      value: "top-right",
      label: t("settings.style.inputPositions.topRight.label"),
      description: t("settings.style.inputPositions.topRight.description"),
    },
    {
      value: "center",
      label: t("settings.style.inputPositions.center.label"),
      description: t("settings.style.inputPositions.center.description"),
      colSpan: "md:col-span-3",
    },
    {
      value: "bottom-left",
      label: t("settings.style.inputPositions.bottomLeft.label"),
      description: t("settings.style.inputPositions.bottomLeft.description"),
    },
    {
      value: "bottom",
      label: t("settings.style.inputPositions.bottom.label"),
      description: t("settings.style.inputPositions.bottom.description"),
    },
    {
      value: "bottom-right",
      label: t("settings.style.inputPositions.bottomRight.label"),
      description: t("settings.style.inputPositions.bottomRight.description"),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("settings.style.title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {t("settings.style.subtitle")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-8 p-6">
        {/* Layout Style Section */}
        <section>
          <h3 className="mb-4 text-sm font-medium text-neutral-900 dark:text-white">
            {t("settings.style.sections.layout")}
          </h3>
          <RadioGroup value={layoutStyle} onChange={setLayoutStyle}>
            <div className="space-y-4">
              {styles.map((styleOption) => (
                <Field key={styleOption.value}>
                  <Radio
                    value={styleOption.value}
                    className={({ checked }) =>
                      `relative flex cursor-pointer rounded-sm border p-5 transition-all ${
                        checked
                          ? "border-indigo-500 bg-indigo-50 shadow-sm dark:border-indigo-600 dark:bg-indigo-950/30"
                          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
                      }`
                    }
                  >
                    {({ checked }) => (
                      <div className="flex w-full gap-4">
                        {/* Preview Icon */}
                        <div
                          className={`flex h-16 w-24 shrink-0 items-center justify-center rounded-sm border-2 ${
                            checked
                              ? "border-indigo-300 bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/50"
                              : "border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
                          }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className={`h-12 w-12 ${
                              checked
                                ? "text-indigo-600 dark:text-indigo-400"
                                : "text-neutral-400 dark:text-neutral-600"
                            }`}
                          >
                            <path d={styleOption.preview} fill="currentColor" />
                          </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <Label
                                className={`text-base font-semibold ${
                                  checked
                                    ? "text-indigo-900 dark:text-indigo-300"
                                    : "text-neutral-900 dark:text-white"
                                }`}
                              >
                                {styleOption.label}
                              </Label>
                              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                                {styleOption.description}
                              </p>
                            </div>
                            {checked && (
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white dark:bg-indigo-500">
                                <CheckIcon className="h-4 w-4" />
                              </div>
                            )}
                          </div>

                          {/* Features */}
                          <ul className="mt-3 space-y-1">
                            {styleOption.features.map((feature, idx) => (
                              <li
                                key={idx}
                                className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400"
                              >
                                <div
                                  className={`h-1 w-1 rounded-full ${
                                    checked
                                      ? "bg-indigo-600 dark:bg-indigo-400"
                                      : "bg-neutral-400 dark:bg-neutral-600"
                                  }`}
                                />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </Radio>
                </Field>
              ))}
            </div>
          </RadioGroup>
        </section>

        {/* Input Position Section */}
        <section>
          <h3 className="mb-4 text-sm font-medium text-neutral-900 dark:text-white">
            {t("settings.style.sections.inputPosition")}
          </h3>
          <RadioGroup value={inputPosition} onChange={setInputPosition}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {inputPositions.map((pos) => (
                <Field key={pos.value} className={pos.colSpan}>
                  <Radio
                    value={pos.value}
                    className={({ checked }) =>
                      `relative flex cursor-pointer flex-col rounded-sm border p-4 transition-all h-full ${
                        checked
                          ? "border-indigo-500 bg-indigo-50 shadow-sm dark:border-indigo-600 dark:bg-indigo-950/30"
                          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
                      }`
                    }
                  >
                    {({ checked }) => (
                      <>
                        <div className="flex items-center justify-between w-full mb-2">
                          <Label
                            className={`font-semibold ${
                              checked
                                ? "text-indigo-900 dark:text-indigo-300"
                                : "text-neutral-900 dark:text-white"
                            }`}
                          >
                            {pos.label}
                          </Label>
                          {checked && (
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white dark:bg-indigo-500">
                              <CheckIcon className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                          {pos.description}
                        </p>
                      </>
                    )}
                  </Radio>
                </Field>
              ))}
            </div>
          </RadioGroup>
        </section>

        <div className="rounded-sm border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <h3 className="text-sm font-medium text-amber-900 dark:text-amber-300">
            {t("settings.style.tip.title")}
          </h3>
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-400">
            {t("settings.style.tip.body")}
          </p>
        </div>
      </div>
    </div>
  );
}
