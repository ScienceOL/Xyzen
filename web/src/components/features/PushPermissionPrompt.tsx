import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { isPushSupported } from "@/core/notification/pushManager";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/**
 * Hook that shows a sonner toast prompting the user to enable push notifications.
 *
 * - Fires 5 s after login if push permission is "default"
 * - Respects localStorage dismissal key
 * - Uses sonner toast with action button
 */
export function usePushPermissionPrompt() {
  const { t } = useTranslation();
  const { notificationEnabled, pushPermission, enablePush } =
    useNotifications();
  const auth = useAuth();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!auth.isAuthenticated) return;
    if (!notificationEnabled) return;
    if (!isPushSupported()) return;
    if (pushPermission !== "default") return;
    if (localStorage.getItem("xyzen-push-prompt-dismissed")) return;

    const timer = setTimeout(() => {
      firedRef.current = true;
      toast(t("notifications.push.promptTitle", "Enable Notifications"), {
        description: t(
          "notifications.push.promptDescription",
          "Get notified when agents finish responding.",
        ),
        duration: Infinity,
        action: {
          label: t("notifications.push.enable", "Enable"),
          onClick: () => {
            void enablePush();
          },
        },
        onDismiss: () => {
          localStorage.setItem("xyzen-push-prompt-dismissed", "true");
        },
      });
    }, 5000);
    return () => clearTimeout(timer);
  }, [
    auth.isAuthenticated,
    notificationEnabled,
    pushPermission,
    enablePush,
    t,
  ]);
}
