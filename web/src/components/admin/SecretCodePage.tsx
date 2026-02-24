import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import { http } from "@/service/http/client";
import { redemptionService, type AdminCode } from "@/service/redemptionService";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { AdminAuthForm } from "./AdminAuthForm";
import { AgentMarketplaceTab } from "./AgentMarketplaceTab";
import { ConsumptionAnalyticsTab } from "./ConsumptionAnalyticsTab";
import { RedemptionCodesTab } from "./RedemptionCodesTab";
import { RevenueAnalyticsTab } from "./RevenueAnalyticsTab";
import { SubscriptionManagementTab } from "./SubscriptionManagementTab";
import { UserAnalyticsTab } from "./UserAnalyticsTab";

export function SecretCodePage() {
  const [adminSecret, setAdminSecret] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [newCode, setNewCode] = useState<AdminCode | undefined>(undefined);
  const [newCodeKey, setNewCodeKey] = useState(0);

  const verifySecretKey = async (secretKey: string) => {
    setIsVerifying(true);
    setAuthError(null);

    try {
      // Try to fetch codes list to verify the secret key
      await redemptionService.adminListCodes(secretKey, 1);
      // Secret key is valid
      setAdminSecret(secretKey);
      setIsAuthenticated(true);
    } catch (error) {
      if (
        error instanceof Error &&
        "status" in error &&
        (error as { status: number }).status === 401
      ) {
        setAuthError("Invalid admin secret key");
      } else {
        setAuthError("Failed to verify admin secret key");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAuthenticated = (secretKey: string) => {
    verifySecretKey(secretKey);
  };

  const handleCodeGenerated = (code: AdminCode) => {
    setNewCode(code);
    setNewCodeKey((k) => k + 1);
  };

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-neutral-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <AdminAuthForm
            onAuthenticated={handleAuthenticated}
            isVerifying={isVerifying}
            authError={authError}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-950 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="mb-4 sm:mb-6 bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white truncate">
                Admin Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                Manage redemption codes and view consumption statistics
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

        {/* Tabs */}
        <Tabs defaultValue="consumption" className="w-full">
          <div className="pb-2">
            <TabsList className="w-full">
              <TabsTrigger value="consumption">消费分析</TabsTrigger>
              <TabsTrigger value="users">用户分析</TabsTrigger>
              <TabsTrigger value="revenue">平台收入</TabsTrigger>
              <TabsTrigger value="subscriptions">订阅管理</TabsTrigger>
              <TabsTrigger value="marketplace">Agent市场</TabsTrigger>
              <TabsTrigger value="codes">兑换码</TabsTrigger>
            </TabsList>
          </div>

          <TabsContents>
            <TabsContent value="consumption">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <ConsumptionAnalyticsTab adminSecret={adminSecret!} />
              </div>
            </TabsContent>

            <TabsContent value="users">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <UserAnalyticsTab adminSecret={adminSecret!} />
              </div>
            </TabsContent>

            <TabsContent value="revenue">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <RevenueAnalyticsTab adminSecret={adminSecret!} />
              </div>
            </TabsContent>

            <TabsContent value="subscriptions">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <SubscriptionManagementTab adminSecret={adminSecret!} />
              </div>
            </TabsContent>

            <TabsContent value="marketplace">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <AgentMarketplaceTab adminSecret={adminSecret!} />
              </div>
            </TabsContent>

            <TabsContent value="codes">
              <RedemptionCodesTab
                adminSecret={adminSecret!}
                backendUrl={http.baseUrl}
                newCode={newCode}
                newCodeKey={newCodeKey}
                onCodeGenerated={handleCodeGenerated}
              />
            </TabsContent>
          </TabsContents>
        </Tabs>
      </div>
    </div>
  );
}
