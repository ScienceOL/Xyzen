import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function PwaInstallPrompt() {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const isStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;

    // Check if user has dismissed the prompt
    const hasDismissed = localStorage.getItem("xyzen-pwa-prompt-dismissed");

    // Check if it's a desktop device (simple check, can be improved)
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;

    if (!isStandalone && !hasDismissed && isDesktop) {
      // Show after a small delay to not overwhelm the user immediately
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem("xyzen-pwa-prompt-dismissed", "true");
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
            <Download className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {t("app.pwa.installTitle", "Install App")}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t(
                "app.pwa.installDescription",
                "Click the install icon in your address bar for a better experience.",
              )}
            </p>
          </div>

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
