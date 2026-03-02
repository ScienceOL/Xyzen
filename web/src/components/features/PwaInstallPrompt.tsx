import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/**
 * Hook that shows a sonner toast prompting the user to install the PWA.
 *
 * - Fires 2 s after mount on desktop (≥1024px) non-standalone browsers
 * - Respects localStorage dismissal key
 */
export function usePwaInstallPrompt() {
  const { t } = useTranslation();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;

    const isStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;
    if (isStandalone) return;

    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!isDesktop) return;

    if (localStorage.getItem("xyzen-pwa-prompt-dismissed")) return;

    const timer = setTimeout(() => {
      firedRef.current = true;
      toast(t("app.pwa.installTitle", "Install App"), {
        description: t(
          "app.pwa.installDescription",
          "Click the install icon in your address bar for a better experience.",
        ),
        duration: 8000,
        onDismiss: () => {
          localStorage.setItem("xyzen-pwa-prompt-dismissed", "true");
        },
        onAutoClose: () => {
          localStorage.setItem("xyzen-pwa-prompt-dismissed", "true");
        },
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [t]);
}
