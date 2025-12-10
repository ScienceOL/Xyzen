import { Input } from "@/components/base/Input";
import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { useXyzen } from "@/store";
import type { LlmProviderCreate, LlmProviderUpdate } from "@/types/llmProvider";
import { ProviderScope } from "@/types/llmProvider";
import { Button, Field, Label, Switch } from "@headlessui/react";
import { useEffect, useState, type ChangeEvent } from "react";

// Azure OpenAI configuration type
interface AzureConfig {
  azure_version?: string;
}

// Type guard for Azure provider config
interface AzureProviderConfig {
  azure_version?: string;
}

function isAzureProviderConfig(config: unknown): config is AzureProviderConfig {
  if (typeof config !== "object" || config === null) {
    return false;
  }

  if (!("azure_version" in config)) {
    return true;
  }

  const azureVersion = (config as Record<string, unknown>).azure_version;
  return azureVersion === undefined || typeof azureVersion === "string";
}

function getAzureVersion(config: AzureProviderConfig): string {
  return typeof config.azure_version === "string"
    ? config.azure_version
    : "2024-02-15-preview";
}

// Helper function to get default API endpoint for provider type
const getDefaultApiEndpoint = (providerType: string): string => {
  const defaultEndpoints: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    azure_openai: "https://YOUR_RESOURCE.openai.azure.com",
    google: "https://generativelanguage.googleapis.com",
    google_vertex: "",
    anthropic: "https://api.anthropic.com",
  };
  return defaultEndpoints[providerType] || "";
};

