import { useState } from "react";
import { Button } from "@/components/ui/button";

interface AdminAuthFormProps {
  onAuthenticated: (secretKey: string) => void;
}

export function AdminAuthForm({ onAuthenticated }: AdminAuthFormProps) {
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!secretKey.trim()) {
      setError("Please enter admin secret key");
      return;
    }

    setIsVerifying(true);
    setError(null);

    // Pass the secret key to parent - parent will verify it
    onAuthenticated(secretKey.trim());
    setIsVerifying(false);
  };

  return (
    <div className="fixed inset-0 bg-neutral-950 flex items-center justify-center p-4">
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
            <label
              htmlFor="admin-secret"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Admin Secret Key
            </label>
            <input
              id="admin-secret"
              type="password"
              placeholder="Enter admin secret key"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              className="w-full rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={isVerifying}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isVerifying}>
            {isVerifying ? "Verifying..." : "Access Admin Panel"}
          </Button>
        </form>
      </div>
    </div>
  );
}
