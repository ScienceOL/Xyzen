import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { redemptionService } from "@/service/redemptionService";
import { Button } from "@/components/ui/button";
import { TicketIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

export function RedemptionSettings() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Mutation for redeeming code
  const redeemMutation = useMutation({
    mutationFn: (code: string) => redemptionService.redeemCode(code),
    onSuccess: (data) => {
      setSuccess(data.message);
      setError(null);
      setCode("");
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess(null);
    },
  });

  const handleRedeem = () => {
    if (!code.trim()) {
      setError("Please enter a redemption code");
      return;
    }
    setError(null);
    setSuccess(null);
    redeemMutation.mutate(code.trim());
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Redemption Code
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Redeem codes to get virtual balance for testing
        </p>
      </div>

      {/* Redeem Code Section */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <TicketIcon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
          <h3 className="font-semibold text-neutral-900 dark:text-white">
            Redeem Code
          </h3>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="redemption-code"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Enter Redemption Code
            </label>
            <div className="flex gap-2">
              <input
                id="redemption-code"
                type="text"
                placeholder="Enter your code"
                value={code}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCode(e.target.value.toUpperCase())
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    handleRedeem();
                  }
                }}
                className="flex-1 rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                disabled={redeemMutation.isPending}
              />
              <Button
                onClick={handleRedeem}
                disabled={redeemMutation.isPending || !code.trim()}
              >
                {redeemMutation.isPending ? "Redeeming..." : "Redeem"}
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5" />
              {success}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
