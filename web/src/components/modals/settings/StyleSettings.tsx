import { useXyzen } from "@/store";
import { Field, Label, Radio, RadioGroup } from "@headlessui/react";
import { CheckIcon } from "@heroicons/react/24/outline";
import type { LayoutStyle } from "@/store/types";

export function StyleSettings() {
  const { layoutStyle, setLayoutStyle } = useXyzen();

  const styles: Array<{
    value: LayoutStyle;
    label: string;
    description: string;
    features: string[];
    preview: string;
  }> = [
    {
      value: "sidebar",
      label: "Sidebar",
      description: "Classic right-side panel layout",
      features: [
        "Resizable panel (280-600px)",
        "Floating button when closed",
        "Overlays on top of content",
      ],
      preview: "M21 3L21 21L10 21L10 3L21 3Z",
    },
    {
      value: "fullscreen",
      label: "Fullscreen",
      description: "Immersive 3-column workspace",
      features: [
        "Agent list on the left",
        "Chat in the center",
        "Topics on the right",
        "Full width layout",
      ],
      preview:
        "M2 3L2 21L8 21L8 3L2 3ZM10 3L10 21L16 21L16 3L10 3ZM18 3L18 21L22 21L22 3L18 3Z",
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Layout Style
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Choose how Xyzen is organized on your screen
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <RadioGroup value={layoutStyle} onChange={setLayoutStyle}>
          <div className="space-y-4">
            {styles.map((styleOption) => (
              <Field key={styleOption.value}>
                <Radio
                  value={styleOption.value}
                  className={({ checked }) =>
                    `relative flex cursor-pointer rounded-lg border p-5 transition-all ${
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
                        className={`flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-lg border-2 ${
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
                            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white dark:bg-indigo-500">
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

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <h3 className="text-sm font-medium text-amber-900 dark:text-amber-300">
            💡 Pro Tip
          </h3>
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-400">
            Fullscreen layout is perfect for larger displays where you want to
            see everything at once. Sidebar layout is ideal for focused work and
            smaller screens.
          </p>
        </div>
      </div>
    </div>
  );
}
