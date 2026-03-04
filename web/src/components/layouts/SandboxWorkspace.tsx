import {
  sandboxService,
  type SandboxEntry,
  type SandboxIdeResponse,
} from "@/service/sandboxService";
import { ArrowPathIcon, ChevronLeftIcon } from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// ─── SandboxWorkspace ───────────────────────────────────────────────

/**
 * Extra ms after iframe `load` to let code-server read settings.json and
 * apply the colour theme.  Cross-origin iframes give us no internal hooks,
 * so this is an empirical delay — generous enough to avoid a white flash.
 */
const THEME_SETTLE_MS = 1500;

type IdeState =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

interface SandboxWorkspaceProps {
  sandbox: SandboxEntry;
  onBack: () => void;
}

export default function SandboxWorkspace({
  sandbox,
  onBack,
}: SandboxWorkspaceProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const [ideState, setIdeState] = useState<IdeState>({ kind: "loading" });
  const [iframeVisible, setIframeVisible] = useState(false);
  const mountedRef = useRef(true);

  const themeValue = resolvedTheme === "light" ? "light" : "dark";

  const startIde = useCallback(async () => {
    setIdeState({ kind: "loading" });
    setIframeVisible(false);
    try {
      const res: SandboxIdeResponse = await sandboxService.startIde(
        sandbox.session_id,
        themeValue,
      );
      if (!mountedRef.current) return;

      if (res.status === "ready" && res.url) {
        setIdeState({ kind: "ready", url: res.url });
      } else if (res.status === "starting") {
        setTimeout(() => {
          if (mountedRef.current) void startIde();
        }, 3000);
      } else {
        setIdeState({
          kind: "error",
          message: t("app.sandbox.ide.unavailable"),
        });
      }
    } catch {
      if (!mountedRef.current) return;
      setIdeState({ kind: "error", message: t("app.sandbox.ide.error") });
    }
  }, [sandbox.session_id, themeValue, t]);

  useEffect(() => {
    mountedRef.current = true;
    void startIde();
    return () => {
      mountedRef.current = false;
    };
  }, [startIde]);

  /** Called when the iframe fires its `load` event. */
  const handleIframeLoad = useCallback(() => {
    // Give code-server time to read settings.json and apply the theme
    setTimeout(() => {
      if (mountedRef.current) setIframeVisible(true);
    }, THEME_SETTLE_MS);
  }, []);

  const showSpinner =
    ideState.kind === "loading" ||
    (ideState.kind === "ready" && !iframeVisible);

  // Background colour that matches the VS Code theme so the iframe container
  // never flashes white, even before `onLoad` fires.
  const bgColor = themeValue === "dark" ? "#1e1e1e" : "#ffffff";

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: bgColor }}
    >
      {/* Floating back button */}
      <button
        onClick={onBack}
        className="absolute left-1.5 top-1 z-10 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white/50 transition-all hover:bg-white/10 hover:text-white/90"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        {sandbox.session_name || sandbox.session_id.slice(0, 8)}
      </button>

      {/* Loading spinner — shown while waiting for API and iframe theme settle */}
      {showSpinner && (
        <div
          className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3"
          style={{ backgroundColor: bgColor }}
        >
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-indigo-500" />
          <p className="text-[13px] text-neutral-500">
            {t("app.sandbox.ide.starting")}
          </p>
        </div>
      )}

      {/* iframe — rendered but invisible until theme has settled */}
      {ideState.kind === "ready" && (
        <iframe
          src={ideState.url}
          className="h-full w-full border-0 transition-opacity duration-300"
          style={{ opacity: iframeVisible ? 1 : 0, backgroundColor: bgColor }}
          allow="clipboard-read; clipboard-write"
          title="code-server"
          onLoad={handleIframeLoad}
        />
      )}

      {ideState.kind === "error" && (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
            {ideState.message}
          </p>
          <button
            onClick={() => void startIde()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-600"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            {t("app.sandbox.ide.retry")}
          </button>
        </div>
      )}
    </div>
  );
}
