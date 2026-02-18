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
import { CodeGenerationForm } from "./CodeGenerationForm";
import { CodesList } from "./CodesList";
import { DailyStatsTab } from "./DailyStatsTab";
import { SubscriptionsTab } from "./SubscriptionsTab";
import { TopUsersTab } from "./TopUsersTab";
import { TrendChartTab } from "./TrendChartTab";
import { UserActivityTab } from "./UserActivityTab";
import { UserRankingsTab } from "./UserRankingsTab";

export function SecretCodePage() {
  const [adminSecret, setAdminSecret] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [newCode, setNewCode] = useState<AdminCode | undefined>(undefined);

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
        <Tabs defaultValue="daily-stats" className="w-full">
          <div className="overflow-x-auto scrollbar-hidden pb-2 -mx-2 px-2">
            <TabsList className="min-w-max">
              <TabsTrigger value="daily-stats">📊 Daily Stats</TabsTrigger>
              <TabsTrigger value="user-activity">👤 User Activity</TabsTrigger>
              <TabsTrigger value="top-users">👥 Top Users</TabsTrigger>
              <TabsTrigger value="trend">📈 Trend Chart</TabsTrigger>
              <TabsTrigger value="rankings">🏆 Rankings</TabsTrigger>
              <TabsTrigger value="subscriptions">📋 Subscriptions</TabsTrigger>
              <TabsTrigger value="codes">🎟️ Codes</TabsTrigger>
            </TabsList>
          </div>

          <TabsContents>
            <TabsContent value="daily-stats">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <DailyStatsTab
                  adminSecret={adminSecret!}
                  backendUrl={http.baseUrl}
                />
              </div>
            </TabsContent>

            <TabsContent value="user-activity">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <UserActivityTab
                  adminSecret={adminSecret!}
                  backendUrl={http.baseUrl}
                />
              </div>
            </TabsContent>

            <TabsContent value="top-users">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <TopUsersTab
                  adminSecret={adminSecret!}
                  backendUrl={http.baseUrl}
                />
              </div>
            </TabsContent>

            <TabsContent value="trend">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <TrendChartTab
                  adminSecret={adminSecret!}
                  backendUrl={http.baseUrl}
                />
              </div>
            </TabsContent>

            <TabsContent value="rankings">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <UserRankingsTab
                  adminSecret={adminSecret!}
                  backendUrl={http.baseUrl}
                />
              </div>
            </TabsContent>

            <TabsContent value="subscriptions">
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6 mt-4 overflow-hidden">
                <SubscriptionsTab
                  adminSecret={adminSecret!}
                  backendUrl={http.baseUrl}
                />
              </div>
            </TabsContent>

            <TabsContent value="codes">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-4 overflow-hidden">
                {/* Generate Code Form */}
                <CodeGenerationForm
                  adminSecret={adminSecret!}
                  backendUrl={http.baseUrl}
                  onCodeGenerated={handleCodeGenerated}
                />

                {/* Generated Codes List */}
                <CodesList
                  adminSecret={adminSecret!}
                  backendUrl={http.baseUrl}
                  newCode={newCode}
                />
              </div>
            </TabsContent>
          </TabsContents>
        </Tabs>
      </div>
    </div>
  );
}
