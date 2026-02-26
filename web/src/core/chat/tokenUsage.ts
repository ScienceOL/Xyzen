import type { ModelInfo } from "@/types/llmProvider";

export const TIER_LIMITS: Record<string, number> = {
  lite: 256_000,
  standard: 1_000_000,
  pro: 1_000_000,
  ultra: 1_000_000,
};

function toPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

export function normalizeTotalTokens(
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
  totalTokens: number | null | undefined,
): number {
  const normalizedInput = Math.max(0, Math.floor(inputTokens ?? 0));
  const normalizedOutput = Math.max(0, Math.floor(outputTokens ?? 0));
  const normalizedTotal = Math.max(0, Math.floor(totalTokens ?? 0));
  return normalizedTotal > 0
    ? normalizedTotal
    : normalizedInput + normalizedOutput;
}

export function resolveContextLimit(params: {
  modelTier: string | null;
  providerId: string | null;
  model: string | null;
  availableModels: Record<string, ModelInfo[]> | undefined;
}): number {
  const { modelTier, providerId, model, availableModels } = params;
  const tierKey = modelTier ?? "";

  // When tier is known, use the platform-defined limit directly.
  // Model metadata (max_input_tokens) reflects the model's native capacity,
  // not the context window Xyzen actually provisions for each tier.
  if (tierKey in TIER_LIMITS) {
    return TIER_LIMITS[tierKey];
  }

  // Tier unknown — fall back to model metadata, then default.
  if (providerId && model && availableModels) {
    const modelInfo = (availableModels[providerId] ?? []).find(
      (candidate) => candidate.key === model || candidate.model_name === model,
    );
    if (modelInfo) {
      const maxInput = toPositiveInteger(modelInfo.max_input_tokens);
      if (maxInput) return maxInput;

      const maxTokens = toPositiveInteger(modelInfo.max_tokens);
      if (maxTokens) return maxTokens;
    }
  }

  return TIER_LIMITS.standard;
}
