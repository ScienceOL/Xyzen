import { useState } from "react";
import { useXyzen } from "@/store";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { AdminAuthForm } from "./AdminAuthForm";
import { CodeGenerationForm } from "./CodeGenerationForm";
import { CodesList } from "./CodesList";

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

export function SecretCodePage() {
  const { backendUrl } = useXyzen();
  const [adminSecret, setAdminSecret] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [newCode, setNewCode] = useState<GeneratedCode | undefined>(undefined);

  const getBackendUrl = () => {
    if (!backendUrl || backendUrl === "") {
      if (typeof window !== "undefined") {
        return `${window.location.protocol}//${window.location.host}`;
      }
    }
    return backendUrl;
  };

  const verifySecretKey = async (secretKey: string) => {
    setIsVerifying(true);
    setAuthError(null);

    try {
      // Try to fetch codes list to verify the secret key
      const response = await fetch(
        `${getBackendUrl()}/xyzen/api/v1/redemption/admin/codes?limit=1`,
        {
          headers: {
            "X-Admin-Secret": secretKey,
          },
        },
      );

      if (response.ok) {
        // Secret key is valid
        setAdminSecret(secretKey);
        setIsAuthenticated(true);
      } else if (response.status === 401) {
        setAuthError("Invalid admin secret key");
      } else {
        setAuthError("Failed to verify admin secret key");
      }
    } catch {
      setAuthError("Network error: Failed to verify secret key");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAuthenticated = (secretKey: string) => {
    verifySecretKey(secretKey);
  };

  const handleCodeGenerated = (code: GeneratedCode) => {
    setNewCode(code);
    // Reset newCode after a short delay so it can be added to the list
    setTimeout(() => setNewCode(undefined), 100);
  };

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-neutral-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {isVerifying && (
            <div className="mb-4 text-center">
              <div className="text-white text-sm">Verifying secret key...</div>
            </div>
          )}
          {authError && (
            <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-600 dark:text-red-400 text-center">
              {authError}
            </div>
          )}
          <AdminAuthForm onAuthenticated={handleAuthenticated} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-950 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6 bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                Redemption Code Management
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                Generate and manage redemption codes
              </p>
            </div>
            <button
              onClick={() => (window.location.hash = "")}
              className="rounded-sm p-2 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              title="Close"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Generate Code Form */}
          <CodeGenerationForm
            adminSecret={adminSecret!}
            backendUrl={getBackendUrl()}
            onCodeGenerated={handleCodeGenerated}
          />

          {/* Generated Codes List */}
          <CodesList
            adminSecret={adminSecret!}
            backendUrl={getBackendUrl()}
            newCode={newCode}
          />
        </div>
      </div>
    </div>
  );
}
