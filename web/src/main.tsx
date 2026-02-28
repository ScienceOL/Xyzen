import { Xyzen } from "@/app/App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { initI18n } from "@/i18n/i18n";
import { initializeRenderers } from "@/components/agents/renderers";

// Initialize i18n translations
initI18n();

// Initialize component renderers for agent execution UI
initializeRenderers();

// iOS PWA: fix viewport height after returning from external Safari page.
// When the PWA navigates to an external URL and the user swipes back,
// iOS may miscalculate the viewport, leaving a black gap at the bottom.
if (
  "standalone" in navigator &&
  (navigator as { standalone?: boolean }).standalone
) {
  const recalcViewport = () => {
    window.scrollTo(0, 0);
    document.documentElement.style.height = "100.1%";
    requestAnimationFrame(() => {
      document.documentElement.style.height = "";
    });
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      // Multiple timeouts to cover the iOS layout settle window
      setTimeout(recalcViewport, 50);
      setTimeout(recalcViewport, 300);
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Xyzen />
  </StrictMode>,
);
