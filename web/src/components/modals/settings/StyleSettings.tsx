import { Switch } from "@/components/base/Switch";
import { useXyzen } from "@/store";
import type { InputPosition, LayoutStyle } from "@/store/slices/uiSlice/types";
import { useShallow } from "zustand/react/shallow";

import { Field, Label, Radio, RadioGroup } from "@headlessui/react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

export function StyleSettings() {
  const { t } = useTranslation();
  const {
    layoutStyle,
    setLayoutStyle,
    inputPosition,
    setInputPosition,
    showOfficialRecommendations,
    setShowOfficialRecommendations,
  } = useXyzen(
    useShallow((s) => ({
      layoutStyle: s.layoutStyle,
      setLayoutStyle: s.setLayoutStyle,
      inputPosition: s.inputPosition,
      setInputPosition: s.setInputPosition,
      showOfficialRecommendations: s.showOfficialRecommendations,
      setShowOfficialRecommendations: s.setShowOfficialRecommendations,
    })),
  );

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
      <div className="px-6 pb-2 pt-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("settings.style.title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {t("settings.style.subtitle")}
        </p>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto space-y-6 p-6 pt-4">
        {/* Layout Style Section */}
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {t("settings.style.sections.layout")}
          </h3>
          <RadioGroup value={layoutStyle} onChange={setLayoutStyle}>
            <div className="overflow-hidden rounded-xl bg-neutral-100/80 dark:bg-neutral-800/50">
              {styles.map((styleOption, index) => (
                <Field key={styleOption.value}>
                  <Radio
                    value={styleOption.value}
                    className={`relative flex cursor-pointer gap-4 px-4 py-4 transition-colors ${
                      index > 0
                        ? "border-t border-neutral-200/60 dark:border-neutral-700/60"
                        : ""
                    } data-[checked]:bg-black/[0.04] dark:data-[checked]:bg-white/[0.06]`}
                  >
                    {({ checked }) => (
                      <div className="flex w-full gap-4">
                        {/* Preview Icon */}
                        <div
                          className={`flex h-14 w-20 shrink-0 items-center justify-center rounded-lg ${
                            checked
                              ? "bg-indigo-100 dark:bg-indigo-900/40"
                              : "bg-neutral-200/80 dark:bg-neutral-700/60"
                          }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className={`h-10 w-10 ${
                              checked
                                ? "text-indigo-500 dark:text-indigo-400"
                                : "text-neutral-400 dark:text-neutral-500"
                            }`}
                          >
                            <path d={styleOption.preview} fill="currentColor" />
                          </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <Label className="text-sm font-semibold text-neutral-900 dark:text-white">
                                {styleOption.label}
                              </Label>
                              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                                {styleOption.description}
                              </p>
                            </div>
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                checked
                                  ? "border-indigo-500 bg-indigo-500 dark:border-indigo-500 dark:bg-indigo-500"
                                  : "border-neutral-300 dark:border-neutral-600"
                              }`}
                            >
                              {checked && (
                                <CheckIcon className="h-3 w-3 text-white" />
                              )}
                            </div>
                          </div>

                          {/* Features */}
                          <ul className="mt-2 space-y-0.5">
                            {styleOption.features.map((feature, idx) => (
                              <li
                                key={idx}
                                className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"
                              >
                                <div
                                  className={`h-1 w-1 rounded-full ${
                                    checked
                                      ? "bg-indigo-500 dark:bg-indigo-400"
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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {t("settings.style.sections.inputPosition")}
          </h3>
          <RadioGroup value={inputPosition} onChange={setInputPosition}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {inputPositions.map((pos) => (
                <Field key={pos.value} className={pos.colSpan}>
                  <Radio
                    value={pos.value}
                    className={({ checked }) =>
                      `relative flex cursor-pointer flex-col rounded-xl p-3.5 transition-colors h-full ${
                        checked
                          ? "bg-indigo-50 dark:bg-indigo-950/30"
                          : "bg-neutral-100/80 hover:bg-neutral-100 dark:bg-neutral-800/50 dark:hover:bg-neutral-800/70"
                      }`
                    }
                  >
                    {({ checked }) => (
                      <>
                        <div className="flex items-center justify-between w-full mb-1.5">
                          <Label
                            className={`text-sm font-medium ${
                              checked
                                ? "text-indigo-900 dark:text-indigo-300"
                                : "text-neutral-900 dark:text-white"
                            }`}
                          >
                            {pos.label}
                          </Label>
                          {checked && (
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white">
                              <CheckIcon className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
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

        {/* Workspace Section */}
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {t("settings.style.sections.workspace")}
          </h3>
          <div className="flex items-center justify-between rounded-xl bg-neutral-100/80 p-4 dark:bg-neutral-800/50">
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">
                {t("settings.style.recommendations.label")}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {t("settings.style.recommendations.description")}
              </p>
            </div>
            <Switch
              checked={showOfficialRecommendations}
              onChange={setShowOfficialRecommendations}
            />
          </div>
        </section>

        <div className="rounded-xl bg-amber-50/80 p-4 dark:bg-amber-950/20">
          <h3 className="text-sm font-medium text-amber-900 dark:text-amber-300">
            {t("settings.style.tip.title")}
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            {t("settings.style.tip.body")}
          </p>
        </div>
      </div>
    </div>
  );
}
