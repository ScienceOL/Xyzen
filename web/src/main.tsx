import { Xyzen } from "@/app/App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { initI18n } from "@/i18n/i18n";
import { initializeRenderers } from "@/components/agents/renderers";

// Initialize i18n translations
initI18n();

// Initialize component renderers for agent execution UI
initializeRenderers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Xyzen />
  </StrictMode>,
);
