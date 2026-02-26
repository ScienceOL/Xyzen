import { describe, expect, it } from "vitest";
import { normalizeTotalTokens, resolveContextLimit } from "../tokenUsage";
import type { ModelInfo } from "@/types/llmProvider";

describe("normalizeTotalTokens", () => {
  it("returns provided total_tokens when positive", () => {
    expect(normalizeTotalTokens(100, 40, 999)).toBe(999);
  });

  it("falls back to input + output when total_tokens is missing or zero", () => {
    expect(normalizeTotalTokens(100, 40, 0)).toBe(140);
    expect(normalizeTotalTokens(100, 40, undefined)).toBe(140);
  });
});

describe("resolveContextLimit", () => {
  const availableModels: Record<string, ModelInfo[]> = {
    "provider-1": [
      {
        key: "model-a",
        litellm_provider: "openai",
        mode: "chat",
        max_input_tokens: 120_000,
        max_tokens: 90_000,
      },
      {
        key: "model-b",
        litellm_provider: "openai",
        mode: "chat",
        max_tokens: 64_000,
      },
    ],
  };

  it("prefers model max_input_tokens when available", () => {
    expect(
      resolveContextLimit({
        modelTier: "standard",
        providerId: "provider-1",
        model: "model-a",
        availableModels,
      }),
    ).toBe(120_000);
  });

  it("falls back to model max_tokens when max_input_tokens is absent", () => {
    expect(
      resolveContextLimit({
        modelTier: "standard",
        providerId: "provider-1",
        model: "model-b",
        availableModels,
      }),
    ).toBe(64_000);
  });

  it("falls back to tier limit when model metadata is unavailable", () => {
    expect(
      resolveContextLimit({
        modelTier: "lite",
        providerId: "provider-1",
        model: "missing-model",
        availableModels,
      }),
    ).toBe(256_000);
  });
});
