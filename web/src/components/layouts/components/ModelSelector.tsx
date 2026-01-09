"use client";

import { providerCore } from "@/core/provider";
import type { Agent } from "@/types/agents";
import type { LlmProviderResponse, ModelInfo } from "@/types/llmProvider";
import { getProviderDisplayName } from "@/utils/providerDisplayNames";
import {
  ChevronDownIcon,
  CpuChipIcon,
  EyeIcon,
  GlobeAltIcon,
  MicrophoneIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

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
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredProviderId, setHoveredProviderId] = useState<string | null>(
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

  // Get models for currently hovered provider
  const hoveredProviderModels = useMemo(() => {
    if (!hoveredProviderId) return [];
    return availableModels[hoveredProviderId] || [];
  }, [hoveredProviderId, availableModels]);

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
      case "gpugeek":
        return "bg-purple-500/10 dark:bg-purple-500/20";
      case "qwen":
        return "bg-cyan-500/10 dark:bg-cyan-500/20";
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
      case "gpugeek":
        return "text-purple-700 dark:text-purple-400";
      case "qwen":
        return "text-cyan-700 dark:text-cyan-400";
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
      case "gpugeek":
        return "bg-purple-500";
      case "qwen":
        return "bg-cyan-500";
      default:
        return "bg-purple-500";
    }
  };

  const handleModelClick = (providerId: string, modelKey: string) => {
    onModelChange(providerId, modelKey);
    setIsOpen(false);
    setHoveredProviderId(null);
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

  const hoveredProvider = llmProviders.find((p) => p.id === hoveredProviderId);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => {
        setIsOpen(false);
        setHoveredProviderId(null);
      }}
    >
      {/* Main Trigger Button */}
      <motion.button
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
          currentProvider
            ? `${getProviderBgColor(currentProvider.provider_type)} ${getProviderTextColor(currentProvider.provider_type)}`
            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
        } ${isOpen ? "shadow-md" : "shadow-sm"}`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <CpuChipIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-50 truncate">
          {currentSelection.model || "选择模型"}
        </span>
        <ChevronDownIcon
          className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </motion.button>

      {/* Dropdown Content */}
      <AnimatePresence>
        {isOpen && (
          <div className="absolute bottom-full left-0 mb-1 z-50">
            {/* Desktop View: Two-column layout */}
            <div className="hidden sm:block">
              {/* Provider List */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className="w-70 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900 p-2"
              >
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  选择提供商
                </div>
                <div
                  className="space-y-1 overflow-y-auto custom-scrollbar"
                  style={{ maxHeight: "min(320px, 50vh)" }}
                >
                  {providersWithCounts.map(
                    ({ provider, modelCount }, index) => (
                      <motion.div
                        key={provider.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03, duration: 0.2 }}
                        onMouseEnter={() => setHoveredProviderId(provider.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors cursor-pointer ${
                          currentSelection.providerId === provider.id
                            ? `${getProviderBgColor(provider.provider_type)} ${getProviderTextColor(provider.provider_type)}`
                            : hoveredProviderId === provider.id
                              ? "bg-neutral-100 dark:bg-neutral-800"
                              : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 shrink-0 rounded-full ${getProviderDotColor(provider.provider_type)}`}
                          />
                          <span className="font-medium">
                            {/*{provider.is_system
                              ? getProviderDisplayName(provider.provider_type)
                              : provider.name}*/}
                            {getProviderDisplayName(provider.provider_type)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-neutral-400">
                            {modelCount} 个模型
                          </span>
                          <ChevronDownIcon className="h-3.5 w-3.5 -rotate-90 text-neutral-400" />
                        </div>
                      </motion.div>
                    ),
                  )}
                </div>
              </motion.div>

              {/* Model List - Appears on right when hovering a provider */}
              <AnimatePresence>
                {hoveredProviderId && hoveredProviderModels.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-0 left-[288px] w-[320px] rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900 p-2"
                    onMouseEnter={() => setHoveredProviderId(hoveredProviderId)}
                  >
                    {/* Model List Header */}
                    <div className="mb-2 flex items-center gap-2 px-2 py-1 border-b border-neutral-200 dark:border-neutral-700">
                      {hoveredProvider && (
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <div
                            className={`h-2 w-2 rounded-full ${getProviderDotColor(hoveredProvider.provider_type)}`}
                          />
                          <span className="text-neutral-700 dark:text-neutral-300">
                            {hoveredProvider.is_system
                              ? getProviderDisplayName(
                                  hoveredProvider.provider_type,
                                )
                              : hoveredProvider.name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Model List Items */}
                    <div
                      className="space-y-1 overflow-y-auto custom-scrollbar"
                      style={{ maxHeight: "min(320px, 50vh)" }}
                    >
                      {hoveredProviderModels.map((model, index) => (
                        <motion.button
                          key={model.key}
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02, duration: 0.2 }}
                          onClick={() =>
                            handleModelClick(hoveredProviderId, model.key)
                          }
                          className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                            currentSelection.providerId === hoveredProviderId &&
                            currentSelection.model === model.key
                              ? "bg-neutral-200 dark:bg-neutral-700"
                              : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              {model.key}
                            </div>
                          </div>
                          <CapabilityIcons model={model} />
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile View: Single unified list */}
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="sm:hidden w-[90vw] max-w-[360px] rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900 p-2 overflow-hidden"
            >
              <div
                className="space-y-3 overflow-y-auto custom-scrollbar"
                style={{ maxHeight: "min(320px, 40vh)" }}
              >
                {providersWithCounts.map(({ provider, modelCount }) => {
                  const models = availableModels[provider.id] || [];
                  if (models.length === 0) return null;

                  return (
                    <div key={provider.id} className="space-y-1">
                      {/* Provider Header */}
                      <div className="sticky top-0 z-10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm px-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-2 w-2 shrink-0 rounded-full ${getProviderDotColor(provider.provider_type)}`}
                            />
                            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                              {provider.is_system
                                ? getProviderDisplayName(provider.provider_type)
                                : provider.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-400">
                            {modelCount}
                          </span>
                        </div>
                      </div>

                      {/* Models Grid */}
                      <div className="grid grid-cols-1 gap-1 px-1">
                        {models.map((model) => (
                          <button
                            key={model.key}
                            onClick={() =>
                              handleModelClick(provider.id, model.key)
                            }
                            className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                              currentSelection.providerId === provider.id &&
                              currentSelection.model === model.key
                                ? "bg-neutral-100 dark:bg-neutral-800"
                                : "active:bg-neutral-50 dark:active:bg-neutral-800/50"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                {model.key}
                              </div>
                            </div>
                            <CapabilityIcons model={model} />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
