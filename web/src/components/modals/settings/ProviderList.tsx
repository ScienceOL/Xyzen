import {
  AnthropicIcon,
  AzureIcon,
  GoogleIcon,
  OpenAIIcon,
} from "@/assets/icons";
import {
  Tabs,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/primitives/radix/tabs";
import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { useXyzen } from "@/store";
import {
  CheckCircleIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export const ProviderList = () => {
  const { t } = useTranslation();
  const {
    providerTemplates,
    templatesLoading,
    llmProviders,
    llmProvidersLoading,
    fetchProviderTemplates,
    fetchMyProviders,
    setSelectedProvider,
    selectedProviderId,
    removeProvider,
  } = useXyzen();

  useEffect(() => {
    fetchProviderTemplates();
    fetchMyProviders();
  }, [fetchProviderTemplates, fetchMyProviders]);

  const getProviderIcon = (type: string) => {
    const iconClass = "h-5 w-5";
    switch (type) {
      case "google":
        return <GoogleIcon className={iconClass} />;
      case "openai":
        return <OpenAIIcon className={iconClass} />;
      case "google_vertex":
        return <GoogleIcon className={iconClass} />;
      case "azure_openai":
        return <AzureIcon className={iconClass} />;
      case "anthropic":
        return <AnthropicIcon className={iconClass} />;
      default:
        return <OpenAIIcon className={iconClass} />;
    }
  };

  const onValueChange = (value: string) => {
    setSelectedProvider(value);
  };

  if (templatesLoading || llmProvidersLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  // Hide system providers from end users.
  // Some backends may omit `is_system`; fall back to provider_type conventions.
  const myProviders = llmProviders.filter((p) => {
    const providerType = p.provider_type;
    const providerName = p.name.toLowerCase();
    const isSystemType =
      providerName === "system" || providerType?.startsWith("system_");
    return !(p.is_system || isSystemType);
  });
  // Filter out system templates if any (though usually templates are for creation)
  const availableTemplates = providerTemplates.filter((t) => {
    if (t.type === "system") return false;
    if (t.type.startsWith("system_")) return false;
    return true;
  });

  const triggerBaseClassName =
    "group relative z-10 flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-medium transition-all hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-neutral-200 dark:data-[state=active]:bg-neutral-800 dark:data-[state=active]:text-indigo-400 dark:data-[state=active]:ring-neutral-700";

  return (
    <Tabs
      value={selectedProviderId || undefined}
      onValueChange={onValueChange}
      className="flex h-full flex-col overflow-hidden mx-2 space-y-4 mt-4"
    >
      <div className="flex-1 overflow-y-auto">
        <TabsHighlight className="relative z-0 space-y-5 p-4">
          {/* My Providers Section */}
          {myProviders.length > 0 && (
            <div>
              <h3 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {t("settings.providers.my.title")}
              </h3>
              <TabsList className="flex flex-col space-y-1">
                {myProviders.map((provider) => (
                  <TabsHighlightItem
                    key={provider.id}
                    value={provider.id}
                    className="w-full rounded-lg"
                  >
                    <div className="group relative z-10 flex w-full items-center gap-2">
                      <TabsTrigger
                        value={provider.id}
                        className={`${triggerBaseClassName} flex-1`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                            {getProviderIcon(provider.provider_type)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{provider.name}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {provider.is_default && (
                            <CheckCircleIcon className="h-5 w-5 text-green-500" />
                          )}
                        </div>
                      </TabsTrigger>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (
                            confirm(
                              t("settings.providers.deleteConfirm", {
                                name: provider.name,
                              }),
                            )
                          ) {
                            removeProvider(provider.id);
                          }
                        }}
                        className="rounded-lg p-2 text-neutral-400 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                        aria-label={t("settings.providers.deleteAria", {
                          name: provider.name,
                        })}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </TabsHighlightItem>
                ))}
              </TabsList>
            </div>
          )}

          {/* Provider Templates Section */}
          <div>
            <h3 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {t("settings.providers.templates.title")}
            </h3>
            <TabsList className="flex flex-col space-y-1">
              {availableTemplates.map((template) => (
                <TabsHighlightItem
                  key={template.type}
                  value={`new:${template.type}`}
                  className="w-full rounded-lg"
                >
                  <TabsTrigger
                    value={`new:${template.type}`}
                    className={triggerBaseClassName}
                  >
                    <div className="flex h-10 w-10 mr-2 shrink-0 items-center justify-center rounded-lg bg-neutral-50 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                      {getProviderIcon(template.type)}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                          {template.display_name}
                        </span>
                        <PlusCircleIcon className="h-5 w-5 text-neutral-400" />
                      </div>
                      <div className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {t("settings.providers.templates.supports", {
                          count: template.models.length,
                        })}
                      </div>
                    </div>
                  </TabsTrigger>
                </TabsHighlightItem>
              ))}
            </TabsList>
          </div>
        </TabsHighlight>
      </div>
    </Tabs>
  );
};
