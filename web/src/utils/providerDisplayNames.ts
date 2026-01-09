/**
 * Provider display name mapping for frontend
 * Backend uses internal names (e.g., "gpugeek"), frontend displays user-friendly names
 */
export function getProviderDisplayName(providerType: string): string {
  const displayNameMap: Record<string, string> = {
    gpugeek: "Xin",
    azure_openai: "Azure OpenAI",
    google_vertex: "Google Vertex",
    openai: "OpenAI",
    google: "Google",
    qwen: "Qwen",
  };

  return displayNameMap[providerType] || providerType;
}

/**
 * Get provider badge color based on provider type
 * Different colors help distinguish between providers visually
 */
export function getProviderBadgeColor(providerType: string): string {
  const colorMap: Record<string, string> = {
    openai: "bg-emerald-500",
    azure_openai: "bg-blue-500",
    google: "bg-red-500",
    google_vertex: "bg-purple-500",
    gpugeek: "bg-amber-500", // Amber/gold for Xin
    qwen: "bg-cyan-500", // Cyan for Qwen (different from GPUGeek)
  };

  return colorMap[providerType] || "bg-neutral-500";
}
