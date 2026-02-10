import { useTranslation } from "react-i18next";

export function MemoryTab() {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-sm text-neutral-400 dark:text-neutral-500">
        {t("capsule.tabs.comingSoon")}
      </p>
    </div>
  );
}
