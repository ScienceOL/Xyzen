import { Input } from "@/components/base/Input";
import { Modal } from "@/components/base/Modal";
import { useXyzen } from "@/store";
import type { LlmProviderCreate } from "@/types/llmProvider";
import { Button, Field, Label } from "@headlessui/react";
import { useState, type ChangeEvent } from "react";

export function AddLlmProviderModal() {
  const { isAddLlmProviderModalOpen, closeAddLlmProviderModal, addProvider } =
    useXyzen();
  const [newProvider, setNewProvider] = useState<
    Omit<LlmProviderCreate, "user_id" | "provider_type">
  >({
    name: "",
    api: "",
    key: "",
    model: "",
    max_tokens: 4096,
    temperature: 0.7,
    timeout: 60,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewProvider((prev) => ({
      ...prev,
      [name]:
        name === "max_tokens" || name === "temperature" || name === "timeout"
          ? value === ""
            ? Number(0)
            : Number(value)
          : value,
    }));
  };

  const handleReset = () => {
    setNewProvider({
      name: "",
      api: "",
      key: "",
      model: "",
      max_tokens: 4096,
      temperature: 0.7,
      timeout: 60,
    });
    setError(null);
  };

  const handleAddProvider = async () => {
    setError(null);
    setLoading(true);

    if (
      !newProvider.name ||
      !newProvider.api ||
      !newProvider.key ||
      !newProvider.model
    ) {
      setError("Name, API endpoint, API key, and model are required.");
      setLoading(false);
      return;
    }

    try {
      await addProvider({
        ...newProvider,
        provider_type: "openai",
        user_id: "",
      } as LlmProviderCreate);
      handleReset();
      closeAddLlmProviderModal();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to add provider",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    handleReset();
    closeAddLlmProviderModal();
  };

  const getProviderTemplates = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("openai") && !lowerName.includes("azure")) {
      return {
        api: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
      };
    } else if (lowerName.includes("azure")) {
      return {
        api: "https://your-resource.openai.azure.com/",
        model: "gpt-4o",
      };
    } else if (
      lowerName.includes("anthropic") ||
      lowerName.includes("claude")
    ) {
      return {
        api: "https://api.anthropic.com",
        model: "claude-3-haiku-20240307",
      };
    }
    return {};
  };

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    const templates = getProviderTemplates(value);
    setNewProvider((prev) => ({
      ...prev,
      name: value,
      ...templates,
    }));
  };

  return (
    <Modal
      isOpen={isAddLlmProviderModalOpen}
      onClose={handleClose}
      title="Add LLM Provider"
    >
      <div className="space-y-4">
        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Provider Name *
          </Label>
          <Input
            name="name"
            value={newProvider.name}
            onChange={handleNameChange}
            placeholder="e.g., OpenAI GPT-4, Azure OpenAI, Claude"
            className="mt-1"
          />
        </Field>

        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            API Endpoint *
          </Label>
          <Input
            name="api"
            value={newProvider.api}
            onChange={handleInputChange}
            placeholder="https://api.openai.com/v1"
            className="mt-1"
          />
        </Field>

        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            API Key *
          </Label>
          <Input
            name="key"
            type="password"
            value={newProvider.key}
            onChange={handleInputChange}
            placeholder="sk-..."
            className="mt-1"
          />
        </Field>

        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Model *
          </Label>
          <Input
            name="model"
            value={newProvider.model}
            onChange={handleInputChange}
            placeholder="gpt-4o, claude-3-haiku-20240307"
            className="mt-1"
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Max Tokens
            </Label>
            <Input
              name="max_tokens"
              type="number"
              value={newProvider.max_tokens?.toString() || ""}
              onChange={handleInputChange}
              placeholder="4096"
              className="mt-1"
            />
          </Field>

          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Temperature
            </Label>
            <Input
              name="temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={newProvider.temperature?.toString() || ""}
              onChange={handleInputChange}
              placeholder="0.7"
              className="mt-1"
            />
          </Field>

          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Timeout (s)
            </Label>
            <Input
              name="timeout"
              type="number"
              value={newProvider.timeout?.toString() || ""}
              onChange={handleInputChange}
              placeholder="30"
              className="mt-1"
            />
          </Field>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 dark:bg-red-950/50">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4">
          <Button
            onClick={handleClose}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddProvider}
            disabled={loading}
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            {loading ? "Adding..." : "Add Provider"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
