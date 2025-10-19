import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { useXyzen } from "@/store";
import type {
  LlmProviderResponse,
  ProviderTemplate,
} from "@/types/llmProvider";
import { CheckCircleIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { useEffect } from "react";
import {
  OpenAIIcon,
  AnthropicIcon,
  GoogleIcon,
  AzureIcon,
} from "@/assets/icons";

export const ProviderList = () => {
  const {
    providerTemplates,
    templatesLoading,
    llmProviders,
    llmProvidersLoading,
    fetchProviderTemplates,
    fetchMyProviders,
    setSelectedProvider,
    selectedProviderId,
  } = useXyzen();

  useEffect(() => {
    fetchProviderTemplates();
    fetchMyProviders();
  }, [fetchProviderTemplates, fetchMyProviders]);

  const getProviderIcon = (type: string) => {
    const iconClass = "h-6 w-6";
    switch (type) {
      case "google":
        return <GoogleIcon className={iconClass} />;
      case "openai":
        return <OpenAIIcon className={iconClass} />;
      case "anthropic":
        return <AnthropicIcon className={iconClass} />;
      case "azure_openai":
        return <AzureIcon className={iconClass} />;
      default:
        return <OpenAIIcon className={iconClass} />;
    }
  };

  const handleTemplateClick = (template: ProviderTemplate) => {
    // Set selected provider to null to show "create new" form
    setSelectedProvider(`new:${template.type}`);
  };

  const handleProviderClick = (provider: LlmProviderResponse) => {
    setSelectedProvider(provider.id);
  };

  if (templatesLoading || llmProvidersLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Provider Templates Section */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          添加Provider
        </h3>
        <div className="space-y-1">
          {providerTemplates.map((template) => (
            <button
              key={template.type}
              onClick={() => handleTemplateClick(template)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                selectedProviderId === `new:${template.type}`
                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <div className="flex-shrink-0">
                {getProviderIcon(template.type)}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                  {template.display_name}
                </div>
                <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {template.description}
                </div>
              </div>
              <PlusCircleIcon className="h-5 w-5 flex-shrink-0 text-neutral-400" />
            </button>
          ))}
        </div>
      </div>

      {/* User's Existing Providers Section */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          我的Providers
        </h3>
        {llmProviders.length === 0 ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">
            还没有provider，请添加一个
          </p>
        ) : (
          <div className="space-y-1">
            {llmProviders.map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleProviderClick(provider)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                  selectedProviderId === provider.id
                    ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                <div className="flex-shrink-0">
                  {getProviderIcon(provider.provider_type)}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                      {provider.name}
                    </span>
                    {provider.is_default && (
                      <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-green-500" />
                    )}
                  </div>
                  <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {provider.model}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
