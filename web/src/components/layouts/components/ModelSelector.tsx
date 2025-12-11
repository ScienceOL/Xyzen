"use client";

import {
  CpuChipIcon,
  EyeIcon,
  MicrophoneIcon,
  VideoCameraIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
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
import { motion } from "motion/react";

interface ModelSelectorProps {
  currentAgent: Agent;
  currentSessionProvider?: string | null;
  currentSessionModel?: string | null;
  llmProviders: LlmProviderResponse[];
  availableModels: Record<string, ModelInfo[]>;
  onModelChange: (providerId: string, model: string) => void;
}

interface CapabilityIconProps {
  model: ModelInfo;
}

function CapabilityIcons({ model }: CapabilityIconProps) {
  const icons = [];

  if (model.supports_vision) {
    icons.push(
      <EyeIcon
        key="vision"
        className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400"
        title="Vision Support"
      />,
    );
  }

  if (model.supports_audio_input) {
    icons.push(
      <MicrophoneIcon
        key="audio-in"
        className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400"
        title="Audio Input"
      />,
    );
  }

  if (model.supports_video_input) {
    icons.push(
      <VideoCameraIcon
        key="video"
        className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400"
        title="Video Input"
      />,
    );
  }

  if (model.supports_web_search) {
    icons.push(
      <GlobeAltIcon
        key="web-search"
        className="h-3.5 w-3.5 text-green-600 dark:text-green-400"
        title="Web Search"
      />,
    );
  }

  return icons.length > 0 ? (
    <div className="flex items-center gap-1 shrink-0">{icons}</div>
  ) : null;
}

export function ModelSelector({
  currentAgent,
  currentSessionProvider,
  currentSessionModel,
  llmProviders,
  availableModels,
  onModelChange,
}: ModelSelectorProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  );

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

  // Find current selection
  const currentSelection = useMemo(() => {
    if (!currentSessionProvider || !currentSessionModel) {
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

      if (defaultModelConfig) {
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

  // Set initial selected provider based on current selection
  useEffect(() => {
    if (currentSelection.providerId && !selectedProviderId) {
      setSelectedProviderId(currentSelection.providerId);
    }
  }, [currentSelection.providerId, selectedProviderId]);

  // Auto-apply default model config when loaded and no selection exists
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

  // Get provider display info
  const providersWithCounts = useMemo(() => {
    return llmProviders
      .map((provider) => ({
        provider,
        modelCount: availableModels[provider.id]?.length || 0,
      }))
      .filter((item) => item.modelCount > 0);
  }, [llmProviders, availableModels]);

  // Get models for currently selected provider
  const currentProviderModels = useMemo(() => {
    if (!selectedProviderId) return [];
    return availableModels[selectedProviderId] || [];
  }, [selectedProviderId, availableModels]);

  const getProviderBgColor = (providerType: string) => {
    switch (providerType.toLowerCase()) {
      case "openai":
        return "bg-green-500/10 dark:bg-green-500/20";
      case "azure_openai":
        return "bg-blue-500/10 dark:bg-blue-500/20";
      case "anthropic":
        return "bg-orange-500/10 dark:bg-orange-500/20";
      case "google":
      case "google_vertex":
        return "bg-indigo-500/10 dark:bg-indigo-500/20";
      default:
        return "bg-purple-500/10 dark:bg-purple-500/20";
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

  const getProviderDotColor = (providerType: string) => {
    switch (providerType.toLowerCase()) {
      case "openai":
        return "bg-green-500";
      case "azure_openai":
        return "bg-blue-500";
      case "anthropic":
        return "bg-orange-500";
      case "google":
      case "google_vertex":
        return "bg-indigo-500";
      default:
        return "bg-purple-500";
    }
  };

  if (llmProviders.length === 0) {
    return (
      <button
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        title="请先添加LLM提供商"
      >
        <CpuChipIcon className="h-3.5 w-3.5" />
        <span>未设置</span>
      </button>
    );
  }

  const currentProvider = llmProviders.find(
    (p) => p.id === currentSelection.providerId,
  );

  return (
    <motion.div
      className="flex items-center gap-1"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* Provider Selector */}
      <Select
        value={selectedProviderId || ""}
        onValueChange={(value) => {
          setSelectedProviderId(value);
          const models = availableModels[value];
          if (models && models.length > 0) {
            onModelChange(value, models[0].key);
          }
        }}
      >
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.15 }}
        >
          <SelectTrigger
            className={`h-7 gap-1 rounded-md border-none px-2 text-xs font-medium shadow-none transition-colors hover:opacity-80 ${
              currentProvider
                ? `${getProviderBgColor(currentProvider.provider_type)} ${getProviderTextColor(currentProvider.provider_type)}`
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
          >
            <CpuChipIcon className="h-3.5 w-3.5 shrink-0" />
            <SelectValue placeholder="Provider">
              <span className="max-w-[80px] truncate">
                {currentProvider?.name || "Provider"}
              </span>
            </SelectValue>
          </SelectTrigger>
        </motion.div>

        <SelectContent className="max-w-[240px]">
          <SelectGroup>
            <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Provider
            </SelectLabel>
            {providersWithCounts.map(({ provider, modelCount }, index) => (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03, duration: 0.2 }}
              >
                <SelectItem value={provider.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${getProviderDotColor(provider.provider_type)}`}
                    />
                    <span className="font-medium">{provider.name}</span>
                    <span className="text-xs text-neutral-400">
                      ({modelCount})
                    </span>
                  </div>
                </SelectItem>
              </motion.div>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {/* Divider */}
      <motion.div
        className="h-4 w-px bg-neutral-300 dark:bg-neutral-700"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.2, duration: 0.2 }}
      />

      {/* Model Selector */}
      <Select
        value={
          currentSelection.providerId && currentSelection.model
            ? `${currentSelection.providerId}:${currentSelection.model}`
            : ""
        }
        onValueChange={(value) => {
          const [providerId, model] = value.split(":");
          if (providerId && model) {
            onModelChange(providerId, model);
          }
        }}
        disabled={!selectedProviderId}
      >
        <motion.div
          whileHover={selectedProviderId ? { scale: 1.02 } : {}}
          whileTap={selectedProviderId ? { scale: 0.98 } : {}}
          transition={{ duration: 0.15 }}
        >
          <SelectTrigger
            className={`h-7 gap-1 rounded-md border-none px-2 text-xs font-medium shadow-none transition-colors ${
              selectedProviderId
                ? "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                : "cursor-not-allowed bg-neutral-50 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-600"
            }`}
          >
            <SelectValue placeholder="Model">
              <span className="max-w-[120px] truncate">
                {currentSelection.model || "Model"}
              </span>
            </SelectValue>
          </SelectTrigger>
        </motion.div>

        <SelectContent className="max-w-[360px] max-h-[480px]">
          {selectedProviderId && currentProviderModels.length > 0 && (
            <>
              {currentProviderModels.map((model, index) => (
                <motion.div
                  key={`${selectedProviderId}:${model.key}`}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02, duration: 0.2 }}
                >
                  <SelectItem
                    value={`${selectedProviderId}:${model.key}`}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3 w-full">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-sm">
                          {model.key}
                        </div>
                      </div>
                      <CapabilityIcons model={model} />
                    </div>
                  </SelectItem>
                </motion.div>
              ))}
            </>
          )}

          {selectedProviderId && currentProviderModels.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
              该提供商暂无可用模型
            </div>
          )}
        </SelectContent>
      </Select>
    </motion.div>
  );
}
