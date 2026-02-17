import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { isPushSupported } from "@/core/notification/pushManager";
import { BellIcon, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Floating banner that prompts the user to enable push notifications.
 *
 * Follows the PwaInstallPrompt pattern:
 * - Appears 5 s after login if push permission is "default"
 * - Respects localStorage dismissal key
 * - Animated with Framer Motion
 */
export function PushPermissionPrompt() {
  const { t } = useTranslation();
  const { notificationEnabled, pushPermission, enablePush } =
    useNotifications();
  const auth = useAuth();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    if (!notificationEnabled) return;
    if (!isPushSupported()) return;
    if (pushPermission !== "default") return;
    if (localStorage.getItem("xyzen-push-prompt-dismissed")) return;

    const timer = setTimeout(() => setIsVisible(true), 5000);
    return () => clearTimeout(timer);
  }, [auth.isAuthenticated, notificationEnabled, pushPermission]);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem("xyzen-push-prompt-dismissed", "true");
  };

  const handleEnable = async () => {
    await enablePush();
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -20, x: "-50%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed top-4 left-1/2 z-50 flex w-[90%] max-w-md items-center gap-4 rounded-sm border border-neutral-200 bg-white/80 p-4 shadow-lg backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BellIcon className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {t("notifications.push.promptTitle", "Enable Notifications")}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t(
                "notifications.push.promptDescription",
                "Get notified when agents finish responding.",
              )}
            </p>
          </div>

          <Button
            variant="default"
            size="sm"
            className="shrink-0"
            onClick={handleEnable}
          >
            {t("notifications.push.enable", "Enable")}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
