import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { useTranslation } from "react-i18next";

interface UpdateOverlayProps {
  /** The version being updated to */
  targetVersion: string;
}

/**
 * Fullscreen overlay shown during auto-update process.
 * Displays a spinner and "Updating to vX.X.X..." message.
 */
export function UpdateOverlay({ targetVersion }: UpdateOverlayProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-background">
      <LoadingSpinner size="lg" />
      <p className="text-sm font-medium text-muted-foreground">
        {t("app.update.updating", { version: targetVersion })}
      </p>
    </div>
  );
}
