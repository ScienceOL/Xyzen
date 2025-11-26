import { AzureIcon, GoogleIcon, OpenAIIcon } from "@/assets/icons";
import {
  Tabs,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/primitives/radix/tabs";
import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { useXyzen } from "@/store";
// (Types imported previously not needed after refactor)
import { CheckCircleIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { useEffect } from "react";

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
      case "google_vertex":
        return <GoogleIcon className={iconClass} />;
      case "azure_openai":
        return <AzureIcon className={iconClass} />;
      default:
        return <OpenAIIcon className={iconClass} />;
    }
  };

  const onValueChange = (value: string | undefined) => {
    if (value) setSelectedProvider(value);
  };

  if (templatesLoading || llmProvidersLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <Tabs
      value={selectedProviderId || undefined}
      onValueChange={onValueChange}
      className="flex h-full flex-col overflow-hidden"
    >
      <TabsHighlight className="relative z-0 bg-indigo-50 dark:bg-indigo-950/30 rounded-sm">
        {/* Provider Templates Section */}
        <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            添加Provider
          </h3>
          <TabsList className="flex flex-col gap-1">
            {providerTemplates.map((template) => (
              <TabsHighlightItem
                key={template.type}
                value={`new:${template.type}`}
                className="w-full"
              >
                <TabsTrigger
                  value={`new:${template.type}`}
                  className="relative z-10 flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400"
                >
                  <div className="flex-shrink-0 dark:text-white">
                    {getProviderIcon(template.type)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                      {template.display_name}
                    </div>
                    <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {template.models.length} model
                      {template.models.length !== 1 ? "s" : ""} available
                    </div>
                  </div>
                  <PlusCircleIcon className="h-5 w-5 flex-shrink-0 text-neutral-400" />
                </TabsTrigger>
              </TabsHighlightItem>
            ))}
          </TabsList>
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
            <TabsList className="flex flex-col gap-1">
              {llmProviders.map((provider) => (
                <TabsHighlightItem key={provider.id} value={provider.id}>
                  <TabsTrigger
                    value={provider.id}
                    className="relative z-10 flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400"
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
                  </TabsTrigger>
                </TabsHighlightItem>
              ))}
            </TabsList>
          )}
        </div>
      </TabsHighlight>
    </Tabs>
  );
};
