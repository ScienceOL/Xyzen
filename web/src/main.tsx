import { Xyzen } from "@/app/App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { initI18n } from "@/i18n/i18n";

initI18n();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Xyzen />
  </StrictMode>,
);
