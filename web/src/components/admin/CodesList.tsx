import { useState, useEffect, useCallback } from "react";
import { redemptionService, type AdminCode } from "@/service/redemptionService";

interface CodesListProps {
  adminSecret: string;
  backendUrl: string;
  newCode?: AdminCode;
}

export function CodesList({ adminSecret, newCode }: CodesListProps) {
  const [codes, setCodes] = useState<AdminCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await redemptionService.adminListCodes(adminSecret);
      setCodes(data.codes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load codes");
    } finally {
      setIsLoading(false);
    }
  }, [adminSecret]);

  const handleDeactivate = async (codeId: string) => {
    if (!confirm("Are you sure you want to deactivate this code?")) return;

    setIsLoading(true);
    try {
      await redemptionService.adminDeactivateCode(adminSecret, codeId);
      await loadCodes();
      setSuccess("Code deactivated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to deactivate code",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess(`Copied: ${text}`);
    setTimeout(() => setSuccess(null), 2000);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  useEffect(() => {
    if (newCode) {
      setCodes((prev) => [newCode, ...prev]);
    }
  }, [newCode]);

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Generated Codes
        </h2>
        <button
          onClick={loadCodes}
          disabled={isLoading}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
        >
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-600 dark:text-green-400">
          {success}
        </div>
      )}

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {codes.length === 0 && !isLoading && (
          <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
            No codes generated yet
          </div>
        )}

        {isLoading && codes.length === 0 && (
          <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
            Loading codes...
          </div>
        )}

        {codes.map((code) => (
          <div
            key={code.id}
            className="border border-neutral-200 dark:border-neutral-800 rounded-md p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => copyToClipboard(code.code)}
                    className="text-lg font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {code.code}
                  </button>
                  {code.code_type === "subscription" ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400">
                      Subscription
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">
                      Credits
                    </span>
                  )}
                  {!code.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400">
                      Inactive
                    </span>
                  )}
                </div>
                {code.description && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {code.description}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              {code.code_type === "subscription" ? (
                <>
                  <div>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      Plan:
                    </span>{" "}
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {code.role_name}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      Duration:
                    </span>{" "}
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {code.duration_days} days
                    </span>
                  </div>
                </>
              ) : (
                <div>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Amount:
                  </span>{" "}
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {code.amount.toLocaleString()}
                  </span>
                </div>
              )}
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">
                  Usage:
                </span>{" "}
                <span className="font-medium text-neutral-900 dark:text-white">
                  {code.current_usage}/{code.max_usage}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Created:
                </span>{" "}
                <span className="text-neutral-900 dark:text-white">
                  {formatDate(code.created_at)}
                </span>
              </div>
              {code.expires_at && (
                <div className="col-span-2">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Expires:
                  </span>{" "}
                  <span className="text-neutral-900 dark:text-white">
                    {formatDate(code.expires_at)}
                  </span>
                </div>
              )}
            </div>

            {code.is_active && (
              <button
                onClick={() => handleDeactivate(code.id)}
                className="text-xs text-red-600 dark:text-red-400 hover:underline"
                disabled={isLoading}
              >
                Deactivate
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
