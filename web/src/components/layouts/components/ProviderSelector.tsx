"use client";

import { CpuChipIcon } from "@heroicons/react/24/outline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LlmProviderResponse } from "@/types/llmProvider";
import type { Agent } from "@/types/agents";

interface ProviderSelectorProps {
  currentAgent: Agent;
  currentProvider: LlmProviderResponse | null;
  llmProviders: LlmProviderResponse[];
  onProviderChange: (providerId: string) => void;
}

export function ProviderSelector({
  currentAgent,
  currentProvider,
  llmProviders,
  onProviderChange,
}: ProviderSelectorProps) {
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

  const getProviderBgColor = (provider: LlmProviderResponse | null) => {
    if (!provider) return "bg-neutral-200 dark:bg-neutral-700";

    // Different colors for different provider types
    switch (provider.provider_type.toLowerCase()) {
      case "openai":
        return "bg-green-100 dark:bg-green-900/30";
      case "azure_openai":
        return "bg-blue-100 dark:bg-blue-900/30";
      case "anthropic":
        return "bg-orange-100 dark:bg-orange-900/30";
      case "google":
        return "bg-red-100 dark:bg-red-900/30";
      default:
        return "bg-purple-100 dark:bg-purple-900/30";
    }
  };

  const getProviderTextColor = (provider: LlmProviderResponse | null) => {
    if (!provider) return "text-neutral-700 dark:text-neutral-300";

    switch (provider.provider_type.toLowerCase()) {
      case "openai":
        return "text-green-700 dark:text-green-400";
      case "azure_openai":
        return "text-blue-700 dark:text-blue-400";
      case "anthropic":
        return "text-orange-700 dark:text-orange-400";
      case "google":
        return "text-red-700 dark:text-red-400";
      default:
        return "text-purple-700 dark:text-purple-400";
    }
  };

  return (
    <Select
      value={currentAgent.provider_id || ""}
      onValueChange={onProviderChange}
    >
      <SelectTrigger
        className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium border-none shadow-none transition-colors hover:opacity-80 ${getProviderBgColor(currentProvider)} ${getProviderTextColor(currentProvider)}`}
        title={
          currentProvider
            ? `${currentProvider.name} (${currentProvider.model})`
            : "选择提供商"
        }
      >
        <CpuChipIcon className="h-4 w-4" />
        <SelectValue placeholder="选择提供商">
          <span>{currentProvider?.name || "选择提供商"}</span>
        </SelectValue>
      </SelectTrigger>

      <SelectContent className="min-w-[280px]">
        {llmProviders.map((provider) => (
          <SelectItem key={provider.id} value={provider.id}>
            <div className="flex items-center gap-2 w-full">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${getProviderBgColor(provider)}`}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{provider.name}</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {provider.provider_type} • {provider.model}
                </div>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
