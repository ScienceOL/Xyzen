import { Switch } from "@/components/base/Switch";
import { isPushSupported } from "@/core/notification/pushManager";
import { useNotifications } from "@/hooks/useNotifications";
import { BellIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function PreferencesSettings() {
  const { t } = useTranslation();
  const { pushPermission, pushSubscribed, enablePush, disablePush } =
    useNotifications();

  const supported = isPushSupported();
  const denied = pushPermission === "denied";
  const [loading, setLoading] = useState(false);

  const handlePushToggle = async (checked: boolean) => {
    setLoading(true);
    try {
      if (checked) {
        const ok = await enablePush();
        if (ok) {
          toast.success(t("settings.preferences.push.enabled"));
        } else {
          toast.error(t("settings.preferences.push.enableFailed"));
        }
      } else {
        await disablePush();
        toast.success(t("settings.preferences.push.disabled"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-6 pb-2 pt-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("settings.preferences.title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          {t("settings.preferences.subtitle")}
        </p>
      </div>

      {/* Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto p-6 pt-4">
        <div className="overflow-hidden rounded-lg bg-neutral-100/80 dark:bg-white/[0.04]">
          {/* Push Notifications */}
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400">
              <BellIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                {t("settings.preferences.push.label")}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                {t("settings.preferences.push.description")}
              </p>
              {!supported && (
                <p className="mt-1 text-xs text-amber-500">
                  {t("settings.preferences.push.unsupportedHint")}
                </p>
              )}
              {supported && denied && (
                <p className="mt-1 text-xs text-amber-500">
                  {t("settings.preferences.push.deniedHint")}
                </p>
              )}
            </div>
            <Switch
              checked={pushSubscribed}
              onChange={handlePushToggle}
              disabled={!supported || denied || loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
