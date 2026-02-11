import {
  subscriptionService,
  type AdminSubscriptionEntry,
  type SubscriptionRoleRead,
} from "@/service/subscriptionService";
import { UserIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";

interface SubscriptionsTabProps {
  adminSecret: string;
  backendUrl: string;
}

const TIER_COLORS: Record<string, string> = {
  free: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
  standard: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
  professional:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200",
  ultra: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(0)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function SubscriptionsTab({ adminSecret }: SubscriptionsTabProps) {
  const [entries, setEntries] = useState<AdminSubscriptionEntry[]>([]);
  const [plans, setPlans] = useState<SubscriptionRoleRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, planRes] = await Promise.all([
        subscriptionService.adminListSubscriptions(adminSecret),
        subscriptionService.getPlans(),
      ]);
      setEntries(subRes.subscriptions);
      setPlans(planRes.plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAssignRole = async (userId: string, roleId: string) => {
    setAssigning(userId);
    try {
      await subscriptionService.adminAssignRole(adminSecret, {
        user_id: userId,
        role_id: roleId,
      });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign role");
    } finally {
      setAssigning(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-neutral-500 dark:text-neutral-400">
          Loading subscriptions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-4">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  // Count by tier
  const tierCounts = entries.reduce<Record<string, number>>((acc, e) => {
    const name = e.role_name ?? "unknown";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const expiredCount = entries.filter((e) =>
    isExpired(e.subscription.expires_at),
  ).length;

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-linear-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/30 dark:to-indigo-900/30 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center gap-2 mb-1">
            <UserIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
              Total Users
            </h3>
          </div>
          <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-50">
            {entries.length}
          </p>
        </div>
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="bg-white dark:bg-neutral-900 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700"
          >
            <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              {plan.display_name}
            </h3>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
              {tierCounts[plan.name] || 0}
            </p>
          </div>
        ))}
      </div>

      {expiredCount > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {expiredCount} subscription(s) have expired. Users retain existing
            data but cannot upload or generate new content.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
            <thead className="bg-neutral-50 dark:bg-neutral-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-700">
              {entries.map((entry) => {
                const expired = isExpired(entry.subscription.expires_at);
                return (
                  <tr
                    key={entry.subscription.id}
                    className={`hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${expired ? "opacity-60" : ""}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-neutral-900 dark:text-white truncate max-w-xs">
                        {entry.subscription.user_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TIER_COLORS[entry.role_name ?? ""] ?? TIER_COLORS.free}`}
                      >
                        {entry.role_display_name ?? "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={
                          expired
                            ? "text-red-600 dark:text-red-400 font-medium"
                            : "text-neutral-700 dark:text-neutral-300"
                        }
                      >
                        {formatDate(entry.subscription.expires_at)}
                        {expired && " (expired)"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                      {formatDate(entry.subscription.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={entry.subscription.role_id}
                        disabled={assigning === entry.subscription.user_id}
                        onChange={(e) =>
                          handleAssignRole(
                            entry.subscription.user_id,
                            e.target.value,
                          )
                        }
                        className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      >
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.display_name} (
                            {formatBytes(plan.storage_limit_bytes)})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          No subscriptions found
        </div>
      )}
    </div>
  );
}
