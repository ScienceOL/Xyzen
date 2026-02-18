import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscriptionService } from "@/service/subscriptionService";
import { redemptionService, type AdminCode } from "@/service/redemptionService";

interface Plan {
  id: string;
  name: string;
  display_name: string;
}

interface CodeGenerationFormProps {
  adminSecret: string;
  backendUrl: string;
  onCodeGenerated: (code: AdminCode) => void;
}

export function CodeGenerationForm({
  adminSecret,
  onCodeGenerated,
}: CodeGenerationFormProps) {
  const [codeType, setCodeType] = useState<"credits" | "subscription">(
    "credits",
  );
  const [amount, setAmount] = useState("10000");
  const [maxUsage, setMaxUsage] = useState("1");
  const [customCode, setCustomCode] = useState("");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [roleName, setRoleName] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (codeType === "subscription" && plans.length === 0) {
      subscriptionService
        .getPlans()
        .then((data) => {
          const loadedPlans: Plan[] = data.plans ?? [];
          setPlans(loadedPlans);
          if (loadedPlans.length > 0 && !roleName) {
            setRoleName(loadedPlans[0].name);
          }
        })
        .catch(() => {
          /* ignore fetch errors */
        });
    }
  }, [codeType, plans.length, roleName]);

  const handleGenerate = async () => {
    setError(null);
    setSuccess(null);

    if (codeType === "credits" && (!amount || parseInt(amount) <= 0)) {
      setError("Amount must be a positive number");
      return;
    }

    if (codeType === "subscription" && !roleName) {
      setError("Please select a subscription plan");
      return;
    }

    if (
      codeType === "subscription" &&
      (!durationDays || parseInt(durationDays) <= 0)
    ) {
      setError("Duration must be a positive number");
      return;
    }

    if (!maxUsage || parseInt(maxUsage) <= 0) {
      setError("Max usage must be a positive number");
      return;
    }

    setIsLoading(true);

    try {
      const payload: Record<string, unknown> = {
        max_usage: parseInt(maxUsage),
        is_active: isActive,
        code_type: codeType,
      };

      if (codeType === "credits") {
        payload.amount = parseInt(amount);
      } else {
        payload.amount = 0;
        payload.role_name = roleName;
        payload.duration_days = parseInt(durationDays);
      }

      if (customCode.trim()) {
        payload.code = customCode.trim().toUpperCase();
      }

      if (description.trim()) {
        payload.description = description.trim();
      }

      if (expiresAt) {
        payload.expires_at = new Date(expiresAt).toISOString();
      }

      const data = await redemptionService.adminCreateCode(
        adminSecret,
        payload,
      );
      setSuccess(`Code generated successfully: ${data.code}`);
      onCodeGenerated(data);

      // Reset form
      setAmount("10000");
      setMaxUsage("1");
      setCustomCode("");
      setDescription("");
      setExpiresAt("");
      setIsActive(true);
      setDurationDays("30");
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
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="code-type"
              checked={codeType === "credits"}
              onChange={() => setCodeType("credits")}
              className="accent-indigo-600"
            />
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Credits
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="code-type"
              checked={codeType === "subscription"}
              onChange={() => setCodeType("subscription")}
              className="accent-indigo-600"
            />
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Subscription
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {codeType === "credits" ? (
            <div>
              <Input
                type="number"
                placeholder="Amount *"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div>
                <select
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                >
                  <option value="" disabled>
                    Select Plan *
                  </option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.name}>
                      {plan.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Input
                  type="number"
                  placeholder="Duration (days) *"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                />
              </div>
            </>
          )}

          {codeType === "credits" && (
            <div>
              <Input
                type="number"
                placeholder="Max Usage *"
                value={maxUsage}
                onChange={(e) => setMaxUsage(e.target.value)}
              />
            </div>
          )}
        </div>

        {codeType === "subscription" && (
          <div>
            <Input
              type="number"
              placeholder="Max Usage *"
              value={maxUsage}
              onChange={(e) => setMaxUsage(e.target.value)}
            />
          </div>
        )}

        <div>
          <Input
            type="text"
            placeholder="Custom Code (optional)"
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
          />
        </div>

        <div>
          <Input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <Input
            type="datetime-local"
            placeholder="Expires At (optional)"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
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
