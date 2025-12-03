import { useState, useEffect } from "react";

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

interface CodesListProps {
  adminSecret: string;
  backendUrl: string;
  newCode?: GeneratedCode;
}

export function CodesList({
  adminSecret,
  backendUrl,
  newCode,
}: CodesListProps) {
  const [codes, setCodes] = useState<GeneratedCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCodes = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${backendUrl}/xyzen/api/v1/redemption/admin/codes?limit=50`,
        {
          headers: {
            "X-Admin-Secret": adminSecret,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load codes");
      }

      const data = await response.json();
      setCodes(data.codes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load codes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = async (codeId: string) => {
    if (!confirm("Are you sure you want to deactivate this code?")) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `${backendUrl}/xyzen/api/v1/redemption/admin/codes/${codeId}/deactivate`,
        {
          method: "POST",
          headers: {
            "X-Admin-Secret": adminSecret,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to deactivate code");
      }

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
  }, []);

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
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">
                  Amount:
                </span>{" "}
                <span className="font-medium text-neutral-900 dark:text-white">
                  {code.amount.toLocaleString()}
                </span>
              </div>
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