export const ProviderConfigForm = () => {
  const {
    selectedProviderId,
    providerTemplates,
    llmProviders,
    addProvider,
    updateProvider,
    removeProvider,
    setUserDefaultProvider,
    userDefaultProviderId,
  } = useXyzen();

  const [formData, setFormData] = useState<Partial<LlmProviderCreate>>({
    name: "",
    provider_type: "",
    api: "",
    key: "",
    user_id: "", // This will be set by backend from auth token
    provider_config: {},
  });

  // Azure-specific config state
  const [azureConfig, setAzureConfig] = useState<AzureConfig>({
    azure_version: "2024-02-15-preview",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Load data when selected provider changes
  useEffect(() => {
    setError(null);
    setSuccess(null);

    if (!selectedProviderId) {
      // No selection
      setFormData({
        name: "",
        provider_type: "",
        api: "",
        key: "",
        user_id: "",
        provider_config: {},
      });
      setAzureConfig({
        azure_version: "2024-02-15-preview",
      });
      setIsEditing(false);
      return;
    }

    if (selectedProviderId.startsWith("new:")) {
      // Creating new provider from template
      const templateType = selectedProviderId.replace("new:", "");
      const template = providerTemplates.find((t) => t.type === templateType);
      if (template) {
        setFormData({
          name: `My ${template.display_name}`,
          provider_type: template.type,
          api: getDefaultApiEndpoint(template.type),
          key: "",
          user_id: "",
          provider_config: {},
        });

        // Initialize Azure config if Azure OpenAI
        if (template.type === "azure_openai") {
          setAzureConfig({
            azure_version: "2024-02-15-preview",
          });
        } else {
          setAzureConfig({
            azure_version: "2024-02-15-preview",
          });
        }

        setIsEditing(false);
      }
    } else {
      // Editing existing provider
      const provider = llmProviders.find((p) => p.id === selectedProviderId);
      if (provider) {
        // Check if it's a system provider
        if (provider.is_system) {
          setError("System provider is read-only and cannot be edited.");
          setFormData({
            name: provider.name,
            provider_type: provider.provider_type,
            api: provider.api,
            key: "••••••••", // Mask the key
            user_id: provider.user_id,
            provider_config: provider.provider_config || {},
          });

          // Load Azure config if exists
          if (
            provider.provider_type === "azure_openai" &&
            provider.provider_config &&
            isAzureProviderConfig(provider.provider_config)
          ) {
            setAzureConfig({
              azure_version: getAzureVersion(provider.provider_config),
            });
          }

          setIsEditing(false); // Prevent editing
          return;
        }

        setFormData({
          name: provider.name,
          provider_type: provider.provider_type,
          api: provider.api,
          key: provider.key,
          user_id: provider.user_id,
          provider_config: provider.provider_config || {},
        });

        // Load Azure config if exists
        if (
          provider.provider_type === "azure_openai" &&
          provider.provider_config &&
          isAzureProviderConfig(provider.provider_config)
        ) {
          setAzureConfig({
            azure_version: getAzureVersion(provider.provider_config),
          });
        } else {
          setAzureConfig({
            azure_version: "2024-02-15-preview",
          });
        }

        setIsEditing(true);
      }
    }
  }, [selectedProviderId, providerTemplates, llmProviders]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAzureConfigChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAzureConfig((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      // Validation
      if (!formData.name || !formData.api || !formData.key) {
        setError("Name, API, and Key are required");
        setLoading(false);
        return;
      }

      if (
        isEditing &&
        selectedProviderId &&
        !selectedProviderId.startsWith("new:")
      ) {
        // Update existing provider
        const updateData: LlmProviderUpdate = {
          name: formData.name,
          api: formData.api,
          key: formData.key,
        };

        // Add Azure config if Azure OpenAI
        if (formData.provider_type === "azure_openai") {
          updateData.provider_config = {
            azure_version: azureConfig.azure_version,
          };
        }

        await updateProvider(selectedProviderId, updateData);
        setSuccess("Provider updated successfully!");
      } else {
        // Create new provider
        const createData: LlmProviderCreate = {
          scope: ProviderScope.USER,
          name: formData.name!,
          provider_type: formData.provider_type!,
          api: formData.api!,
          key: formData.key!,
          user_id: "", // Backend will set this
        };

        // Add Azure config if Azure OpenAI
        if (formData.provider_type === "azure_openai") {
          createData.provider_config = {
            azure_version: azureConfig.azure_version,
          };
        }

        await addProvider(createData);
        setSuccess("Provider created successfully!");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save provider");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProviderId || selectedProviderId.startsWith("new:")) return;

    // Check if it's a system provider
    const provider = llmProviders.find((p) => p.id === selectedProviderId);
    if (provider?.is_system) {
      setError(
        "Cannot delete system provider. System providers are read-only.",
      );
      return;
    }

    if (!confirm("Are you sure you want to delete this provider?")) return;

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await removeProvider(selectedProviderId);
      setSuccess("Provider deleted successfully!");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete provider",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async () => {
    if (!selectedProviderId || selectedProviderId.startsWith("new:")) return;

    // Check if it's a system provider
    const provider = llmProviders.find((p) => p.id === selectedProviderId);
    if (provider?.is_system) {
      setError(
        "Cannot set system provider as default. System provider is automatic fallback.",
      );
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      setUserDefaultProvider(selectedProviderId);
      setSuccess("Provider set as default!");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set default provider",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!selectedProviderId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center text-neutral-400">
          <p className="text-lg">选择一个provider模板或已有的provider</p>
          <p className="mt-2 text-sm">在列表中点击开始配置</p>
        </div>
      </div>
    );
  }

  const template = selectedProviderId.startsWith("new:")
    ? providerTemplates.find(
        (t) => t.type === selectedProviderId.replace("new:", ""),
      )
    : providerTemplates.find((t) => t.type === formData.provider_type);

  // Check if current provider is a system provider (read-only)
  const currentProvider = llmProviders.find((p) => p.id === selectedProviderId);
  const isSystemProvider = currentProvider?.is_system || false;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="mb-6 text-xl font-semibold text-neutral-900 dark:text-white">
          {isEditing ? "编辑 Provider" : "新建 Provider"}
          {isSystemProvider && (
            <span className="ml-3 text-sm px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
              系统提供商 (只读)
            </span>
          )}
        </h2>

        {error && (
          <div className="mb-4 rounded-sm bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-sm bg-green-50 p-3 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400">
            {success}
          </div>
        )}

        <div className="space-y-4">
          {/* Provider Type (readonly for existing) */}
          {template && (
            <div className="rounded-sm bg-neutral-50 p-3 dark:bg-neutral-900">
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Provider Type
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
                {template.display_name}
              </div>
              <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {template.models.length} model
                {template.models.length !== 1 ? "s" : ""} available
              </div>
            </div>
          )}

          {/* Name */}
          <Field>
            <Label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Name *
            </Label>
            <Input
              type="text"
              name="name"
              value={formData.name || ""}
              onChange={handleInputChange}
              placeholder="e.g., My Gemini Provider"
              className="mt-1"
              disabled={isSystemProvider}
            />
          </Field>

          {/* API Endpoint */}
          <Field>
            <Label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              API Endpoint {!isSystemProvider && "*"}
            </Label>
            <Input
              type="text"
              name="api"
              value={formData.api || ""}
              onChange={handleInputChange}
              placeholder="e.g., https://api.openai.com/v1"
              className="mt-1"
              disabled={isSystemProvider}
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Default endpoint is pre-filled. Modify if using a custom endpoint
              or proxy.
            </p>
          </Field>

          {/* API Key */}
          <Field>
            <Label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              API Key *
            </Label>
            <Input
              type="password"
              name="key"
              value={formData.key || ""}
              onChange={handleInputChange}
              placeholder="Your API key"
              className="mt-1"
              disabled={isSystemProvider}
            />
          </Field>

          {/* Azure OpenAI Specific Fields */}
          {formData.provider_type === "azure_openai" && (
            <Field>
              <Label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                API Version *
              </Label>
              <Input
                type="text"
                name="azure_version"
                value={azureConfig.azure_version || ""}
                onChange={handleAzureConfigChange}
                placeholder="e.g., 2024-02-15-preview"
                className="mt-1"
                disabled={isSystemProvider}
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Azure OpenAI API version (e.g., 2024-02-15-preview, 2023-05-15)
              </p>
            </Field>
          )}

          {/* Set as Default (for existing providers) */}
          {isEditing && !isSystemProvider && (
            <Field className="flex items-center justify-between">
              <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Default Provider
              </Label>
              <Switch
                checked={userDefaultProviderId === selectedProviderId}
                onChange={handleSetDefault}
                className={`${
                  userDefaultProviderId === selectedProviderId
                    ? "bg-indigo-600"
                    : "bg-neutral-300 dark:bg-neutral-700"
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
              >
                <span
                  className={`${
                    userDefaultProviderId === selectedProviderId
                      ? "translate-x-6"
                      : "translate-x-1"
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </Field>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <div>
            {isEditing && !isSystemProvider && (
              <Button
                onClick={handleDelete}
                disabled={loading}
                className="rounded-sm bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {!isSystemProvider && (
              <Button
                onClick={handleSave}
                disabled={loading}
                className="flex items-center gap-2 rounded-sm bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-700 dark:hover:bg-indigo-800"
              >
                {loading && <LoadingSpinner size="sm" />}
                {isEditing ? "Save Changes" : "Create Provider"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
