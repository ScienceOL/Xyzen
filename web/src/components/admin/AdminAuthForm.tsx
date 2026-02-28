import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AdminAuthFormProps {
  onAuthenticated: (secretKey: string) => void;
  isVerifying?: boolean;
  authError?: string | null;
}

export function AdminAuthForm({
  onAuthenticated,
  isVerifying = false,
  authError = null,
}: AdminAuthFormProps) {
  const [secretKey, setSecretKey] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!secretKey.trim()) {
      setLocalError("Please enter admin secret key");
      return;
    }

    setLocalError(null);
    onAuthenticated(secretKey.trim());
  };

  const displayError = authError || localError;

  return (
    <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-lg shadow-xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
          Admin Access
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
          Enter admin secret key to manage redemption codes
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            id="admin-secret"
            type="password"
            placeholder="Admin Secret Key"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            disabled={isVerifying}
          />
        </div>

        {displayError && (
          <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-600 dark:text-red-400">
            {displayError}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isVerifying}>
          {isVerifying ? "Verifying..." : "Access Admin Panel"}
        </Button>
      </form>
    </div>
  );
}
