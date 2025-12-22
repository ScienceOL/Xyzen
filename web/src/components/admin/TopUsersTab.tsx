import type { UserConsumptionResponse } from "@/service/redemptionService";
import { redemptionService } from "@/service/redemptionService";
import {
  ChartBarIcon,
  CheckCircleIcon,
  UserIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";

interface TopUsersTabProps {
  adminSecret: string;
  backendUrl: string;
}

export function TopUsersTab({ adminSecret }: TopUsersTabProps) {
  const [users, setUsers] = useState<UserConsumptionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);

  const fetchTopUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await redemptionService.getTopUsersByConsumption(
        adminSecret,
        limit,
      );
      setUsers(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch top users",
      );
    } finally {
      setLoading(false);
    }
  }, [adminSecret, limit]);

  useEffect(() => {
    fetchTopUsers();
  }, [fetchTopUsers]);

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-neutral-500 dark:text-neutral-400">
          Loading top users...
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

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label
            htmlFor="limit-select"
            className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Show top:
          </label>
          <select
            id="limit-select"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={10}>10 users</option>
            <option value={20}>20 users</option>
            <option value={50}>50 users</option>
            <option value={100}>100 users</option>
          </select>
        </div>

        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          Total: {users.length} users
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/30 dark:to-orange-900/30 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-2 mb-1">
            <ChartBarIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            <h3 className="text-sm font-medium text-orange-900 dark:text-orange-100">
              Total Consumption
            </h3>
          </div>
          <p className="text-2xl font-bold text-orange-900 dark:text-orange-50">
            {formatNumber(users.reduce((sum, u) => sum + u.total_amount, 0))}
          </p>
        </div>

        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950/30 dark:to-cyan-900/30 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            <h3 className="text-sm font-medium text-cyan-900 dark:text-cyan-100">
              Total Requests
            </h3>
          </div>
          <p className="text-2xl font-bold text-cyan-900 dark:text-cyan-50">
            {formatNumber(users.reduce((sum, u) => sum + u.total_count, 0))}
          </p>
        </div>

        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/30 dark:to-indigo-900/30 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center gap-2 mb-1">
            <UserIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
              Active Users
            </h3>
          </div>
          <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-50">
            {users.length}
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
            <thead className="bg-neutral-50 dark:bg-neutral-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Total Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Requests
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Success
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Failed
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Success Rate
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-700">
              {users.map((user, index) => (
                <tr
                  key={user.user_id}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                        index === 0
                          ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                          : index === 1
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                            : index === 2
                              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                      }`}
                    >
                      {index + 1}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-5 w-5 text-neutral-400" />
                      <div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-white">
                          {user.username}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-xs">
                          {user.user_id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
                      {user.auth_provider}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-neutral-900 dark:text-white">
                    {formatNumber(user.total_amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900 dark:text-white">
                    {formatNumber(user.total_count)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <div className="flex items-center justify-end gap-1 text-green-600 dark:text-green-400">
                      <CheckCircleIcon className="h-4 w-4" />
                      {formatNumber(user.success_count)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <div className="flex items-center justify-end gap-1 text-red-600 dark:text-red-400">
                      <XCircleIcon className="h-4 w-4" />
                      {formatNumber(user.failed_count)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <div className="flex items-center justify-end">
                      <div className="w-20">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 dark:bg-green-600 rounded-full"
                              style={{
                                width: `${user.total_count > 0 ? (user.success_count / user.total_count) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-12 text-right">
                            {user.total_count > 0
                              ? Math.round(
                                  (user.success_count / user.total_count) * 100,
                                )
                              : 0}
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {users.length === 0 && (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          No consumption data available
        </div>
      )}
    </div>
  );
}
