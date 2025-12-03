import { useState } from "react";
import { Button } from "@/components/ui/button";

interface GeneratedCode {
  id: string;
  code: string;
  amount: number;
  max_usage: number;
  current_usage: number;
  is_active: boolean;
  expires_at: string | null;
  description: string | null;
  created_at: string;
}

interface CodeGenerationFormProps {
  adminSecret: string;
  backendUrl: string;
  onCodeGenerated: (code: GeneratedCode) => void;
}

export function CodeGenerationForm({
  adminSecret,
  backendUrl,
  onCodeGenerated,
}: CodeGenerationFormProps) {
  const [amount, setAmount] = useState("10000");
  const [maxUsage, setMaxUsage] = useState("1");
  const [customCode, setCustomCode] = useState("");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    setError(null);
    setSuccess(null);

    if (!amount || parseInt(amount) <= 0) {
      setError("Amount must be a positive number");
      return;
    }

    if (!maxUsage || parseInt(maxUsage) <= 0) {
      setError("Max usage must be a positive number");
      return;
    }

    setIsLoading(true);

    try {
      const payload: {
        amount: number;
        max_usage: number;
        is_active: boolean;
        code?: string;
        description?: string;
        expires_at?: string;
      } = {
        amount: parseInt(amount),
        max_usage: parseInt(maxUsage),
        is_active: isActive,
      };

      if (customCode.trim()) {
        payload.code = customCode.trim().toUpperCase();
      }

      if (description.trim()) {
        payload.description = description.trim();
      }

      if (expiresAt) {
        payload.expires_at = new Date(expiresAt).toISOString();
      }

      const response = await fetch(
        `${backendUrl}/xyzen/api/v1/redemption/admin/codes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Secret": adminSecret,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.detail?.msg || error.detail || "Failed to generate code",
        );
      }

      const data = await response.json();
      setSuccess(`Code generated successfully: ${data.code}`);
      onCodeGenerated(data);

      // Reset form
      setAmount("10000");
      setMaxUsage("1");
      setCustomCode("");
      setDescription("");
      setExpiresAt("");
      setIsActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-6">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
        Generate New Code
      </h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Amount *
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Max Usage *
            </label>
            <input
              type="number"
              value={maxUsage}
              onChange={(e) => setMaxUsage(e.target.value)}
              className="w-full rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Custom Code (optional)
          </label>
          <input
            type="text"
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
            placeholder="Leave empty for auto-generation"
            className="w-full rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Team testing credits"
            className="w-full rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Expires At (optional)
          </label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is-active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-neutral-300 dark:border-neutral-700"
          />
          <label
            htmlFor="is-active"
            className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Active
          </label>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-600 dark:text-green-400">
            {success}
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? "Generating..." : "Generate Code"}
        </Button>
      </div>
    </div>
  );
}
