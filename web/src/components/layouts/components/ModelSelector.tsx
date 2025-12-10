"use client";

import { CpuChipIcon } from "@heroicons/react/24/outline";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LlmProviderResponse, ModelInfo } from "@/types/llmProvider";
import type { Agent } from "@/types/agents";
import { useMemo, useEffect, useState } from "react";
import { providerCore } from "@/core/provider";

interface ModelSelectorProps {
  currentAgent: Agent;
  currentSessionProvider?: string | null;
  currentSessionModel?: string | null;
  llmProviders: LlmProviderResponse[];
  availableModels: Record<string, ModelInfo[]>;
  onModelChange: (providerId: string, model: string) => void;
}

export function ModelSelector({
  currentAgent,
  currentSessionProvider,
  currentSessionModel,
  llmProviders,
  availableModels,
  onModelChange,
}: ModelSelectorProps) {
  // Fetch default model config from system
  const [defaultModelConfig, setDefaultModelConfig] = useState<{
    provider: string;
    model: string;
  } | null>(null);

  useEffect(() => {
    providerCore
      .getDefaultProviderAndModel(llmProviders)
      .then(({ providerId, model }) => {
        if (providerId && model) {
          // Find the provider to get its type
          const provider = llmProviders.find((p) => p.id === providerId);
          if (provider) {
            setDefaultModelConfig({
              provider: provider.provider_type,
              model: model,
            });
          }
        }
      })
      .catch((error) => {
        console.error("Failed to fetch default model config:", error);
      });
  }, [llmProviders]);

  // Group models by provider
  const modelsByProvider = useMemo(() => {
    const groups: Array<{
      provider: LlmProviderResponse;
      models: ModelInfo[];
    }> = [];

    for (const provider of llmProviders) {
      const models = availableModels[provider.id];
      if (models && models.length > 0) {
        groups.push({
          provider,
          models,
        });
      }
    }

    return groups;
  }, [llmProviders, availableModels]);

  // Find current selection
  const currentSelection = useMemo(() => {
    if (!currentSessionProvider || !currentSessionModel) {
      // Fallback to agent's provider if session doesn't have one
      if (currentAgent.provider_id && currentAgent.model) {
        const agentProvider = llmProviders.find(
          (p) => p.id === currentAgent.provider_id,
        );
        return {
          providerId: currentAgent.provider_id,
          model: currentAgent.model,
          provider: agentProvider || null,
        };
      }

      // Fallback to default model config if available
      if (defaultModelConfig) {
        // Find system provider matching the default provider type
        const systemProvider = llmProviders.find(
          (p) => p.provider_type === defaultModelConfig.provider && p.is_system,
        );
        if (systemProvider) {
          return {
            providerId: systemProvider.id,
            model: defaultModelConfig.model,
            provider: systemProvider,
          };
        }
      }

      return {
        providerId: null,
        model: null,
        provider: null,
      };
    }

    const provider = llmProviders.find((p) => p.id === currentSessionProvider);
    return {
      providerId: currentSessionProvider,
      model: currentSessionModel,
      provider: provider || null,
    };
  }, [
    currentSessionProvider,
    currentSessionModel,
    currentAgent,
    llmProviders,
    defaultModelConfig,
  ]);

  // Auto-apply default model config when it's loaded and no selection exists
  useEffect(() => {
    if (
      !currentSessionProvider &&
      !currentSessionModel &&
      !currentAgent.provider_id &&
      !currentAgent.model &&
      currentSelection.providerId &&
      currentSelection.model &&
      defaultModelConfig
    ) {
      // Only trigger if we have a valid default selection
      onModelChange(currentSelection.providerId, currentSelection.model);
    }
  }, [
    currentSessionProvider,
    currentSessionModel,
    currentAgent.provider_id,
    currentAgent.model,
    currentSelection.providerId,
    currentSelection.model,
    defaultModelConfig,
    onModelChange,
  ]);

  if (llmProviders.length === 0) {
    return (
      <button
        className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
        title="请先添加LLM提供商"
      >
        <CpuChipIcon className="h-4 w-4" />
        <span>未设置提供商</span>
      </button>
    );
  }

  const getProviderBgColor = (providerType: string) => {
    switch (providerType.toLowerCase()) {
      case "openai":
        return "bg-green-100 dark:bg-green-900/30";
      case "azure_openai":
        return "bg-blue-100 dark:bg-blue-900/30";
      case "anthropic":
        return "bg-orange-100 dark:bg-orange-900/30";
      case "google":
      case "google_vertex":
        return "bg-indigo-100 dark:bg-indigo-900/30";
      default:
        return "bg-purple-100 dark:bg-purple-900/30";
    }
  };

  const getProviderTextColor = (providerType: string) => {
    switch (providerType.toLowerCase()) {
      case "openai":
        return "text-green-700 dark:text-green-400";
      case "azure_openai":
        return "text-blue-700 dark:text-blue-400";
      case "anthropic":
        return "text-orange-700 dark:text-orange-400";
      case "google":
      case "google_vertex":
        return "text-indigo-700 dark:text-indigo-400";
      default:
        return "text-purple-700 dark:text-purple-400";
    }
  };

  const displayText = currentSelection.provider
    ? `${currentSelection.provider.name} • ${currentSelection.model || "未选择模型"}`
    : "选择模型";

  const currentValue =
    currentSelection.providerId && currentSelection.model
      ? `${currentSelection.providerId}:${currentSelection.model}`
      : "";

  return (
    <Select
      value={currentValue}
      onValueChange={(value) => {
        const [providerId, model] = value.split(":");
        if (providerId && model) {
          onModelChange(providerId, model);
        }
      }}
    >
      <SelectTrigger
        className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium border-none shadow-none transition-colors hover:opacity-80 ${
          currentSelection.provider
            ? `${getProviderBgColor(currentSelection.provider.provider_type)} ${getProviderTextColor(currentSelection.provider.provider_type)}`
            : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
        }`}
        title={displayText}
      >
        <CpuChipIcon className="h-4 w-4" />
        <SelectValue placeholder="选择模型">
          <span className="max-w-[200px] truncate">{displayText}</span>
        </SelectValue>
      </SelectTrigger>

      <SelectContent className="max-w-[400px] max-h-[500px]">
        {modelsByProvider.map(({ provider, models }) => (
          <SelectGroup key={provider.id}>
            <SelectLabel className="flex items-center gap-2 px-2 py-1.5">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${getProviderBgColor(provider.provider_type)}`}
              />
              <span className="font-semibold">{provider.name}</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                ({provider.provider_type})
              </span>
            </SelectLabel>
            {models.map((model) => (
              <SelectItem
                key={`${provider.id}:${model.key}`}
                value={`${provider.id}:${model.key}`}
                className="pl-6"
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{model.key}</div>
                    {model.max_tokens && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Max tokens: {model.max_tokens.toLocaleString()}
                      </div>
                    )}
                  </div>
                  {model.supports_vision && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 shrink-0">
                      Vision
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
