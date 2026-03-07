import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applicationService,
  type AdminApplicationEntry,
  type ApproveApplicationParams,
} from "@/service/applicationService";
import { subscriptionService } from "@/service/subscriptionService";
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  MagnifyingGlassIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

interface Plan {
  id: string;
  name: string;
  display_name: string;
}

interface InternalApplicationsTabProps {
  adminSecret: string;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-green-50/80 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
        <CheckCircleIcon className="h-3.5 w-3.5" />
        Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-50/80 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-400">
        <XCircleIcon className="h-3.5 w-3.5" />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50/80 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
      Pending
    </span>
  );
}

const CODE_TYPE_LABELS: Record<string, string> = {
  credits: "Credits",
  subscription: "Subscription",
  full_access: "Full Access",
};

function ApproveForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (params: ApproveApplicationParams) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [codeType, setCodeType] = useState<
    "credits" | "subscription" | "full_access"
  >("credits");
  const [amount, setAmount] = useState("10000");
  const [maxUsage, setMaxUsage] = useState("1");
  const [roleName, setRoleName] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [fullAccessDays, setFullAccessDays] = useState("30");
  const [description, setDescription] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (codeType === "subscription" && plans.length === 0) {
      subscriptionService
        .getPlans()
        .then((data) => {
          const loadedPlans: Plan[] = data.plans ?? [];
          setPlans(loadedPlans);
          if (loadedPlans.length > 0 && !roleName) {
            setRoleName(loadedPlans[0].name);
          }
        })
        .catch(() => {});
    }
  }, [codeType, plans.length, roleName]);

  const handleSubmit = () => {
    setError(null);

    if (codeType === "credits" && (!amount || parseInt(amount) <= 0)) {
      setError("Amount must be a positive number");
      return;
    }
    if (codeType === "subscription" && !roleName) {
      setError("Please select a subscription plan");
      return;
    }
    if (
      codeType === "subscription" &&
      (!durationDays || parseInt(durationDays) <= 0)
    ) {
      setError("Duration must be a positive number");
      return;
    }
    if (
      codeType === "full_access" &&
      (!fullAccessDays || parseInt(fullAccessDays) <= 0)
    ) {
      setError("Full access duration must be a positive number");
      return;
    }
    if (!maxUsage || parseInt(maxUsage) <= 0) {
      setError("Max usage must be a positive number");
      return;
    }

    const params: ApproveApplicationParams = {
      code_type: codeType,
      amount: codeType === "credits" ? parseInt(amount) : 0,
      max_usage: parseInt(maxUsage),
      duration_days:
        codeType === "subscription"
          ? parseInt(durationDays)
          : codeType === "full_access"
            ? parseInt(fullAccessDays)
            : 30,
    };

    if (codeType === "subscription") {
      params.role_name = roleName;
    }
    if (description.trim()) {
      params.description = description.trim();
    }

    onSubmit(params);
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-neutral-100/60 p-3 dark:bg-white/[0.04]">
      <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
        Generate Redemption Code
      </p>

      <div className="flex flex-wrap gap-3">
        {(["credits", "subscription", "full_access"] as const).map((type) => (
          <label
            key={type}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <input
              type="radio"
              name="approve-code-type"
              checked={codeType === type}
              onChange={() => setCodeType(type)}
              className="accent-indigo-600"
            />
            <span className="text-xs text-neutral-700 dark:text-neutral-300">
              {CODE_TYPE_LABELS[type]}
            </span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {codeType === "credits" && (
          <>
            <Input
              type="number"
              placeholder="Amount *"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Max Usage *"
              value={maxUsage}
              onChange={(e) => setMaxUsage(e.target.value)}
            />
          </>
        )}

        {codeType === "subscription" && (
          <>
            <select
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            >
              <option value="" disabled>
                Select Plan *
              </option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.name}>
                  {plan.display_name}
                </option>
              ))}
            </select>
            <Input
              type="number"
              placeholder="Duration (days) *"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </>
        )}

        {codeType === "full_access" && (
          <>
            <Input
              type="number"
              placeholder="Duration (days) *"
              value={fullAccessDays}
              onChange={(e) => setFullAccessDays(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Max Usage *"
              value={maxUsage}
              onChange={(e) => setMaxUsage(e.target.value)}
            />
          </>
        )}
      </div>

      {codeType === "subscription" && (
        <Input
          type="number"
          placeholder="Max Usage *"
          value={maxUsage}
          onChange={(e) => setMaxUsage(e.target.value)}
        />
      )}

      <Input
        type="text"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {error && (
        <div className="rounded-md bg-red-50/80 p-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={handleSubmit} disabled={isLoading} size="sm">
          {isLoading ? "Approving..." : "Approve & Generate Code"}
        </Button>
        <Button
          onClick={onCancel}
          variant="outline"
          size="sm"
          disabled={isLoading}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ApplicationCard({
  app,
  adminSecret,
  onUpdated,
}: {
  app: AdminApplicationEntry;
  adminSecret: string;
  onUpdated: (updated: AdminApplicationEntry) => void;
}) {
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async (params: ApproveApplicationParams) => {
    setIsLoading(true);
    setError(null);
    try {
      const updated = await applicationService.adminApproveApplication(
        adminSecret,
        app.id,
        params,
      );
      onUpdated(updated);
      setShowApproveForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!confirm("Are you sure you want to reject this application?")) return;
    setIsLoading(true);
    setError(null);
    try {
      const updated = await applicationService.adminRejectApplication(
        adminSecret,
        app.id,
      );
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (app.redemption_code?.code) {
      navigator.clipboard.writeText(app.redemption_code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-neutral-900">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-neutral-900 dark:text-white">
              {app.real_name}
            </span>
            {app.username && (
              <span className="rounded-md bg-neutral-100/80 px-1.5 py-0.5 text-xs font-medium text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
                @{app.username}
              </span>
            )}
            <StatusBadge status={app.status} />
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {app.serial_number}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{app.company_name}</span>
            <span>{app.company_email}</span>
            {app.total_credits_granted > 0 && (
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                {app.total_credits_granted.toLocaleString()} credits
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
          {formatDate(app.created_at)}
        </span>
      </div>

      {/* Application details */}
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {app.application_items.map((item) => (
            <span
              key={item}
              className="rounded-md bg-indigo-50/80 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400"
            >
              {item}
            </span>
          ))}
        </div>
        <p className="text-[13px] text-neutral-600 dark:text-neutral-400 line-clamp-2">
          {app.reason}
        </p>
      </div>

      {/* Approved: show code details */}
      {app.status === "approved" && app.redemption_code && (
        <div className="mt-3 rounded-lg bg-green-50/80 p-3 dark:bg-green-950/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <code className="rounded bg-white/80 px-2 py-0.5 text-[13px] font-mono font-semibold text-green-800 dark:bg-black/20 dark:text-green-300">
                {app.redemption_code.code}
              </code>
              <button
                onClick={handleCopyCode}
                className="rounded p-1 text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
                title="Copy code"
              >
                <ClipboardDocumentIcon className="h-4 w-4" />
              </button>
              {copied && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  Copied!
                </span>
              )}
            </div>
            <span className="text-xs text-green-600 dark:text-green-400">
              {CODE_TYPE_LABELS[app.redemption_code.code_type] ??
                app.redemption_code.code_type}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-green-700 dark:text-green-400">
            {app.redemption_code.code_type === "credits" && (
              <span>Amount: {app.redemption_code.amount.toLocaleString()}</span>
            )}
            {app.redemption_code.role_name && (
              <span>Plan: {app.redemption_code.role_name}</span>
            )}
            {app.redemption_code.code_type !== "credits" && (
              <span>Duration: {app.redemption_code.duration_days}d</span>
            )}
            <span>
              Usage: {app.redemption_code.current_usage}/
              {app.redemption_code.max_usage}
            </span>
            {app.redeemed_at ? (
              <span className="font-medium">
                Redeemed: {formatDate(app.redeemed_at)}
              </span>
            ) : (
              <span className="text-green-500 dark:text-green-500">
                Not redeemed
              </span>
            )}
          </div>
        </div>
      )}

      {/* Pending: actions */}
      {app.status === "pending" && !showApproveForm && (
        <div className="mt-3 flex items-center gap-2">
          <Button
            onClick={() => setShowApproveForm(true)}
            size="sm"
            disabled={isLoading}
          >
            Approve
          </Button>
          <Button
            onClick={handleReject}
            variant="outline"
            size="sm"
            disabled={isLoading}
          >
            Reject
          </Button>
        </div>
      )}

      {/* Approve form */}
      {app.status === "pending" && showApproveForm && (
        <ApproveForm
          onSubmit={handleApprove}
          onCancel={() => setShowApproveForm(false)}
          isLoading={isLoading}
        />
      )}

      {error && (
        <div className="mt-2 rounded-md bg-red-50/80 p-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

export function InternalApplicationsTab({
  adminSecret,
}: InternalApplicationsTabProps) {
  const [applications, setApplications] = useState<AdminApplicationEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [company, setCompany] = useState("");
  const [companies, setCompanies] = useState<string[]>([]);
  const limit = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Fetch companies for the filter dropdown
  useEffect(() => {
    applicationService
      .adminGetCompanies(adminSecret)
      .then(setCompanies)
      .catch(() => {});
  }, [adminSecret]);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Reset offset when company filter changes
  useEffect(() => {
    setOffset(0);
  }, [company]);

  const fetchApplications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await applicationService.adminListApplications(
        adminSecret,
        limit,
        offset,
        debouncedSearch || undefined,
        company || undefined,
      );
      setApplications(data.applications);
      setTotal(data.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load applications",
      );
    } finally {
      setIsLoading(false);
    }
  }, [adminSecret, offset, debouncedSearch, company]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleUpdated = (updated: AdminApplicationEntry) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a)),
    );
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Internal Applications
        </h2>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {total} total
        </span>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            type="text"
            placeholder="Search by name, username, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="flex h-10 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
        >
          <option value="">All Companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50/80 p-3 text-[13px] text-red-600 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="py-12 text-center text-sm text-neutral-400">
          Loading applications...
        </div>
      )}

      {/* Empty */}
      {!isLoading && applications.length === 0 && !error && (
        <div className="py-12 text-center text-sm text-neutral-400">
          No applications found
        </div>
      )}

      {/* Application cards */}
      {!isLoading && applications.length > 0 && (
        <div className="space-y-3">
          {applications.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              adminSecret={adminSecret}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
          >
            Previous
          </Button>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Page {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(offset + limit)}
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
