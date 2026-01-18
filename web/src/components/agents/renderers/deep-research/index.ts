/**
 * Deep Research Renderers
 *
 * Specialized renderers for Deep Research agent components.
 */

import { registerRenderer } from "../registry";
import ClarificationRenderer from "./ClarificationRenderer";
import ResearchBriefRenderer from "./ResearchBriefRenderer";
import SupervisorRenderer from "./SupervisorRenderer";
import FinalReportRenderer from "./FinalReportRenderer";

/**
 * Register all Deep Research component renderers.
 * Call this at app startup to enable specialized rendering.
 */
export function registerDeepResearchRenderers(): void {
  registerRenderer("system:deep_research:clarify", ClarificationRenderer);
  registerRenderer("system:deep_research:brief", ResearchBriefRenderer);
  registerRenderer("system:deep_research:supervisor", SupervisorRenderer);
  registerRenderer("system:deep_research:final_report", FinalReportRenderer);
}

// Export individual renderers for potential direct use
export {
  ClarificationRenderer,
  ResearchBriefRenderer,
  SupervisorRenderer,
  FinalReportRenderer,
};
