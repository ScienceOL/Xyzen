import { hasFeature } from "@/core/edition/edition";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription, useSubscriptionUsage } from "@/hooks/useSubscription";
import type { ModelTier } from "@/components/layouts/components/TierSelector";

export function useSubscriptionInfo() {
  const auth = useAuth();
  const enabled =
    (auth.isAuthenticated || !!auth.token) && hasFeature("subscription");
  const subQuery = useSubscription(auth.token, enabled);
  const usageQuery = useSubscriptionUsage(auth.token, enabled);

  if (!enabled) return null;

  const roleName = subQuery.data?.role?.name ?? "free";
  const maxTier = (subQuery.data?.effective_max_model_tier ??
    subQuery.data?.role?.max_model_tier ??
    "lite") as ModelTier;
  const userPlan = roleName;

  return { subQuery, usageQuery, roleName, maxTier, userPlan };
}
