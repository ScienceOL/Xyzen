import { hasFeature } from "@/core/edition/edition";
import { useAuth } from "@/hooks/useAuth";
import { checkInService } from "@/service/checkinService";
import { useQuery } from "@tanstack/react-query";

export function useCheckIn() {
  const auth = useAuth();
  const enabled =
    (auth.isAuthenticated || !!auth.token) && hasFeature("checkIn");
  const query = useQuery({
    queryKey: ["check-in", "status"],
    queryFn: () => checkInService.getStatus(),
    enabled,
  });
  const showDot = enabled && query.data?.checked_in_today === false;

  if (!enabled) return null;
  return { query, showDot };
}
